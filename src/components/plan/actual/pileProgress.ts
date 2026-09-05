// src/components/plan/actual/pileProgress.ts

import { colors } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

export interface PileProgressSummary {
  total: number;
  doneCount: number;
  currentIndex: number;
  allDone: boolean;
  current: ActualEntry | null;
  currentStarted: boolean;
  statusLabel: string;
  statusColor: string;
  pct: number;
}

/**
 * `steps` is the pile's full merged row list from usePileGroups — its
 * APPLICABLE steps (not just the ones the plan covered), plus any historical
 * rows. So `steps.length` is the real denominator: a pile whose plan stopped
 * after 2 of 5 steps reads 2/5, not 2/2, and `allDone` stays false while an
 * unplanned-but-applicable step has no actualEnd yet — "All steps complete"
 * can no longer fire on a pile that still has work left in it.
 *
 * Assumes `steps` is ordered by sequenceOrder (usePileGroups sorts it), since
 * `currentIndex` is positional.
 */
export function getPileProgress(steps: ActualEntry[]): PileProgressSummary {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.actualEnd !== undefined).length;
  const currentIndex = steps.findIndex((s) => s.actualEnd === undefined);
  const allDone = currentIndex === -1;
  const current = !allDone ? steps[currentIndex] : null;
  const currentStarted = current?.actualStart !== undefined;

  const statusLabel = allDone
    ? 'All steps complete'
    : currentStarted
    ? `${current!.stepName} · In progress`
    : `${current!.stepName} · Not started`;

  const statusColor = allDone ? colors.success : currentStarted ? colors.accent : colors.textSecondary;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return { total, doneCount, currentIndex, allDone, current, currentStarted, statusLabel, statusColor, pct };
}
