// src/components/plan/generate/preview/previewUtils.ts
//
// Pure helpers used by the preview step.

import type { PlanStepWithMeta } from '@repositories/planRepository';
import { stepNaturalEndMs } from '@utils/stepTiming';

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

/** Count of (pile, step) entries that differ between two step-track-override maps — used
 * both to gate a Confirm action and to show "N reassigned" without a full deep-equal helper. */
export function countOverrideDiff(a: Record<string, string[]>, b: Record<string, string[]>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let count = 0;
  for (const key of keys) {
    const av = new Set(a[key] ?? []);
    const bv = new Set(b[key] ?? []);
    for (const id of av) if (!bv.has(id)) count++;
    for (const id of bv) if (!av.has(id)) count++;
  }
  return count;
}