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
  minBoundIso?: string;
  minBoundConflict?: ConflictNotice;
  /** Reject a candidate that EQUALS minBoundIso as well as one below it.
   * Defaults false, so every existing caller keeps its ">= is fine" semantics
   * (an actual step may legitimately start the instant the previous one ends).
   * Set where a zero-length span is meaningless — e.g. a plan finish time
   * landing exactly on the plan start. */
  minBoundExclusive?: boolean;
  maxBoundIso?: string;
  maxBoundConflict?: ConflictNotice;
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  machineConflictCheck?: (candidate: Date) => ConflictNotice | null;
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
  minBoundExclusive = false,
  maxBoundIso,
  maxBoundConflict,
  planWindowMinIso,
  planWindowMaxIso,
  machineConflictCheck,
  pileConflictCheck,
}: CandidateTimeBounds): ConflictNotice | null {
  if (minBoundIso) {
    const delta = candidateDate.getTime() - new Date(minBoundIso).getTime();
    if (minBoundExclusive ? delta <= 0 : delta < 0) {
      return minBoundConflict ?? INVALID_TIME;
    }
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

export const IN_THE_FUTURE: ConflictNotice = {
  title: 'Invalid time',
  message: 'This time is in the future.',
};

export function formatOpenSessionNotice(what: string, sinceIso: string): ConflictNotice {
  return {
    title: 'Invalid time',
    message: `${what} at ${formatTime(sinceIso)}.\nPick a time after that.`,
  };
}

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
