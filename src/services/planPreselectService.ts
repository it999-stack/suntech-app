// Auto-preselect logic for carry-over piles with pending steps from a prior plan.

import type { PileAssignment, PlanDraft, ResumeWork } from '@/types/plan';
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
    pastPlanStartTime: item.pastPlanStartTime,
    pastPlanEndTime: item.pastPlanEndTime,
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

/**
 * Composes buildResumePreselection/buildResumeWorkByPileId above with the
 * "don't clobber the user's own manual picks" merge that used to live inline
 * in usePilePreselection's setDraft callback: a pile the user already
 * selected/assigned manually (i.e. not part of this recompute's
 * auto-preselection) keeps its assignment, and a pile whose remaining-time
 * confirmation the user already answered keeps that confirmation instead of
 * being reset back to unconfirmed every time this recomputes (e.g. active
 * rigs/cranes changed).
 */
export function applyResumePreselection(
  draft: PlanDraft,
  args: { pendingWorkItems: ResumeWorkInfo[]; maxAutoPreselectPiles: number },
): Partial<PlanDraft> {
  const { pendingWorkItems, maxAutoPreselectPiles } = args;

  const preselection = buildResumePreselection({
    pendingItems: pendingWorkItems,
    activeRigIds: draft.activeRigIds,
    activeCraneIds: draft.activeCraneIds,
    maxPiles: maxAutoPreselectPiles,
  });
  // Uncapped — every pending pile gets tracked, not just the auto-preselected subset,
  // so a pile added later (manually, past the auto-preselect cap) is still flagged by
  // the review Planned Piles step. See buildResumeWorkByPileId's own docstring.
  const allResumeWorkByPileId = buildResumeWorkByPileId(pendingWorkItems);

  const manualIds = draft.selectedPileIds.filter((id) => !preselection.selectedPileIds.includes(id));
  // Crane is optional — a rig-only assignment still counts as "confirmed"
  // and must not be dropped just because it has no crane.
  const manualAssignments = Object.fromEntries(
    manualIds
      .filter((id) => draft.assignments[id]?.rig)
      .map((id) => [id, draft.assignments[id]]),
  );
  const confirmedOverrides = Object.fromEntries(
    Object.entries(draft.resumeWorkByPileId).filter(([, r]) => r.remainingTimeConfirmed),
  );

  return {
    selectedPileIds: [...preselection.selectedPileIds, ...manualIds],
    assignments: { ...manualAssignments, ...preselection.assignments },
    resumeWorkByPileId: { ...allResumeWorkByPileId, ...confirmedOverrides },
  };
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
