// src/utils/checklistProgress.ts
//
// Computes time-weighted completion % and schedule variance for a daily
// checklist, based on each pile's planned vs actual span.
//
// Input shape matches PileTiming from checklistRepository.ts:
// one row per checklist-pile, with planned/actual spans collapsed across
// all steps for that pile.

export type ChecklistPileProgress = {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  plannedStart: string | null; // ISO timestamp
  plannedEnd: string | null;   // ISO timestamp
  actualStart: string | null;  // ISO timestamp, null until work begins
  actualEnd: string | null;    // ISO timestamp, only set once status is COMPLETED
  /**
   * How many of the pile's steps the plan covered, and how many more were
   * actually worked without ever being planned (the scheduler ran out of the
   * 24h window; the crew got to them anyway — see usePileGroups). Both
   * default to treating the plan as complete coverage when omitted, which is
   * what every caller predating unplanned work implies.
   */
  plannedStepCount?: number;
  unplannedStepCount?: number;
};

export type ChecklistProgress = {
  completionPercent: number;       // 0-100, time-weighted across all active piles
  varianceMinutes: number | null;  // signed, null until >=1 pile has completed
  completedCount: number;
  totalCount: number;              // excludes CANCELLED piles
  anyOverrunning: boolean;         // a still-running pile has passed its planned end
};

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

export function computeChecklistProgress(
  piles: ChecklistPileProgress[],
  now: Date = new Date(),
  /**
   * Plan window's boundary (ISO). Used as the effective end for a pile whose
   * plannedEnd is null (it has a continuing step) — "progress up to that
   * window end time" — instead of contributing 0 planned duration.
   */
  windowEndIso?: string,
): ChecklistProgress {
  // Cancelled piles shouldn't count toward planned work or completion.
  const activePiles = piles.filter((p) => p.status !== 'CANCELLED');
  const totalCount = activePiles.length;

  if (totalCount === 0) {
    return { completionPercent: 0, varianceMinutes: null, completedCount: 0, totalCount: 0, anyOverrunning: false };
  }

  let weightedElapsed = 0;
  let totalPlanned = 0;
  let completedCount = 0;
  let completedActual = 0;
  let completedPlanned = 0;
  let anyOverrunning = false;

  activePiles.forEach((p) => {
    const effectivePlannedEnd = p.plannedEnd ?? (p.plannedStart ? windowEndIso : null);
    const plannedDurationMinutes =
      p.plannedStart && effectivePlannedEnd ? minutesBetween(p.plannedStart, effectivePlannedEnd) : 0;

    // A pile whose actual work includes steps the plan never covered has a
    // planned span that measures only PART of the work it really contains.
    // Weighting it by that span alone let its elapsed time saturate its whole
    // weight the moment it ran past the plan — reading as 100% done while
    // several unplanned steps were still outstanding. Scaling the span by the
    // extra steps keeps the pile's weight roughly proportional to the work it
    // actually holds. An approximation by construction: a never-planned step
    // has no planned duration at all, so a per-step average of the planned
    // ones is the only estimate available.
    const plannedStepCount = p.plannedStepCount ?? 0;
    const unplannedStepCount = p.unplannedStepCount ?? 0;
    const stepScale =
      plannedStepCount > 0 && unplannedStepCount > 0
        ? (plannedStepCount + unplannedStepCount) / plannedStepCount
        : 1;
    const weightMinutes = plannedDurationMinutes * stepScale;
    totalPlanned += weightMinutes;

    if (!p.actualStart) return; // not started — contributes 0 elapsed

    const isDone = p.status === 'COMPLETED' && !!p.actualEnd;
    const elapsed = isDone
      ? minutesBetween(p.actualStart, p.actualEnd!)
      : minutesBetween(p.actualStart, now.toISOString());

    weightedElapsed += weightMinutes > 0 ? Math.min(elapsed, weightMinutes) : elapsed;

    if (isDone) {
      completedCount += 1;
      completedActual += elapsed;
      // Variance stays actual-vs-PLANNED (the unscaled span): a pile that
      // performed unplanned work genuinely took longer than it was planned to,
      // and that is exactly what this figure is meant to report.
      completedPlanned += plannedDurationMinutes;
    } else if (unplannedStepCount === 0 && plannedDurationMinutes > 0 && elapsed > plannedDurationMinutes) {
      // Only piles whose plan covered all their work can be "overrunning".
      // An unplanned step's minutes were never planned, so there is nothing
      // for them to be late against — flagging the day overdue for them
      // would make every partially-planned pile look overdue by definition.
      anyOverrunning = true;
    }
  });

  const completionPercent = totalPlanned > 0 ? Math.round((weightedElapsed / totalPlanned) * 100) : 0;
  const varianceMinutes = completedCount > 0 ? Math.round(completedActual - completedPlanned) : null;

  return { completionPercent, varianceMinutes, completedCount, totalCount, anyOverrunning };
}

export function formatVariance(varianceMinutes: number | null): string | null {
  if (varianceMinutes === null || Math.abs(varianceMinutes) < 15) return null; // ignore noise under 15min
  const hours = Math.round((Math.abs(varianceMinutes) / 60) * 10) / 10;
  const sign = varianceMinutes >= 0 ? '+' : '-';
  return `${sign}${hours}h vs planned`;
}

export type DisplayStatus =
  | 'upcoming'
  | 'not_started'
  | 'in_progress'
  | 'partially_completed'
  | 'completed_on_time'
  | 'completed_late'
  | 'overdue';

export function computeDisplayStatus(
  progress: ChecklistProgress,
  opts: { isFutureDate: boolean; isToday: boolean },
): DisplayStatus {
  if (opts.isFutureDate) return 'upcoming';
  if (progress.anyOverrunning) return 'overdue';
  if (progress.completedCount === 0 && progress.completionPercent === 0) return 'not_started';
  if (progress.completedCount === progress.totalCount && progress.totalCount > 0) {
    return (progress.varianceMinutes ?? 0) > 30 ? 'completed_late' : 'completed_on_time';
  }
  return opts.isToday ? 'in_progress' : 'partially_completed';
}