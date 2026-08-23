// src/utils/timeValidation.ts
//
// Single place that decides whether a candidate actual-time is acceptable,
// and — if not — builds one consistently-shaped { title, message } notice
// covering every reason a candidate can be rejected: out of order against a
// neighboring step's already-recorded time (same pile), overlapping another
// step within the same pile, or overlapping another pile's already-recorded
// time on the same machine — all of these are really the same underlying
// fact ("this machine/pile already has a recorded time here"), so they share
// one "Machine occupied" title and a "<pile> - <step> <start> - <end>" body
// naming exactly what's in the way. The plan-window check is a different
// kind of constraint (the checklist's own window, not another step) and
// keeps its own title. Used identically by StepTimeControl.tsx and
// EditTimeButton.tsx so "why is this invalid" is decided in exactly one
// place instead of duplicated per component.

import { formatTime } from '@utils/formatTime';

export interface ConflictNotice {
  title: string;
  message: string;
}

export interface CandidateTimeBounds {
  candidateDate: Date;
  /** Earliest real timestamp this time may land on (inclusive). */
  minBoundIso?: string;
  /** What's occupying minBoundIso, for the notice — e.g. the previous step's
   * own recorded interval. Omit to fall back to a bare "Invalid time" for
   * this bound. */
  minBoundConflict?: ConflictNotice;
  /** Latest real timestamp this time may land on (inclusive). */
  maxBoundIso?: string;
  maxBoundConflict?: ConflictNotice;
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  /** Cross-pile overlap check — returns a notice naming what's occupying the
   * machine, or null. See src/utils/machineFloor.ts. */
  machineConflictCheck?: (candidate: Date) => ConflictNotice | null;
  /** Within-pile overlap check — returns a notice naming the conflicting
   * step, or null. See src/utils/machineFloor.ts. */
  pileConflictCheck?: (candidate: Date) => ConflictNotice | null;
}

const INVALID_TIME: ConflictNotice = { title: 'Invalid time', message: 'Invalid time' };
const OUTSIDE_PLAN_WINDOW: ConflictNotice = {
  title: 'Outside plan window',
  message: 'Please select a time within the plan window.',
};

/** Returns the first applicable rejection notice, checked in the order a
 * user would most naturally want explained (ordering against a neighbor,
 * then the plan window, then overlap), or null if the candidate clears every
 * check. */
export function validateCandidateTime({
  candidateDate,
  minBoundIso,
  minBoundConflict,
  maxBoundIso,
  maxBoundConflict,
  planWindowMinIso,
  planWindowMaxIso,
  machineConflictCheck,
  pileConflictCheck,
}: CandidateTimeBounds): ConflictNotice | null {
  if (minBoundIso && candidateDate.getTime() < new Date(minBoundIso).getTime()) {
    return minBoundConflict ?? INVALID_TIME;
  }
  if (maxBoundIso && candidateDate.getTime() > new Date(maxBoundIso).getTime()) {
    return maxBoundConflict ?? INVALID_TIME;
  }
  if (planWindowMinIso && candidateDate.getTime() < new Date(planWindowMinIso).getTime()) {
    return OUTSIDE_PLAN_WINDOW;
  }
  if (planWindowMaxIso && candidateDate.getTime() > new Date(planWindowMaxIso).getTime()) {
    return OUTSIDE_PLAN_WINDOW;
  }
  return machineConflictCheck?.(candidateDate) ?? pileConflictCheck?.(candidateDate) ?? null;
}

/** Builds the shared "Machine occupied" notice from a step's real recorded
 * interval — "<pileCode> · <stepName>" on its own line (the same " · "
 * separator the rest of the app already uses for a compact pile/machine
 * summary, e.g. "Rig R-1 · Crane C-1"), then the time range on a second line
 * so it reads as two distinct facts instead of one run-on line. `endIso`
 * omitted (e.g. a still-running step, or a self-referential bound on a step
 * that hasn't finished yet) shows just the single start time instead of a
 * range. */
export function formatOccupiedNotice(
  pileCode: string,
  stepName: string,
  startIso?: string | null,
  endIso?: string | null,
): ConflictNotice {
  const range = startIso ? (endIso ? `${formatTime(startIso)} – ${formatTime(endIso)}` : formatTime(startIso)) : '';
  return {
    title: 'Machine occupied',
    message: `${pileCode} · ${stepName}${range ? `\n${range}` : ''}`,
  };
}
