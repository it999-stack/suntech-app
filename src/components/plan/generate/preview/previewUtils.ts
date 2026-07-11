// src/components/plan/generate/preview/previewUtils.ts
//
// Pure helpers used by the preview step.

import type { PlanStepWithMeta } from '@repositories/planRepository';

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
    .filter((s) => s.plannedStart && s.plannedEnd)
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
  const ends = steps.filter((s) => s.plannedEnd).map((s) => new Date(s.plannedEnd).getTime());
  if (!starts.length || !ends.length) return 0;
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  return Math.max(0, (last - first) / 60000);
}