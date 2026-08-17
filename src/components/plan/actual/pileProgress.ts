// src/components/plan/actual/pileProgress.ts
//
// Shared step-progress derivation for a pile's actual-entry list — used by
// both PileProgressCard and PileSequenceRow so their status/progress reading
// stays identical.

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
