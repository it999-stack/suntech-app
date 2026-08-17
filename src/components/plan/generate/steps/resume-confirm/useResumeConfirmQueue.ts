// Owns the "which pile's resume-confirm modal is open" queue for the
// Review Planned Piles step — a pile with a step in progress from a previous day
// must have its remaining time confirmed before the plan can be generated.

import { useState } from 'react';
import { closeOutResumeStep } from '@/services/resumeWorkService';
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

  /** The in-progress step was genuinely still in progress yesterday — close out
   * yesterday's row with the real stop time, then continue it today (fresh
   * start, filled normally in Log Actuals) for `remainingMinutes` more. */
  function confirmPartial(pastEndIso: string, remainingMinutes: number, remarks: string): void {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    if (resume?.pastChecklistPileId && resume.stepId) {
      closeOutResumeStep(resume.pastChecklistPileId, resume.stepId, resume.pastActualStart ?? null, pastEndIso, remarks || undefined);
    }
    onUpdate({
      resumeWorkByPileId: {
        ...draft.resumeWorkByPileId,
        [pileId]: { ...resume, remainingMinutes, remainingTimeConfirmed: true },
      },
    });
    setConfirmQueue((prev) => prev.slice(1));
  }

  /** The in-progress step actually finished yesterday, just never got logged —
   * close out yesterday's row with the real finish time, and don't plan this
   * step today: advance to whatever step comes next (fresh, full duration),
   * or drop the pile from today's plan entirely if there is no next step. */
  function confirmFull(pastEndIso: string, remarks: string): void {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    if (resume?.pastChecklistPileId && resume.stepId) {
      closeOutResumeStep(resume.pastChecklistPileId, resume.stepId, resume.pastActualStart ?? null, pastEndIso, remarks || undefined);
    }

    const { [pileId]: _removed, ...restResumeWork } = draft.resumeWorkByPileId;
    if (resume?.nextStep) {
      onUpdate({
        resumeWorkByPileId: {
          ...restResumeWork,
          [pileId]: {
            stepId: resume.nextStep.stepId,
            stepName: resume.nextStep.stepName,
            remainingMinutes: resume.nextStep.remainingMinutes,
            lastRigId: resume.lastRigId,
            lastCraneId: resume.lastCraneId,
            wasStarted: false,
            remainingTimeConfirmed: true,
          },
        },
      });
    } else {
      onUpdate({
        resumeWorkByPileId: restResumeWork,
        selectedPileIds: draft.selectedPileIds.filter((id) => id !== pileId),
      });
    }
    setConfirmQueue((prev) => prev.slice(1));
  }

  function cancel(): void {
    setConfirmQueue([]);
  }

  return { confirmQueue, needsResumeConfirm, openSingle, confirmPartial, confirmFull, cancel };
}
