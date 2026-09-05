// src/screens/Home/generatePlan/usePilePreselection.ts
//
// On the Piles step, auto-selects piles with pending resume work (carry-over
// from a prior day) and assigns them to whichever rig/crane they were
// already on, without clobbering the user's own manual picks. Also keeps
// selectedStepIds in sync with any steps a carry-over pile requires
// (locked, can't be removed). The actual preselection/merge logic lives in
// planPreselectService.ts's applyResumePreselection — this hook only
// decides *when* to (re)run it and applies the result via the applySeed
// callback usePlanDraft provides.

import { useEffect, useRef } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { ResumeWorkInfo } from '@/services/resumeWorkService';
import { getLockedStepIds, mergeLockedSteps } from '@/services/planPreselectService';
import { useAppConfig } from '@state/AppConfigContext';

export function usePilePreselection(args: {
  step: Step;
  draft: PlanDraft;
  pendingWorkItems: ResumeWorkInfo[];
  steps: PilingStep[];
  applySeed: (args: { pendingWorkItems: ResumeWorkInfo[]; maxAutoPreselectPiles: number }) => void;
  setSteps: (nextStepIds: string[]) => void;
}): void {
  const { step, draft, pendingWorkItems, steps, applySeed, setSteps } = args;
  const { config } = useAppConfig();

  const preselectKeyRef = useRef('');

  useEffect(() => {
    preselectKeyRef.current = '';
  }, [draft.locationIds]);

  useEffect(() => {
    if (step !== 'piles') return;

    const preselectKey = [
      pendingWorkItems.map((p) => p.pileId).join(','),
      draft.activeRigIds.join(','),
      draft.activeCraneIds.join(','),
    ].join('|');

    if (preselectKeyRef.current === preselectKey) return;
    preselectKeyRef.current = preselectKey;

    applySeed({ pendingWorkItems, maxAutoPreselectPiles: config.maxAutoPreselectPiles });
  }, [step, pendingWorkItems, draft.activeRigIds, draft.activeCraneIds, config.maxAutoPreselectPiles, applySeed]);

  useEffect(() => {
    if (step !== 'steps') return;

    const locked = getLockedStepIds(draft.selectedPileIds, draft.resumeWorkByPileId);
    if (locked.size === 0) return;

    const missing = [...locked].filter((id) => !draft.selectedStepIds.includes(id));
    if (missing.length === 0) return;

    setSteps(mergeLockedSteps(draft.selectedStepIds, missing, steps));
  }, [step, draft.selectedPileIds, draft.resumeWorkByPileId, draft.selectedStepIds, steps, setSteps]);
}
