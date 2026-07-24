// src/utils/shiftHelpers.ts
// Shift-type helpers shared by the multi-day plan generation flow.

import { timeToMinutes, toLocalIsoString } from '@utils/formatTime';
import type { PilingShiftType } from '@db/schema';
import { GENERATION_GRACE_HOURS } from '@/constants/planGeneration';

/**
 * Resolves the planning start shift — the shift with the earliest start_time
 * among a site's shifts. This is the shift that defines the beginning of the
 * planning day (e.g. the day shift), not just an arbitrary pick.
 */
export function getPrimaryShiftType(
  shiftTypes: PilingShiftType[],
): PilingShiftType | undefined {
  if (!shiftTypes.length) return undefined;
  return shiftTypes.reduce((earliest, s) =>
    timeToMinutes(s.startTime) < timeToMinutes(earliest.startTime) ? s : earliest,
  );
}

/** Combine a "YYYY-MM-DD" date with a "HH:MM" time into a local ISO timestamp. */
export function combineDateAndTime(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return toLocalIsoString(new Date(y, m - 1, d, h, min, 0, 0));
}

/**
 * True while `dateStr`'s plan is still generatable — i.e. `now` is before
 * `shiftStartTime` (on `dateStr`) plus the grace period. Used to disable
 * "today" in the date picker once its own shift's window has closed;
 * "tomorrow" is always within this window since its shift start is always
 * further out than the grace period.
 */
export function isWithinGenerationGrace(
  dateStr: string,
  shiftStartTime: string,
  now: Date = new Date(),
): boolean {
  const shiftStart = new Date(combineDateAndTime(dateStr, shiftStartTime));
  const cutoff = new Date(shiftStart.getTime() + GENERATION_GRACE_HOURS * 60 * 60 * 1000);
  return now < cutoff;
}
