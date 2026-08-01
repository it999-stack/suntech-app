// src/screens/Home/hooks/usePlanPreview.ts
// Regenerates the (unsaved) plan preview whenever the user is on the preview
// step and the draft changes.

import { useEffect, useState } from 'react';
import { generatePlanPreview } from '@services/pilingPlannerService';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { PlanDraft } from '@/types/plan';
import type { EligiblePile } from './useWizardData';

// Input type for preview - using dimensionId instead of dia/depth
interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  dimensionId: string;
  rigId: string;
  craneId: string;
  resumeWork?: { stepId: string; remainingMinutes: number; bufferMinutes?: number };
}

export function usePlanPreview(params: {
  step: 'area' | 'start' | 'machines' | 'piles' | 'steps' | 'supervisors' | 'preview';
  draft: PlanDraft;
  areaPiles: EligiblePile[];
  siteId: string;
}) {
  const { step, draft, areaPiles, siteId } = params;
  const [previewSteps, setPreviewSteps] = useState<PlanStepWithMeta[]>([]);
  const [previewWarningPileIds, setPreviewWarningPileIds] = useState<string[]>([]);

  useEffect(() => {
    if (step !== 'preview') return;

    if (!siteId || draft.selectedPileIds.length === 0) {
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const selectedPiles = areaPiles.filter((p) => draft.selectedPileIds.includes(p.id));
        const previewPilesInput: PreviewPileInput[] = selectedPiles.map((pile) => {
          const assignment = draft.assignments[pile.id];
          return {
            checklistPileId: pile.id,
            pileId: pile.id,
            pileIdCode: pile.code,
            dimensionId: pile.dimensionId,
            rigId: assignment?.rig ?? '',
            craneId: assignment?.crane ?? '',
            resumeWork: draft.resumeWorkByPileId[pile.id],
          };
        });

        const { planRows, warningPileIds } = await generatePlanPreview({
          piles: previewPilesInput,
          planStartTime: draft.planStartTime,
          siteId,
          shiftTypeId: draft.shiftTypeId ?? undefined,
          selectedStepIds: draft.selectedStepIds,
        });

        if (cancelled) return;
        setPreviewSteps(planRows as PlanStepWithMeta[]);
        setPreviewWarningPileIds(warningPileIds);
      } catch (err) {
        console.error('Error generating plan preview:', err);
        if (!cancelled) {
          setPreviewSteps([]);
          setPreviewWarningPileIds([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, draft, areaPiles, siteId]);

  return { previewSteps, previewWarningPileIds };
}