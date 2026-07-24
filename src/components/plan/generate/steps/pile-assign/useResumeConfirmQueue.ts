// Gate: piles with a step in progress must have remaining time confirmed
// before an assignment can go through. Owns the confirm queue + the
// pending assignment waiting on it.

import { useState } from 'react';
import { saveResumeRemarks } from '@/services/resumeWorkService';
import type { PlanDraft } from '@/types/plan';

interface PendingAssignment { rigId: string; craneId: string; pileIds: string[]; }

export function useResumeConfirmQueue(
  draft: PlanDraft,
  onUpdate: (patch: Partial<PlanDraft>) => void,
  onCommit: (rigId: string, craneId: string, pileIds: string[]) => void,
) {
  const [confirmQueue, setConfirmQueue] = useState<string[]>([]);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);

  function needsResumeConfirm(pileId: string): boolean {
    const resume = draft.resumeWorkByPileId[pileId];
    return !!resume?.wasStarted && !resume.remainingTimeConfirmed;
  }

  function start(rigId: string, craneId: string, pileIds: string[]): boolean {
    const unconfirmed = pileIds.filter(needsResumeConfirm);
    if (unconfirmed.length === 0) return false;
    setPendingAssignment({ rigId, craneId, pileIds });
    setConfirmQueue(unconfirmed);
    return true;
  }

  /**
   * For piles that already have a rig/crane assigned (e.g. auto-preselected
   * carry-over work) and just need remaining time confirmed — no new
   * assignment to commit, so no pendingAssignment is set.
   */
  function startAutoConfirm(pileIds: string[]): void {
    const unconfirmed = pileIds.filter(needsResumeConfirm);
    if (unconfirmed.length === 0) return;
    setConfirmQueue(unconfirmed);
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

    const rest = confirmQueue.slice(1);
    setConfirmQueue(rest);
    if (rest.length === 0 && pendingAssignment) {
      onCommit(pendingAssignment.rigId, pendingAssignment.craneId, pendingAssignment.pileIds);
      setPendingAssignment(null);
    }
  }

  function cancel(): void {
    setConfirmQueue([]);
    setPendingAssignment(null);
  }

  return { confirmQueue, needsResumeConfirm, start, startAutoConfirm, confirm, cancel };
}