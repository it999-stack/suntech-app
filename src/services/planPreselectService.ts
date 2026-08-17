// Auto-preselect logic for carry-over piles with pending steps from a prior plan.

import type { PileAssignment, ResumeWork } from '@/types/plan';
import type { ResumeWorkInfo } from './resumeWorkService';

export type ResumePreselection = {
  resumeWorkByPileId: Record<string, ResumeWork>;
  selectedPileIds: string[];
  assignments: Record<string, PileAssignment>;
};

export type BuildResumePreselectionInput = {
  pendingItems: ResumeWorkInfo[];
  activeRigIds: string[];
  activeCraneIds: string[];
  maxPiles: number;
};

/** Builds one pile's default resume-work draft entry from a scan result item. */
function toResumeWork(item: ResumeWorkInfo): ResumeWork {
  return {
    stepId: item.stepId,
    stepName: item.stepName,
    remainingMinutes: item.remainingMinutes,
    lastRigId: item.lastRigId,
    lastCraneId: item.lastCraneId,
    wasStarted: item.wasStarted,
    remainingTimeConfirmed: false,
    pastChecklistPileId: item.pastChecklistPileId,
    pastActualStart: item.pastActualStart,
    completedStepNames: item.completedStepNames,
    completedSteps: item.completedSteps,
    nextStep: item.nextStep,
    checklistId: item.checklistId,
    checklistDate: item.checklistDate,
  };
}

/**
 * Resume-work tracking for EVERY pending pile, uncapped — independent of how many of
 * them get auto-added to the plan (see buildResumePreselection's maxPiles). A pile the
 * user manually adds later (beyond the auto-preselect cap) still needs this entry, or
 * the "Review Planned Piles" step has nothing to flag it with and it silently replans from
 * its first step with full durations.
 */
export function buildResumeWorkByPileId(
  pendingItems: ResumeWorkInfo[],
): Record<string, ResumeWork> {
  const resumeWorkByPileId: Record<string, ResumeWork> = {};
  for (const item of pendingItems) {
    resumeWorkByPileId[item.pileId] = toResumeWork(item);
  }
  return resumeWorkByPileId;
}

/**
 * Picks up to `maxPiles` pending piles to auto-add to the plan and auto-assign last
 * rig/crane when still active. Does NOT limit resume-work tracking itself — see
 * buildResumeWorkByPileId for the uncapped version every selected pile needs, regardless
 * of whether it came from here or a manual pick.
 *
 * Genuinely in-progress piles (wasStarted — actualStart set, no actualEnd on their
 * pending step) always win a slot ahead of merely-queued ones (wasStarted false, never
 * touched): remainingMinutes is only ever a step's template duration, never derived from
 * real elapsed time (see resumeWorkService.ts), so sorting on it alone would let five
 * short, never-started piles bump out one long-running pile that's actually mid-step
 * right now — the most urgent case this preselection exists for. remainingMinutes is
 * still the tie-break within each of those two groups.
 */
export function buildResumePreselection({
  pendingItems,
  activeRigIds,
  activeCraneIds,
  maxPiles,
}: BuildResumePreselectionInput): ResumePreselection {
  const activeRigSet = new Set(activeRigIds);
  const activeCraneSet = new Set(activeCraneIds);

  const sorted = [...pendingItems].sort((a, b) => {
    if (a.wasStarted !== b.wasStarted) return a.wasStarted ? -1 : 1;
    return a.remainingMinutes - b.remainingMinutes;
  });
  const selected = sorted.slice(0, maxPiles);

  const resumeWorkByPileId: Record<string, ResumeWork> = {};
  const selectedPileIds: string[] = [];
  const assignments: Record<string, PileAssignment> = {};

  for (const item of selected) {
    resumeWorkByPileId[item.pileId] = toResumeWork(item);
    selectedPileIds.push(item.pileId);

    const rigActive = item.lastRigId != null && activeRigSet.has(item.lastRigId);
    const craneActive = item.lastCraneId != null && activeCraneSet.has(item.lastCraneId);
    // Crane is optional — re-assign whenever the rig alone is still active,
    // carrying the crane along only if it's also still active.
    if (rigActive) {
      assignments[item.pileId] = {
        rig: item.lastRigId!,
        crane: craneActive ? item.lastCraneId! : undefined,
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
