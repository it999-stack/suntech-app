// Owns the "which pile's resume-confirm modal is open" queue for the
// Review Planned Piles step — a pile with a step in progress from a previous day
// must have its remaining time confirmed before the plan can be generated.
// The actual draft mutations live in resumeConfirmActions.ts (applyConfirmResume
// and friends) — this hook only owns the queue/modal UI state and calls the
// confirmResume action usePlanDraft provides.

import { useState } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { ConfirmResumeOutcome } from '@/services/resumeConfirmActions';

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
  confirmResume: (pileId: string, outcome: ConfirmResumeOutcome) => void,
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
   * record the real stop time, then continue it today for `remainingMinutes` more. */
  async function confirmPartial(pastEndIso: string, remainingMinutes: number, remarks: string): Promise<void> {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    confirmResume(pileId, { type: 'partial', pastEndIso, remainingMinutes, remarks });
    setConfirmQueue((prev) => prev.slice(1));
  }

  /** The in-progress step actually finished on the previous day, just never
   * got logged — record the real finish time and advance to whatever step
   * comes next (or drop the pile from today's plan if there is none). */
  async function confirmFull(pastEndIso: string, remarks: string): Promise<void> {
    const pileId = confirmQueue[0];
    if (!pileId) return;
    confirmResume(pileId, { type: 'full', pastEndIso, remarks, allSteps });
    setConfirmQueue((prev) => prev.slice(1));
  }

  function cancel(): void {
    setConfirmQueue([]);
  }

  /** Which pile's `lastConfirmedFull` is being edited, if any — separate from
   * `confirmQueue` since editing a just-closed-out "Fully completed" step is
   * not the same flow as confirming a live in-progress one. */
  const [editingCompletedPileId, setEditingCompletedPileId] = useState<string | null>(null);

  function openEditCompleted(pileId: string): void {
    if (!draft.resumeWorkByPileId[pileId]?.lastConfirmedFull) return;
    setEditingCompletedPileId(pileId);
  }

  /** Re-saves the finish time/remarks for the step this pile most recently
   * had marked "Fully completed". */
  async function editConfirmedFull(pastEndIso: string, remarks: string): Promise<void> {
    const pileId = editingCompletedPileId;
    if (!pileId) return;
    confirmResume(pileId, { type: 'editFull', pastEndIso, remarks });
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
