// src/components/plan/actual/pileProgress.ts

import { colors } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

export type PileStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface PileProgressSummary {
  total: number;
  doneCount: number;
  pct: number;
  allDone: boolean;
  status: PileStatus;
  /** The step actually being worked right now — actualStart logged, actualEnd not.
   * Mirrors useMachineFloor.ts's inProgressStepByMachineId filter, so "in progress"
   * means the same thing everywhere on this screen. */
  inProgressStep: ActualEntry | null;
  /** The next step with no actual time logged yet at all — since `steps` is
   * sequence-ordered and at most one step can be in progress, this is simply
   * the first untouched step. Populated even when nothing is in progress yet
   * (a not-started pile's very first step). */
  nextStep: ActualEntry | null;
}

export const PILE_CARD_STATUS_META: Record<PileStatus, { label: string; color: string; soft: string }> = {
  NOT_STARTED: { label: 'Not started', color: colors.textSecondary, soft: 'rgba(138,138,148,0.14)' },
  IN_PROGRESS: { label: 'In progress', color: colors.accentBlue, soft: colors.accentBlueSoft },
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
export function getPileProgress(steps: ActualEntry[]): PileProgressSummary {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.actualEnd !== undefined).length;
  const allDone = total > 0 && doneCount === total;

  const inProgressStep = steps.find((s) => !s.isHistorical && s.actualStartIso && !s.actualEndIso) ?? null;
  const nextStep = steps.find((s) => s.actualStart === undefined && s.actualEnd === undefined) ?? null;

  const status: PileStatus = allDone ? 'COMPLETED' : inProgressStep ? 'IN_PROGRESS' : 'NOT_STARTED';
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return { total, doneCount, pct, allDone, status, inProgressStep, nextStep };
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
    if (s.isHistorical || !s.assignedMachineId || !s.assignedMachineNo) continue;
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
