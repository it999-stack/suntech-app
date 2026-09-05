// src/services/resumeConfirmActions.ts
//
// Pure state-transition functions for confirming/editing a resumed
// (carried-over) pile's previous-day close-out. Moved out of
// useResumeConfirmQueue.ts's confirmPartial/confirmFull/editConfirmedFull
// bodies, unchanged, so the hook keeps only the confirm-queue/modal UI state.

import type { CompletedStepInfo, PendingCloseOut, PlanDraft, ResumeWork } from '@/types/plan';
import type { PilingStep } from '@/db/schema';

export type ConfirmResumeOutcome =
  | { type: 'partial'; pastEndIso: string; remainingMinutes: number; remarks: string }
  | { type: 'full'; pastEndIso: string; remarks: string; allSteps: PilingStep[] }
  | { type: 'editFull'; pastEndIso: string; remarks: string };

/** Builds the deferred close-out record for a confirmation, or null when the
 * pile has no historical row to close out. Nothing here touches the database:
 * the write happens at generation time via flushResumeCloseOuts, so a wizard
 * the supervisor abandons leaves the previous day exactly as it was. */
export function buildPendingCloseOut(
  resume: ResumeWork | undefined,
  pastEndIso: string,
  remarks: string,
): PendingCloseOut | null {
  if (!resume?.pastChecklistPileId || !resume.stepId) return null;
  return {
    pastChecklistPileId: resume.pastChecklistPileId,
    stepId: resume.stepId,
    pastActualStart: resume.pastActualStart ?? null,
    pastEndIso,
    remarks,
    checklistId: resume.checklistId,
  };
}

/** The in-progress step was genuinely still in progress on the previous day —
 * record the real stop time, then continue it today (fresh start, filled
 * normally in Log Actuals) for `remainingMinutes` more. */
export function applyConfirmPartial(
  draft: PlanDraft,
  pileId: string,
  pastEndIso: string,
  remainingMinutes: number,
  remarks: string,
): Partial<PlanDraft> {
  const resume = draft.resumeWorkByPileId[pileId];
  const closeOut = buildPendingCloseOut(resume, pastEndIso, remarks);
  return {
    pendingCloseOuts: closeOut
      ? { ...draft.pendingCloseOuts, [pileId]: closeOut }
      : draft.pendingCloseOuts,
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
  };
}

/** The in-progress step actually finished on the previous day, just never
 * got logged — record the real finish time, and don't plan this step today:
 * advance to whatever step comes next (fresh, full duration), or drop the
 * pile from today's plan entirely if there is no next step. */
export function applyConfirmFull(
  draft: PlanDraft,
  pileId: string,
  pastEndIso: string,
  remarks: string,
  allSteps: PilingStep[],
): Partial<PlanDraft> {
  const resume = draft.resumeWorkByPileId[pileId];
  const closeOut = buildPendingCloseOut(resume, pastEndIso, remarks);
  const nextPendingCloseOuts = closeOut
    ? { ...draft.pendingCloseOuts, [pileId]: closeOut }
    : draft.pendingCloseOuts;

  const { [pileId]: _removed, ...restResumeWork } = draft.resumeWorkByPileId;

  if (resume?.nextStep) {
    // Record the step just closed out as a proper completed entry — advancing
    // the resume point to nextStep otherwise drops all trace of it (and of any
    // earlier completedSteps).
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
    return {
      pendingCloseOuts: nextPendingCloseOuts,
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
          // applyEditConfirmedFull below.
          lastConfirmedFull: resume.pastChecklistPileId
            ? {
                stepId: resume.stepId,
                stepName: resume.stepName ?? closedOutStep?.stepName ?? '',
                pastChecklistPileId: resume.pastChecklistPileId,
                pastActualStart: resume.pastActualStart ?? null,
                pastEndIso,
                remarks,
                checklistId: resume.checklistId,
                pastPlanStartTime: resume.pastPlanStartTime,
                pastPlanEndTime: resume.pastPlanEndTime,
              }
            : resume.lastConfirmedFull,
        },
      },
    };
  }

  // No next step: the pile leaves today's plan entirely. Its close-out is
  // still staged — "this finished yesterday" is a real answer about the
  // previous day, and stays true even though the pile is now unplanned.
  return {
    pendingCloseOuts: nextPendingCloseOuts,
    resumeWorkByPileId: restResumeWork,
    selectedPileIds: draft.selectedPileIds.filter((id) => id !== pileId),
  };
}

/** Re-saves the finish time/remarks for the step this pile most recently had
 * marked "Fully completed" — does not touch the pile's *current* (next-step)
 * resume state at all. */
export function applyEditConfirmedFull(
  draft: PlanDraft,
  pileId: string,
  pastEndIso: string,
  remarks: string,
): Partial<PlanDraft> {
  const resume = draft.resumeWorkByPileId[pileId];
  const lastConfirmedFull = resume?.lastConfirmedFull;
  if (!lastConfirmedFull) return {};

  return {
    pendingCloseOuts: {
      ...draft.pendingCloseOuts,
      [pileId]: {
        pastChecklistPileId: lastConfirmedFull.pastChecklistPileId,
        stepId: lastConfirmedFull.stepId,
        pastActualStart: lastConfirmedFull.pastActualStart,
        pastEndIso,
        remarks,
        checklistId: lastConfirmedFull.checklistId,
      },
    },
    resumeWorkByPileId: {
      ...draft.resumeWorkByPileId,
      [pileId]: { ...resume, lastConfirmedFull: { ...lastConfirmedFull, pastEndIso, remarks } },
    },
  };
}

/** Single named entry point covering all three outcomes above. */
export function applyConfirmResume(draft: PlanDraft, pileId: string, outcome: ConfirmResumeOutcome): Partial<PlanDraft> {
  switch (outcome.type) {
    case 'partial':
      return applyConfirmPartial(draft, pileId, outcome.pastEndIso, outcome.remainingMinutes, outcome.remarks);
    case 'full':
      return applyConfirmFull(draft, pileId, outcome.pastEndIso, outcome.remarks, outcome.allSteps);
    case 'editFull':
      return applyEditConfirmedFull(draft, pileId, outcome.pastEndIso, outcome.remarks);
  }
}
