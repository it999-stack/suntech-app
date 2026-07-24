// src/utils/stepTiming.ts
// Shared timing math for plan steps that may be "continuing" (null plannedEnd).

import { isContinuingStep } from '@utils/helpers';

/**
 * The step's natural end — plannedEnd if it has one, else derived from
 * plannedStart + durationMinutes + bufferMinutes. durationMinutes/bufferMinutes
 * always hold the step's real, full computed duration regardless of whether
 * plannedEnd was nulled, so this is safe to call for any step.
 *
 * Use this for aggregate/visual math (elapsed time, working minutes, overflow) —
 * never persist or display the result as if it were a committed end time.
 */
export function stepNaturalEndMs(step: {
  plannedStart: string;
  plannedEnd: string | null;
  durationMinutes: number | null;
  bufferMinutes: number | null;
}): number {
  if (!isContinuingStep(step)) return new Date(step.plannedEnd as string).getTime();
  return (
    new Date(step.plannedStart).getTime() +
    ((step.durationMinutes ?? 0) + (step.bufferMinutes ?? 0)) * 60_000
  );
}
