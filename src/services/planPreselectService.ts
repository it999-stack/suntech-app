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
 * Auto-preselection is a UI convenience only — it never forces a pile into
 * the plan that it can't also auto-assign a rig for. A carry-over pile whose
 * last-used rig isn't active today is simply left off the auto-selected list
 * entirely (not added to selectedPileIds with no assignment); the supervisor
 * can still add and assign it manually like any other pile, same as one that
 * never had resume work at all. Without this, an unassignable pile would sit
 * in the plan invisibly and permanently block Continue.
 */
export function buildResumePreselection({
  pendingItems,
  activeRigIds,
  activeCraneIds,
  maxPiles,
}: BuildResumePreselectionInput): ResumePreselection {
  const activeRigSet = new Set(activeRigIds);
  const activeCraneSet = new Set(activeCraneIds);

  const withProgress = pendingItems.filter(
    (item) => item.wasStarted || item.completedStepNames.length > 0,
  );

  const sorted = [...withProgress].sort((a, b) => {
    if (a.wasStarted !== b.wasStarted) return a.wasStarted ? -1 : 1;
    return a.remainingMinutes - b.remainingMinutes;
  });

  const resumeWorkByPileId: Record<string, ResumeWork> = {};
  const selectedPileIds: string[] = [];
  const assignments: Record<string, PileAssignment> = {};

  for (const item of sorted) {
    if (selectedPileIds.length >= maxPiles) break;

    const rigActive = item.lastRigId != null && activeRigSet.has(item.lastRigId);
    if (!rigActive) continue;

    const craneActive = item.lastCraneId != null && activeCraneSet.has(item.lastCraneId);
    resumeWorkByPileId[item.pileId] = toResumeWork(item);
    selectedPileIds.push(item.pileId);
    assignments[item.pileId] = {
      rig: item.lastRigId!,
      crane: craneActive ? item.lastCraneId! : undefined,
    };
  }

  return { resumeWorkByPileId, selectedPileIds, assignments };
}

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

export function mergeLockedSteps(
  selectedStepIds: string[],
  missingLockedIds: string[],
  steps: Array<{ id: string }>,
): string[] {
  const merged = new Set([...selectedStepIds, ...missingLockedIds]);
  return steps.filter((s) => merged.has(s.id)).map((s) => s.id);
}
