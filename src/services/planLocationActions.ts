// src/services/planLocationActions.ts
//
// Pure state-transition function for changing which locations are in scope
// for the plan. Moved out of LocationSelectStep.tsx so usePlanDraft's
// setLocations action and LocationSelectStep call the same implementation.

import type { PlanDraft } from '@/types/plan';

/**
 * Changing which locations are in scope invalidates every pile-dependent
 * field of the draft — a pile from a deselected location must not linger in
 * selectedPileIds/assignments, and any resume work or staged close-out tied
 * to it must go with it. stepTrackOverrides is keyed by pile id too, so it
 * resets for the same reason.
 */
export function applyLocationSelection(_draft: PlanDraft, nextLocationIds: string[]): Partial<PlanDraft> {
  return {
    locationIds: nextLocationIds,
    selectedPileIds: [],
    assignments: {},
    resumeWorkByPileId: {},
    pendingCloseOuts: {},
    stepTrackOverrides: {},
  };
}
