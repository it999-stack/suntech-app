// src/components/plan/actual/pileProgress.ts

import { colors } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

export type PileStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';

export interface PileProgressSummary {
  total: number;
  doneCount: number;
  pct: number;
  allDone: boolean;
  status: PileStatus;
  /** The step actually being worked right now. Mirrors useMachineFloor.ts's
   * inProgressStepByMachineId filter, so "in progress" means the same thing
   * everywhere on this screen.
   *
   * Excludes a PAUSED step, which also has a start and no end but whose
   * machine has walked away — reporting it here would put "Current Machine"
   * and "Since 08:00" on a card for a machine that left hours ago. */
  inProgressStep: ActualEntry | null;
  /** A step stopped part-way with work still left on it — see pausedStep's
   * counterpart in the card, which shows when it stopped and how much is
   * left rather than how long it has been running. */
  pausedStep: ActualEntry | null;
  /** The next step with no actual time logged yet at all — since `steps` is
   * sequence-ordered and at most one step can be in progress, this is simply
   * the first untouched step. Populated even when nothing is in progress yet
   * (a not-started pile's very first step). */
  nextStep: ActualEntry | null;
}

export const PILE_CARD_STATUS_META: Record<PileStatus, { label: string; color: string; soft: string }> = {
  NOT_STARTED: { label: 'Not started', color: colors.textSecondary, soft: 'rgba(138,138,148,0.14)' },
  IN_PROGRESS: { label: 'In progress', color: colors.accentBlue, soft: colors.accentBlueSoft },
  PAUSED: { label: 'Paused', color: colors.warning, soft: colors.warningSoft },
  COMPLETED: { label: 'Completed', color: colors.success, soft: colors.successSoft },
};

/**
 * `steps` is the pile's full merged row list from usePileGroups — its
 * APPLICABLE steps (not just the ones the plan covered), plus any historical
 * rows. So `steps.length` is the real denominator: a pile whose plan stopped
 * after 2 of 5 steps reads 2/5, not 2/2, and `allDone` stays false while an
 * unplanned-but-applicable step has no actualEnd yet.
 *
 * Assumes `steps` is ordered by sequenceOrder (usePileGroups sorts it).
 */
/** Fallback for a step whose `status` hasn't been derived (anything not built
 * by usePileGroups — historical rows, or a caller assembling entries by hand).
 * Matches the pre-segments reading exactly: started and not finished. */
function statusFromTimes(step: ActualEntry): 'RUNNING' | 'OTHER' {
  return step.actualStartIso && !step.actualEndIso ? 'RUNNING' : 'OTHER';
}

export function getPileProgress(steps: ActualEntry[]): PileProgressSummary {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.actualEnd !== undefined).length;
  const allDone = total > 0 && doneCount === total;

  // Split on `status` rather than on the timestamps: a PAUSED step also has a
  // start and no end, so the old `actualStartIso && !actualEndIso` test
  // reported it as in progress — which put the machine that had already left
  // on the card as "Current Machine ... Since 08:00".
  const live = steps.filter((s) => !s.isHistorical);
  const inProgressStep = live.find((s) => (s.status ?? statusFromTimes(s)) === 'RUNNING') ?? null;
  const pausedStep = live.find((s) => s.status === 'PAUSED') ?? null;
  const nextStep = steps.find((s) => s.actualStart === undefined && s.actualEnd === undefined) ?? null;

  // In-progress outranks paused: a pile with one step running and an earlier
  // one paused is being worked on, and that is the more useful headline.
  const status: PileStatus = allDone
    ? 'COMPLETED'
    : inProgressStep
      ? 'IN_PROGRESS'
      : pausedStep
        ? 'PAUSED'
        : 'NOT_STARTED';
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return { total, doneCount, pct, allDone, status, inProgressStep, pausedStep, nextStep };
}

export interface PileMachineRef {
  id: string;
  no: string;
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
}

/** Every distinct machine touching this pile, split into two views over the
 * same `steps` list in one pass:
 *  - `worked`  — a step's machine counts only once that step has actually
 *                started (actualStart is set).
 *  - `planned` — every machine assigned across the WHOLE sequence, started or
 *                not, any track (including COMPRESSOR) — this is deliberately
 *                NOT the same thing as PileGroup.rigs/cranes, which mix both
 *                notions together with no actualStart distinction at all. */
export function getPileMachines(steps: ActualEntry[]): { worked: PileMachineRef[]; planned: PileMachineRef[] } {
  const workedSeen = new Set<string>();
  const plannedSeen = new Set<string>();
  const worked: PileMachineRef[] = [];
  const planned: PileMachineRef[] = [];

  for (const s of steps) {
    if (s.isHistorical) continue;

    // A step split between machines has each session's own machine recorded.
    // Reading only s.assignedMachineId would credit the whole step to whoever
    // holds it now and drop the machine that did the earlier half — exactly
    // the mis-attribution work sessions exist to fix.
    for (const seg of s.segments ?? []) {
      if (!seg.assignedMachineId || !seg.assignedMachineNo) continue;
      if (workedSeen.has(seg.assignedMachineId)) continue;
      workedSeen.add(seg.assignedMachineId);
      worked.push({ id: seg.assignedMachineId, no: seg.assignedMachineNo, track: s.track });
    }

    if (!s.assignedMachineId || !s.assignedMachineNo) continue;
    const ref: PileMachineRef = { id: s.assignedMachineId, no: s.assignedMachineNo, track: s.track };

    if (!plannedSeen.has(ref.id)) {
      plannedSeen.add(ref.id);
      planned.push(ref);
    }
    if (s.actualStart !== undefined && !workedSeen.has(ref.id)) {
      workedSeen.add(ref.id);
      worked.push(ref);
    }
  }

  return { worked, planned };
}
