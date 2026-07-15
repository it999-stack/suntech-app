// Auto-preselect logic for carry-over piles with pending steps from a prior plan.

import { MAX_AUTO_PRESELECT_PILES } from '@/constants/planGeneration';
import type { PileAssignment, ResumeWork } from '@/types/plan';
import type { PileWorkProgress } from '@db/schema';

export type ResumePreselection = {
  resumeWorkByPileId: Record<string, ResumeWork>;
  selectedPileIds: string[];
  assignments: Record<string, PileAssignment>;
};

export type BuildResumePreselectionInput = {
  pendingItems: PileWorkProgress[];
  activeRigIds: string[];
  activeCraneIds: string[];
  maxPiles?: number;
};

/**
 * Picks up to `maxPiles` pending piles (lowest remaining time first),
 * builds resume metadata, and auto-assigns last rig/crane when still active.
 */
export function buildResumePreselection({
  pendingItems,
  activeRigIds,
  activeCraneIds,
  maxPiles = MAX_AUTO_PRESELECT_PILES,
}: BuildResumePreselectionInput): ResumePreselection {
  const activeRigSet = new Set(activeRigIds);
  const activeCraneSet = new Set(activeCraneIds);

  const sorted = [...pendingItems].sort(
    (a, b) => a.remainingMinutes - b.remainingMinutes,
  );
  const selected = sorted.slice(0, maxPiles);

  const resumeWorkByPileId: Record<string, ResumeWork> = {};
  const selectedPileIds: string[] = [];
  const assignments: Record<string, PileAssignment> = {};

  for (const item of selected) {
    resumeWorkByPileId[item.pileId] = {
      stepId: item.stepId,
      remainingMinutes: item.remainingMinutes,
      lastRigId: item.lastRigId,
      lastCraneId: item.lastCraneId,
    };
    selectedPileIds.push(item.pileId);

    const rigActive = item.lastRigId != null && activeRigSet.has(item.lastRigId);
    const craneActive = item.lastCraneId != null && activeCraneSet.has(item.lastCraneId);
    if (rigActive && craneActive) {
      assignments[item.pileId] = {
        rig: item.lastRigId!,
        crane: item.lastCraneId!,
      };
    }
  }

  return { resumeWorkByPileId, selectedPileIds, assignments };
}

/** Pending step ids required by selected carry-over piles — not removable in StepSelectStep. */
export function getLockedStepIds(
  selectedPileIds: string[],
  resumeWorkByPileId: Record<string, ResumeWork>,
): Set<string> {
  const locked = new Set<string>();
  for (const pileId of selectedPileIds) {
    const resume = resumeWorkByPileId[pileId];
    if (resume?.stepId) locked.add(resume.stepId);
  }
  return locked;
}

/** Re-includes missing locked steps while preserving canonical step order. */
export function mergeLockedSteps(
  selectedStepIds: string[],
  missingLockedIds: string[],
  steps: Array<{ id: string }>,
): string[] {
  const merged = new Set([...selectedStepIds, ...missingLockedIds]);
  return steps.filter((s) => merged.has(s.id)).map((s) => s.id);
}
