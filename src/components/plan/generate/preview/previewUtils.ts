// src/components/plan/generate/preview/previewUtils.ts
//
// Pure helpers used by the preview step.

import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import { stepNaturalEndMs } from '@utils/stepTiming';
import { stepWorkStart, isContinuingStep } from '@utils/helpers';
import { toLocalIsoString } from '@/utils/formatTime';

// formatMinutes (duration) lives in utils/formatTime — re-export for local consumers.
export { formatDurationMinutes as formatMinutes } from '@/utils/formatTime';

/**
 * Working time = total occupied time on the plan timeline.
 *
 * Unlike summing every step duration, this merges overlapping work
 * intervals across all machines so parallel work is only counted once.
 *
 * Example:
 *
 * Machine A: 08:00 ───── 12:00
 * Machine B:      09:00 ───── 13:00
 *
 * Working = 5 hours
 * NOT 8 hours.
 */
export function computeWorkingMinutes(
  steps: PlanStepWithMeta[],
): number {
  const intervals = steps
    .filter((s) => s.plannedStart)
    .map((s) => ({
      start: new Date(s.plannedStart!).getTime(),
      // Use pure work duration (durationMinutes + bufferMinutes) instead of
      // plannedEnd so that FIXED non-working windows embedded inside a step's
      // wall-clock span are NOT counted as working time.
      end: new Date(s.plannedStart!).getTime() +
        ((s.durationMinutes ?? 0) + (s.bufferMinutes ?? 0)) * 60_000,
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return 0;

  let total = 0;

  let currentStart = intervals[0].start;
  let currentEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const interval = intervals[i];

    // Overlapping or touching interval
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;

      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }

  total += currentEnd - currentStart;

  return Math.round(total / 60000);
}

/**
 * Elapsed time = last plannedEnd - first plannedStart across the whole plan.
 * Includes non-working gaps, so it's always >= working time.
 */
export function computeElapsedMinutes(steps: PlanStepWithMeta[]): number {
  const starts = steps.filter((s) => s.plannedStart).map((s) => new Date(s.plannedStart).getTime());
  // A continuing step (null plannedEnd) has no committed end time but still
  // occupies time — use its derived natural end so it isn't silently dropped
  // and elapsed time understated.
  const ends = steps.filter((s) => s.plannedStart).map((s) => stepNaturalEndMs(s));
  if (!starts.length || !ends.length) return 0;
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  return Math.max(0, (last - first) / 60000);
}

/** Sum of a single pile's step durations (natural end - plannedStart), in minutes. */
export function computeTotalDuration(steps: PlanStepWithMeta[]): number {
  return steps.reduce((sum, s) => {
    if (!s.plannedStart) return sum;
    return sum + (stepNaturalEndMs(s) - new Date(s.plannedStart).getTime()) / 60000;
  }, 0);
}

/** Sum of durationMinutes + bufferMinutes for steps assigned to a specific machine — the
 * time that machine is actually occupied on this pile. Buffer time is included since it's
 * genuinely reserved on the machine's timeline, not idle. */
export function computeMachineOccupancyMinutes(steps: PlanStepWithMeta[], machineId: string): number {
  return steps
    .filter((s) => s.assignedMachineId === machineId)
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0) + (s.bufferMinutes ?? 0), 0);
}

export interface PileStepBreak {
  /** Insert this break row immediately before the step at this index in the (already sorted)
   * steps array passed to computePileStepBreaks. */
  beforeIndex: number;
  label: string;
  start: string;
  end: string;
}

/**
 * Real, configured non-working windows (lunch/tea breaks etc.) that fall between two
 * consecutive steps of one pile — NOT plain per-step setup/buffer time, which stays invisible
 * exactly as before. Compares against `next.plannedStart` rather than its buffer-adjusted work
 * start: a step's own `plannedStart` already reflects any window its own assigned machine was
 * sitting inside (see skipNonWorkingWindows in pilingPlannerService.ts), so checking
 * `windowsByMachineId[next.assignedMachineId]` against the gap up to `plannedStart` finds
 * exactly the windows that delayed it — buffer time added after that point is a separate,
 * deliberately-unlabeled gap.
 */
export function computePileStepBreaks(
  steps: PlanStepWithMeta[],
  windowsByMachineId: Record<string, EffectivePlanWindow[]>,
): PileStepBreak[] {
  const breaks: PileStepBreak[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const next = steps[i];
    if (!prev.plannedEnd || !next.plannedStart || !next.assignedMachineId) continue;

    const gapStart = new Date(prev.plannedEnd).getTime();
    const gapEnd = new Date(next.plannedStart).getTime();
    if (gapEnd <= gapStart) continue;

    const windows = windowsByMachineId[next.assignedMachineId] ?? [];
    for (const w of windows) {
      const windowStart = new Date(w.start).getTime();
      const windowEnd = new Date(w.end).getTime();
      if (windowStart < gapEnd && windowEnd > gapStart) {
        breaks.push({ beforeIndex: i, label: w.label, start: w.start, end: w.end });
      }
    }
  }
  return breaks;
}

export interface StepSegment {
  start: string;
  end: string;
  durationMinutes: number;
}

export interface StepInternalSplit {
  segments: StepSegment[];
  breaks: { label: string; start: string; end: string }[];
}

/**
 * Splits one step's own [workStart, plannedEnd] span wherever a real, configured
 * non-working window (lunch/shift-change) landed strictly inside it — the step was
 * paused and resumed by the scheduler (see skipNonWorkingWindows) without a step
 * boundary in between, so computePileStepBreaks (inter-step only) never sees it.
 * A window sitting exactly at this step's own edge is already that function's
 * job and is deliberately excluded here (`>`/`<`, not `>=`/`<=`) to avoid
 * double-counting it. Returns null when there's nothing to split — no
 * plannedEnd/assignedMachineId, or no window falls strictly inside.
 */
export function splitStepByInternalWindows(
  step: PlanStepWithMeta,
  windowsByMachineId: Record<string, EffectivePlanWindow[]>,
): StepInternalSplit | null {
  if (!step.plannedStart || isContinuingStep(step) || !step.assignedMachineId) return null;
  const workStart = new Date(stepWorkStart(step)).getTime();
  const stepEnd = new Date(step.plannedEnd as string).getTime();

  const windows = (windowsByMachineId[step.assignedMachineId] ?? [])
    .map((w) => ({ label: w.label, start: new Date(w.start).getTime(), end: new Date(w.end).getTime() }))
    .filter((w) => w.start > workStart && w.end < stepEnd)
    .sort((a, b) => a.start - b.start);
  if (windows.length === 0) return null;

  const segments: StepSegment[] = [];
  const breaks: { label: string; start: string; end: string }[] = [];
  let cursor = workStart;
  for (const w of windows) {
    segments.push({
      start: toLocalIsoString(new Date(cursor)),
      end: toLocalIsoString(new Date(w.start)),
      durationMinutes: (w.start - cursor) / 60_000,
    });
    breaks.push({
      label: w.label,
      start: toLocalIsoString(new Date(w.start)),
      end: toLocalIsoString(new Date(w.end)),
    });
    cursor = w.end;
  }
  segments.push({
    start: toLocalIsoString(new Date(cursor)),
    end: toLocalIsoString(new Date(stepEnd)),
    durationMinutes: (stepEnd - cursor) / 60_000,
  });

  return { segments, breaks };
}
