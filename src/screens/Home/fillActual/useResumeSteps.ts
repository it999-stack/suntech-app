// src/screens/Home/fillActual/useResumeSteps.ts
//
// Steps completed on a previous checklist, for piles resuming into this one
// — shown as faded, read-only rows alongside today's own plan+actual rows
// (see usePileGroups) instead of being invisible on this screen.

import { useEffect, useState } from 'react';
import { findResumeWorkForPiles, type CompletedStepInfo } from '@/services/resumeWorkService';
import type { PilingChecklistPile, PilingDailyChecklist } from '@db/schema';

export function useResumeSteps(args: {
  siteId: string;
  checklist: PilingDailyChecklist | null;
  checklistPiles: PilingChecklistPile[];
}): { completedStepsByPileId: Map<string, CompletedStepInfo[]> } {
  const { siteId, checklist, checklistPiles } = args;

  const [completedStepsByPileId, setCompletedStepsByPileId] = useState<Map<string, CompletedStepInfo[]>>(new Map());
  useEffect(() => {
    if (!siteId || !checklist || !checklistPiles.length) {
      setCompletedStepsByPileId(new Map());
      return;
    }
    let cancelled = false;
    findResumeWorkForPiles(siteId, checklistPiles.map((cp) => cp.pileId), checklist.date).then((result) => {
      if (cancelled) return;
      setCompletedStepsByPileId(new Map(result.pendingWorkItems.map((item) => [item.pileId, item.completedSteps])));
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, checklist, checklistPiles]);

  return { completedStepsByPileId };
}
