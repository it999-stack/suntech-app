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

/**
 * Returns the effective buffer alongside the times, because Phase 1 can zero
 * it — callers must persist what was actually used, not what was requested, or
 * the stored bufferMinutes will disagree with the schedule (a step's work
 * start is rendered as plannedStart + bufferMinutes).
 */
export function skipNonWorkingWindows(
  cursor: Date,
  bufferMinutes: number,
  durationMinutes: number,
  windows: EffectiveWindow[],
  isSplittable: boolean = true,
): { start: Date; end: Date; bufferMinutes: number } {
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Phase 1: never START a step inside any window (FIXED or
  // AFTER_CURRENT_STEP) — independent of isSplittable. This is about where
  // execution begins, not whether it can be paused once running.
  //
  // "Start" means where the real WORK begins (cursor + buffer), not merely
  // where the buffer does. Two distinct cases, and the buffer is treated
  // differently in each:
  //
  //   (a) the buffer itself begins inside a window — the machine wasn't free
  //       before the break at all, so setup genuinely still has to happen
  //       afterwards. Push past the window and KEEP the buffer. (Every plan's
  //       first step hits this via the morning shift-change window.)
  //
  //   (b) the buffer straddles the window's start — setup began, then the
  //       break interrupted it and the machine sat idle through the whole
  //       window. Push past the window and DROP the buffer: the idle wait
  //       absorbed the setup, and re-charging it would push real work even
  //       later for no reason.
  //
  // Without (b) a step whose buffer starts just before a break would begin its
  // actual work inside the break — e.g. concreting queued at 12:55 with a
  // 10-minute buffer would "start" at 13:05, mid-lunch.
  let current = new Date(cursor);
  let buffer = bufferMinutes;
  let moved = true;
  while (moved) {
    moved = false;
    for (const w of windows) {
      const workStart = addMinutes(current, buffer);
      if (current >= w.start && current < w.end) {
        // (a)
        current = new Date(w.end);
        moved = true;
        break;
      }
      if (current < w.start && w.start <= workStart && workStart < w.end) {
        // (b)
        current = new Date(w.end);
        buffer = 0;
        moved = true;
        break;
      }
    }
  }

  const totalMinutes = buffer + durationMinutes;

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
    return { start: current, end: stepEnd, bufferMinutes: buffer };
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

  return { start: current, end: cursor2, bufferMinutes: buffer };
}
