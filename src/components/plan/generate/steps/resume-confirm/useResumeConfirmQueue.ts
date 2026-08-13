// Owns the "which pile's resume-confirm modal is open" queue for the
// Review Planned Piles step — a pile with a step in progress from a previous day
// must have its remaining time confirmed before the plan can be generated.

import { useState } from 'react';
import { saveResumeRemarks } from '@/services/resumeWorkService';
import type { PlanDraft } from '@/types/plan';

/** True when this pile has a genuinely in-progress prior-day step (actualStart set, no
 * actualEnd) that the user hasn't yet confirmed a remaining/finish time for. Shared
 * between this hook and GeneratePlanScreen's canContinue gate — one definition. */
export function pileNeedsResumeConfirm(
  resumeWorkByPileId: PlanDraft['resumeWorkByPileId'],
  pileId: string,
): boolean {
  const resume = resumeWorkByPileId[pileId];
  return !!resume?.wasStarted && !resume.remainingTimeConfirmed;
}

export function useResumeConfirmQueue(
  draft: PlanDraft,
  onUpdate: (patch: Partial<PlanDraft>) => void,
) {
  const [confirmQueue, setConfirmQueue] = useState<string[]>([]);

  function needsResumeConfirm(pileId: string): boolean {
    return pileNeedsResumeConfirm(draft.resumeWorkByPileId, pileId);
  }

  /** Opens the modal for one specific pile — tapping a flagged row, the one-shot
   * auto-prompt on step entry, or tapping an already-confirmed row to edit its
   * previously-set finish time. Gated only on this pile actually being a genuine
   * resume-work pile (wasStarted) — NOT on whether it's already confirmed, so a
   * confirmed pile stays editable instead of becoming a dead end. */
  function openSingle(pileId: string): void {
    if (!draft.resumeWorkByPileId[pileId]?.wasStarted) return;
    setConfirmQueue([pileId]);
  }

  function confirm(remainingMinutes: number, remarks: string): void {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    onUpdate({
      resumeWorkByPileId: {
        ...draft.resumeWorkByPileId,
        [pileId]: { ...resume, remainingMinutes, remainingTimeConfirmed: true },
      },
    });
    if (remarks && resume?.pastChecklistPileId && resume.stepId) {
      saveResumeRemarks(resume.pastChecklistPileId, resume.stepId, resume.pastActualStart ?? null, remarks);
    }
    setConfirmQueue((prev) => prev.slice(1));
  }

  function cancel(): void {
    setConfirmQueue([]);
  }

  return { confirmQueue, needsResumeConfirm, openSingle, confirm, cancel };
}
