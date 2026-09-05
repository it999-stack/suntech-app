// src/screens/Home/generatePlan/useEditModeSeed.ts
//
// Edit-mode initialization: reconstructs a full PlanDraft from an existing
// checklist instead of starting from defaultPlanDraft. Runs once data has
// loaded, then jumps straight to the preview step. If edit mode was
// requested but no checklist exists for the date, there's nothing to seed —
// just release the loading gate. The actual reconstruction logic lives in
// planEditModeSeedService.ts (buildEditModeDraft) — this hook does the two
// repository fetches and applies the result via the applySeed callback
// usePlanDraft provides.

import { useEffect, useRef, useState } from 'react';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getPlanStepsForChecklist } from '@repositories/planRepository';
import { buildEditModeDraft } from '@/services/planEditModeSeedService';
import type { PlanDraft } from '@/types/plan';
import type { PilingDailyChecklist, PilingChecklistPile, PilingStep } from '@/db/schema';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { EligiblePile } from './useGeneratePlanData';

export function useEditModeSeed(args: {
  isEditMode: boolean;
  dataLoading: boolean;
  checklistLoading: boolean;
  checklist: PilingDailyChecklist | null;
  checklistPiles: PilingChecklistPile[];
  piles: EligiblePile[];
  steps: PilingStep[];
  applySeed: (draft: PlanDraft) => void;
  setStep: (step: Step) => void;
}): { editSeeding: boolean } {
  const { isEditMode, dataLoading, checklistLoading, checklist, checklistPiles, piles, steps, applySeed, setStep } = args;
  const [editSeeding, setEditSeeding] = useState(isEditMode);

  const seeded = useRef(false);
  useEffect(() => {
    if (!isEditMode || dataLoading || !checklist || !checklistPiles.length || seeded.current) return;
    seeded.current = true;

    (async () => {
      const personnelRows = await getChecklistPersonnel(checklist.id);
      const planStepRows = await getPlanStepsForChecklist(checklist.id);
      applySeed(buildEditModeDraft({ checklist, checklistPiles, piles, steps, personnelRows, planStepRows }));

      // Skip directly to the preview step when editing an existing plan
      setStep('preview');
      setEditSeeding(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, dataLoading, checklist, checklistPiles, piles]);

  // Edit mode was requested but no checklist exists for this date — nothing
  // to seed, so release the loading gate and fall back to the normal wizard.
  useEffect(() => {
    if (!isEditMode || checklistLoading || checklist || seeded.current) return;
    setEditSeeding(false);
  }, [isEditMode, checklistLoading, checklist]);

  return { editSeeding };
}
