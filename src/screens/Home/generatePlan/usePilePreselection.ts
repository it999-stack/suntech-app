// src/screens/Home/generatePlan/usePilePreselection.ts
//
// On the Piles step, auto-selects piles with pending resume work (carry-over
// from a prior day) and assigns them to whichever rig/crane they were
// already on, without clobbering the user's own manual picks. Also keeps
// selectedStepIds in sync with any steps a carry-over pile requires
// (locked, can't be removed — see planPreselectService).

import { useEffect, useRef } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { ResumeWorkInfo } from '@/services/resumeWorkService';
import { buildResumePreselection, getLockedStepIds, mergeLockedSteps } from '@/services/planPreselectService';

export function usePilePreselection(args: {
  step: Step;
  draft: PlanDraft;
  setDraft: (updater: (prev: PlanDraft) => PlanDraft) => void;
  pendingWorkItems: ResumeWorkInfo[];
  steps: PilingStep[];
}): void {
  const { step, draft, setDraft, pendingWorkItems, steps } = args;

  const preselectKeyRef = useRef('');

  useEffect(() => {
    preselectKeyRef.current = '';
  }, [draft.areaIds]);

  useEffect(() => {
    if (step !== 'piles') return;

    const preselectKey = [
      pendingWorkItems.map((p) => p.pileId).join(','),
      draft.activeRigIds.join(','),
      draft.activeCraneIds.join(','),
    ].join('|');

    if (preselectKeyRef.current === preselectKey) return;
    preselectKeyRef.current = preselectKey;

    const preselection = buildResumePreselection({
      pendingItems: pendingWorkItems,
      activeRigIds: draft.activeRigIds,
      activeCraneIds: draft.activeCraneIds,
    });

    setDraft((prev) => {
      const manualIds = prev.selectedPileIds.filter(
        (id) => !preselection.selectedPileIds.includes(id),
      );
      const manualAssignments = Object.fromEntries(
        manualIds
          .filter((id) => prev.assignments[id]?.rig && prev.assignments[id]?.crane)
          .map((id) => [id, prev.assignments[id]]),
      );

      return {
        ...prev,
        selectedPileIds: [...preselection.selectedPileIds, ...manualIds],
        assignments: { ...manualAssignments, ...preselection.assignments },
        resumeWorkByPileId: preselection.resumeWorkByPileId,
      };
    });
  }, [step, pendingWorkItems, draft.activeRigIds, draft.activeCraneIds]);

  useEffect(() => {
    if (step !== 'steps') return;

    const locked = getLockedStepIds(draft.selectedPileIds, draft.resumeWorkByPileId);
    if (locked.size === 0) return;

    const missing = [...locked].filter((id) => !draft.selectedStepIds.includes(id));
    if (missing.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      selectedStepIds: mergeLockedSteps(prev.selectedStepIds, missing, steps),
    }));
  }, [step, draft.selectedPileIds, draft.resumeWorkByPileId, draft.selectedStepIds, steps]);
}
