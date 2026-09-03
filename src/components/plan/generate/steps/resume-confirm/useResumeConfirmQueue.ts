// Owns the "which pile's resume-confirm modal is open" queue for the
// Review Planned Piles step — a pile with a step in progress from a previous day
// must have its remaining time confirmed before the plan can be generated.

import { useState } from 'react';
import { closeOutResumeStep } from '@/services/resumeWorkService';
import { enqueueChecklistSync } from '@repositories/syncQueueRepository';
import type { PlanDraft, CompletedStepInfo } from '@/types/plan';
import type { PilingStep } from '@/db/schema';

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
  /** Global step catalog (track/sequenceOrder) — needed to record the step
   * confirmFull closes out as a proper CompletedStepInfo entry so Preview can
   * show it as done instead of unplanned. */
  allSteps: PilingStep[] = [],
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

  /** The in-progress step was genuinely still in progress on the previous day —
   * close out that day's row with the real stop time, then continue it today
   * (fresh start, filled normally in Log Actuals) for `remainingMinutes` more.
   * Awaited end-to-end (including the sync-queue enqueue for the *historical*
   * checklist, which PlanContext's own writes never cover since it only ever
   * loads today's checklist) so a failure surfaces to the caller instead of
   * silently leaving that row unsynced — see closeOutResumeStep. */
  async function confirmPartial(pastEndIso: string, remainingMinutes: number, remarks: string): Promise<void> {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    if (resume?.pastChecklistPileId && resume.stepId) {
      await closeOutResumeStep(resume.pastChecklistPileId, resume.stepId, resume.pastActualStart ?? null, pastEndIso, remarks || undefined);
      if (resume.checklistId) {
        await enqueueChecklistSync(resume.checklistId);
      }
    }
    onUpdate({
      resumeWorkByPileId: {
        ...draft.resumeWorkByPileId,
        [pileId]: {
          ...resume,
          remainingMinutes,
          remainingTimeConfirmed: true,
          confirmedStatus: 'partial',
          confirmedPastEndIso: pastEndIso,
          confirmedRemarks: remarks,
        },
      },
    });
    setConfirmQueue((prev) => prev.slice(1));
  }

  /** The in-progress step actually finished on the previous day, just never
   * got logged — close out that day's row with the real finish time, and
   * don't plan this step today: advance to whatever step comes next (fresh,
   * full duration), or drop the pile from today's plan entirely if there is
   * no next step. Awaited end-to-end for the same reason as confirmPartial
   * above. */
  async function confirmFull(pastEndIso: string, remarks: string): Promise<void> {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    if (resume?.pastChecklistPileId && resume.stepId) {
      await closeOutResumeStep(resume.pastChecklistPileId, resume.stepId, resume.pastActualStart ?? null, pastEndIso, remarks || undefined);
      if (resume.checklistId) {
        await enqueueChecklistSync(resume.checklistId);
      }
    }

    const { [pileId]: _removed, ...restResumeWork } = draft.resumeWorkByPileId;
    if (resume?.nextStep) {
      // Record the step just closed out as a proper completed entry — advancing
      // the resume point to nextStep otherwise drops all trace of it (and of any
      // earlier completedSteps), which is why Preview was showing this step as
      // unplanned/dash instead of done even though its actual start/end were
      // just saved to the historical checklist row above.
      const stepMeta = allSteps.find((s) => s.id === resume.stepId);
      const closedOutStep: CompletedStepInfo | null = stepMeta
        ? {
            stepId: resume.stepId,
            stepName: resume.stepName ?? stepMeta.stepName,
            track: stepMeta.track,
            sequenceOrder: stepMeta.sequenceOrder,
            plannedStart: null,
            plannedEnd: null,
            actualStart: resume.pastActualStart ?? null,
            actualEnd: pastEndIso,
          }
        : null;
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
            completedStepNames: closedOutStep
              ? [...(resume.completedStepNames ?? []), closedOutStep.stepName]
              : resume.completedStepNames,
            completedSteps: closedOutStep
              ? [...(resume.completedSteps ?? []), closedOutStep]
              : resume.completedSteps,
            // The step just closed out — kept separately from the live
            // stepId/remainingMinutes above (which now represent the *next*
            // step) so it stays reachable for a light edit. See
            // editConfirmedFull below.
            lastConfirmedFull: resume.pastChecklistPileId
              ? {
                  stepId: resume.stepId,
                  stepName: resume.stepName ?? closedOutStep?.stepName ?? '',
                  pastChecklistPileId: resume.pastChecklistPileId,
                  pastActualStart: resume.pastActualStart ?? null,
                  pastEndIso,
                  remarks,
                  checklistId: resume.checklistId,
                }
              : resume.lastConfirmedFull,
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

  /** Which pile's `lastConfirmedFull` is being edited, if any — separate from
   * `confirmQueue` since editing a just-closed-out "Fully completed" step is
   * not the same flow as confirming a live in-progress one (no partial/full
   * choice, no queue advancement, no draft.selectedPileIds involvement). */
  const [editingCompletedPileId, setEditingCompletedPileId] = useState<string | null>(null);

  function openEditCompleted(pileId: string): void {
    if (!draft.resumeWorkByPileId[pileId]?.lastConfirmedFull) return;
    setEditingCompletedPileId(pileId);
  }

  /** Re-saves the finish time/remarks for the step this pile most recently
   * had marked "Fully completed" — does not touch the pile's *current*
   * (next-step) resume state at all, and does not offer switching back to
   * "Partially completed" (see plan/PR notes: reversing confirmFull's
   * next-step advancement risks conflicting with choices made later in the
   * wizard). Awaited + synced the same way as confirmPartial/confirmFull. */
  async function editConfirmedFull(pastEndIso: string, remarks: string): Promise<void> {
    const pileId = editingCompletedPileId;
    if (!pileId) return;
    const resume = draft.resumeWorkByPileId[pileId];
    const lastConfirmedFull = resume?.lastConfirmedFull;
    if (!lastConfirmedFull) return;

    await closeOutResumeStep(
      lastConfirmedFull.pastChecklistPileId,
      lastConfirmedFull.stepId,
      lastConfirmedFull.pastActualStart,
      pastEndIso,
      remarks || undefined,
    );
    if (lastConfirmedFull.checklistId) {
      await enqueueChecklistSync(lastConfirmedFull.checklistId);
    }

    onUpdate({
      resumeWorkByPileId: {
        ...draft.resumeWorkByPileId,
        [pileId]: { ...resume, lastConfirmedFull: { ...lastConfirmedFull, pastEndIso, remarks } },
      },
    });
    setEditingCompletedPileId(null);
  }

  function cancelEditCompleted(): void {
    setEditingCompletedPileId(null);
  }

  return {
    confirmQueue,
    needsResumeConfirm,
    openSingle,
    confirmPartial,
    confirmFull,
    cancel,
    editingCompletedPileId,
    openEditCompleted,
    editConfirmedFull,
    cancelEditCompleted,
  };
}
