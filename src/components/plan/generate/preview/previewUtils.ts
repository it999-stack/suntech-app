// src/components/plan/generate/preview/previewUtils.ts
//
// Pure helpers used by the preview step.

import type { PlanStepWithMeta } from '@repositories/planRepository';

// formatMinutes (duration) lives in utils/formatTime — re-export for local consumers.
export { formatDurationMinutes as formatMinutes } from '@/utils/formatTime';

/**
 * Working time = sum of (durationMinutes + bufferMinutes) per step.
 * This correctly excludes non-working windows (lunch, shift change, etc.)
 * that were skipped by the planner when scheduling plannedStart/plannedEnd.
 *
 * Falls back to (plannedEnd - plannedStart) for legacy rows where
 * durationMinutes is null — these will over-count break time, but that
 * only affects plans generated before this fix was deployed.
 */
export function computeWorkingMinutes(steps: PlanStepWithMeta[]): number {
  return steps.reduce((sum, s) => {
    if (s.durationMinutes !== null && s.durationMinutes !== undefined) {
      // New rows: buffer + pure work time, no breaks included
      return sum + s.durationMinutes + (s.bufferMinutes ?? 0);
    }
    // Legacy fallback: timestamp diff (may include break time)
    if (!s.plannedStart || !s.plannedEnd) return sum;
    const start = new Date(s.plannedStart).getTime();
    const end = new Date(s.plannedEnd).getTime();
    return sum + Math.max(0, (end - start) / 60000);
  }, 0);
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