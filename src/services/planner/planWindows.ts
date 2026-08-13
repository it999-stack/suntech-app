// src/services/planner/planWindows.ts
// Non-working window resolution and the skip-window scheduling math — see
// pilingPlannerService.ts for the algorithm overview.

import { timeToMinutes, addMinutes } from '@utils/formatTime';
import type { NonWorkingWindowBehavior } from '@db/schema';
import type { EffectiveWindow } from './planTypes';

/**
 * Mirrors the server's AFTER_CURRENT_STEP_GRACE_MINUTES
 * (suntech-core/modules/piling/daily_checklists/plan_generation_service.py)
 * — kept in sync by the same manual-parity convention as the rest of this
 * file (see the file-level doc comment above). NOT the same concept as the
 * noNewStepCutoffMinutes parameter threaded through this file's scheduling
 * functions (that governs starting a brand new step near the end of the 24h
 * window, and is server-managed via APP_CONFIG — see useAppConfig()); this
 * governs whether an AFTER_CURRENT_STEP break lets an in-progress step's
 * remaining work finish first (<=20min left) or splits around it (>20min
 * left). Do not conflate the two.
 */
const AFTER_CURRENT_STEP_GRACE_MINUTES = 20;

export function resolveWindows(
  raw: Array<{ id: string; label: string; behavior: string; startTime: string; endTime: string }>,
  dayBase: Date,
): EffectiveWindow[] {
  const resolveDay = (base: Date) =>
    raw.map((w) => {
      const wStartMin = timeToMinutes(w.startTime);
      const wEndMin = timeToMinutes(w.endTime);
      const wStart = new Date(base);
      wStart.setHours(Math.floor(wStartMin / 60), wStartMin % 60, 0, 0);
      const wEnd = new Date(base);
      wEnd.setHours(Math.floor(wEndMin / 60), wEndMin % 60, 0, 0);
      if (wEndMin <= wStartMin) wEnd.setDate(wEnd.getDate() + 1);
      return {
        id: w.id,
        label: w.label,
        behavior: w.behavior as NonWorkingWindowBehavior,
        start: wStart,
        end: wEnd,
      };
    });

  const prevDay = new Date(dayBase);
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(dayBase);
  nextDay.setDate(nextDay.getDate() + 1);

  return [
    ...resolveDay(prevDay),
    ...resolveDay(dayBase),
    ...resolveDay(nextDay),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function skipNonWorkingWindows(
  cursor: Date,
  bufferMinutes: number,
  durationMinutes: number,
  windows: EffectiveWindow[],
  isSplittable: boolean = true,
): { start: Date; end: Date } {
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Phase 1: never START a step inside any window (FIXED or
  // AFTER_CURRENT_STEP) — independent of isSplittable. This is about where
  // execution begins, not whether it can be paused once running.
  let current = new Date(cursor);
  let moved = true;
  while (moved) {
    moved = false;
    for (const w of windows) {
      if (current >= w.start && current < w.end) {
        current = new Date(w.end);
        moved = true;
        break;
      }
    }
  }

  const totalMinutes = bufferMinutes + durationMinutes;

  // Steps that can never be paused mid-way (e.g. concreting) run straight
  // through everything once started. FIXED windows simply aren't applied to
  // this step. Any AFTER_CURRENT_STEP window in the way still unconditionally
  // relocates to trail the step (the one behavior that costs the step
  // nothing) — the grace check below is moot since this step can't be
  // blocked to begin with.
  if (!isSplittable) {
    const stepEnd = addMinutes(current, totalMinutes);
    for (const w of windows) {
      if (w.behavior !== 'AFTER_CURRENT_STEP') continue;
      if (w.start < stepEnd && w.end > current) {
        const len = w.end.getTime() - w.start.getTime();
        w.start = new Date(stepEnd);
        w.end = new Date(stepEnd.getTime() + len);
      }
    }
    windows.sort((a, b) => a.start.getTime() - b.start.getTime());
    return { start: current, end: stepEnd };
  }

  // Splittable steps: one unified walk. FIXED windows always block. An
  // AFTER_CURRENT_STEP window blocks too UNLESS, at the point the walk
  // reaches it, AFTER_CURRENT_STEP_GRACE_MINUTES or less of this step's work
  // would still be outstanding — in which case it's deferred to relocate
  // after the step instead (today's only AFTER_CURRENT_STEP behavior). The
  // remaining-work check is evaluated dynamically against `remaining`/
  // `cursor2` as the walk progresses (not against the naive un-split step
  // end), so an earlier block in the same step correctly changes whether a
  // later window still has genuine work ahead of it.
  let remaining = totalMinutes;
  let cursor2 = new Date(current);
  const toRelocate: EffectiveWindow[] = [];
  const graceDecided = new Set<string>();

  while (remaining > 0) {
    const projectedEnd = addMinutes(cursor2, remaining);
    let nextBlocking: EffectiveWindow | null = null;
    for (const w of windows) {
      if (w.behavior !== 'FIXED' && w.behavior !== 'AFTER_CURRENT_STEP') continue;
      if (!(w.start >= cursor2 && w.start < projectedEnd)) continue;
      if (w.behavior === 'AFTER_CURRENT_STEP') {
        if (graceDecided.has(w.id)) continue;
        const workBefore = (w.start.getTime() - cursor2.getTime()) / 60000;
        if (remaining - workBefore <= AFTER_CURRENT_STEP_GRACE_MINUTES) {
          toRelocate.push(w);
          graceDecided.add(w.id);
          continue;
        }
      }
      if (!nextBlocking || w.start.getTime() < nextBlocking.start.getTime()) {
        nextBlocking = w;
      }
    }
    if (!nextBlocking) {
      cursor2 = projectedEnd;
      remaining = 0;
    } else {
      const workBeforeBreak = (nextBlocking.start.getTime() - cursor2.getTime()) / 60000;
      remaining -= workBeforeBreak;
      cursor2 = new Date(nextBlocking.end);
    }
  }

  // Deferred AFTER_CURRENT_STEP windows relocate to the step's true final end
  // (after any FIXED/blocking splits already applied above) so they never
  // land in the middle of still-executing work.
  const stepEnd = cursor2;
  for (const w of toRelocate) {
    const len = w.end.getTime() - w.start.getTime();
    w.start = new Date(stepEnd);
    w.end = new Date(stepEnd.getTime() + len);
  }
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  return { start: current, end: cursor2 };
}
