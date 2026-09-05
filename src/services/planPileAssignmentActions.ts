// src/services/planPileAssignmentActions.ts
//
// Pure state-transition functions for assigning/unassigning a rig+crane to
// one or more piles. Moved out of PileAssignStep.tsx (commitAssignment,
// unassignSelected) so usePlanDraft's assignPiles/unassignPiles actions,
// PileAssignStep, and PreviewStep's machine-reassignment picker all call the
// same implementation.

import type { PlanDraft } from '@/types/plan';

/**
 * Assigns `rigId`(+ optional `craneId`) to every pile in `pileIds`, adding
 * any not-yet-selected pile to selectedPileIds. The append-if-missing
 * behavior is a no-op for a pile that's already selected — which covers
 * PreviewStep's single-pile reassignment (always an already-selected pile)
 * the same way it covers PileAssignStep's bulk/single assign (may include
 * newly-selected piles).
 */
export function assignPilesToMachine(
  draft: PlanDraft,
  pileIds: string[],
  rigId: string,
  craneId: string | null,
): Partial<PlanDraft> {
  const assignments = { ...draft.assignments };
  const selectedPileIds = [...draft.selectedPileIds];
  pileIds.forEach((id) => {
    assignments[id] = { rig: rigId, crane: craneId ?? undefined };
    if (!selectedPileIds.includes(id)) selectedPileIds.push(id);
  });
  return { assignments, selectedPileIds };
}

/**
 * Clears the rig/crane assignment for every pile in `pileIds` and drops them
 * from selectedPileIds — an unassigned pile is not part of the plan.
 */
export function unassignPiles(draft: PlanDraft, pileIds: string[]): Partial<PlanDraft> {
  const assignments = { ...draft.assignments };
  pileIds.forEach((id) => {
    assignments[id] = { rig: '', crane: undefined };
  });
  return {
    assignments,
    selectedPileIds: draft.selectedPileIds.filter((id) => !pileIds.includes(id)),
  };
}
