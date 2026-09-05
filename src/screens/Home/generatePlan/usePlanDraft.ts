// src/screens/Home/generatePlan/usePlanDraft.ts
//
// Owns the PlanDraft — the single source of truth for all editable plan
// state — and is the ONLY place setDraft is ever called. Composes:
//   - initialization (fresh / edit / resume): the one-time seeding that
//     gives the draft its starting shape, driven by which mode the screen
//     was opened in.
//   - actions: the named, ongoing mutators every step component and
//     usePlanPreview call instead of a generic patch setter.
// Every action (and every internal seed/prune path) is a thin setDraft
// wrapper around a pure (draft, ...args) => Partial<PlanDraft> function
// living in a services/*.ts file — see those files for the actual
// state-transition logic.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PilingChecklistPile, PilingDailyChecklist, PilingLocation, PilingShiftType, PilingSitePersonnel, PilingSiteRoleDefault, PilingStep } from '@/db/schema';
import { defaultPlanDraft, type PlanDraft } from '@/types/plan';
import { toLocalDateStr, toLocalIsoString } from '@/utils/formatTime';
import { getPrimaryShiftType, combineDateAndTime } from '@/utils/shiftHelpers';
import type { Step } from '@components/plan/generate/ProgressHeader';
import { findResumeWorkForPiles, type ResumeWorkInfo } from '@/services/resumeWorkService';
import { applyLocationSelection } from '@/services/planLocationActions';
import { pruneInactiveMachines, toggleMachineActive } from '@/services/planMachineActions';
import { assignPilesToMachine, unassignPiles as unassignPilesAction } from '@/services/planPileAssignmentActions';
import { setMachineRole as setMachineRoleAction, setPlanningEngineer as setPlanningEngineerAction, setProjectManager as setProjectManagerAction, setShiftIncharge as setShiftInchargeAction } from '@/services/planTeamActions';
import { applyConfirmResume, type ConfirmResumeOutcome } from '@/services/resumeConfirmActions';
import { applyResumePreselection } from '@/services/planPreselectService';
import type { RoleDefaultsSeed } from '@/services/planRoleDefaultsSeedService';

import type { EligiblePile, SimpleMachine } from './useGeneratePlanData';
import { useEditModeSeed } from './useEditModeSeed';
import { useRoleDefaultsSeed } from './useRoleDefaultsSeed';
import { useMachineStatusGuard } from './useMachineStatusGuard';
import { usePilePreselection } from './usePilePreselection';

export type PlanDraftActions = {
  setLocations: (nextLocationIds: string[]) => void;
  toggleMachine: (machineId: string, type: 'RIG' | 'CRANE') => void;
  setSteps: (nextStepIds: string[]) => void;
  assignPiles: (pileIds: string[], rigId: string, craneId: string | null) => void;
  unassignPiles: (pileIds: string[]) => void;
  setMachineRole: (slot: 1 | 2, role: 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR', machineId: string, personnelId: string | null) => void;
  setShiftIncharge: (slot: 1 | 2, personnelId: string | null) => void;
  setProjectManager: (personnelId: string | null) => void;
  setPlanningEngineer: (personnelId: string | null) => void;
  setStartTime: (picked: Date) => void;
  confirmResume: (pileId: string, outcome: ConfirmResumeOutcome) => void;
  reorderPiles: (newOrder: string[]) => void;
  /** Internal-only — used by usePlanPreview's debounced track-override commit. Never given to a step component. */
  setStepTrackOverrides: (overrides: PlanDraft['stepTrackOverrides']) => void;
};

export function usePlanDraft(args: {
  siteId: string;
  targetDate: string;
  isEditMode: boolean;
  step: Step;
  setStep: (step: Step) => void;
  checklist: PilingDailyChecklist | null;
  checklistPiles: PilingChecklistPile[];
  checklistLoading: boolean;
  resources: {
    piles: EligiblePile[];
    locations: PilingLocation[];
    steps: PilingStep[];
    rigs: SimpleMachine[];
    cranes: SimpleMachine[];
    personnel: PilingSitePersonnel[];
    shifts: PilingShiftType[];
    roleDefaults: PilingSiteRoleDefault[];
    dataLoading: boolean;
  };
}): {
  draft: PlanDraft;
  actions: PlanDraftActions;
  editSeeding: boolean;
  locationPiles: EligiblePile[];
  selectedLocations: PilingLocation[];
  selectedPlanPiles: EligiblePile[];
  assignablePiles: EligiblePile[];
  pilesWithCompletion: (EligiblePile & { completed: boolean })[];
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
} {
  const { siteId, targetDate, isEditMode, step, setStep, checklist, checklistPiles, checklistLoading, resources } = args;
  const { piles, locations, steps, rigs, cranes, personnel, shifts, roleDefaults, dataLoading } = resources;

  const [draft, setDraft] = useState<PlanDraft>(() => defaultPlanDraft(targetDate));

  const actions: PlanDraftActions = useMemo(() => ({
    setLocations: (nextLocationIds) => setDraft((d) => ({ ...d, ...applyLocationSelection(d, nextLocationIds) })),
    toggleMachine: (machineId, type) => setDraft((d) => ({ ...d, ...toggleMachineActive(d, machineId, type) })),
    setSteps: (nextStepIds) => setDraft((d) => ({ ...d, selectedStepIds: nextStepIds })),
    assignPiles: (pileIds, rigId, craneId) => setDraft((d) => ({ ...d, ...assignPilesToMachine(d, pileIds, rigId, craneId) })),
    unassignPiles: (pileIds) => setDraft((d) => ({ ...d, ...unassignPilesAction(d, pileIds) })),
    setMachineRole: (slot, role, machineId, personnelId) => setDraft((d) => ({ ...d, ...setMachineRoleAction(d, slot, role, machineId, personnelId) })),
    setShiftIncharge: (slot, personnelId) => setDraft((d) => ({ ...d, ...setShiftInchargeAction(d, slot, personnelId) })),
    setProjectManager: (personnelId) => setDraft((d) => ({ ...d, ...setProjectManagerAction(d, personnelId) })),
    setPlanningEngineer: (personnelId) => setDraft((d) => ({ ...d, ...setPlanningEngineerAction(d, personnelId) })),
    setStartTime: (picked) => setDraft((d) => ({ ...d, date: toLocalDateStr(picked), planStartTime: toLocalIsoString(picked) })),
    confirmResume: (pileId, outcome) => setDraft((d) => ({ ...d, ...applyConfirmResume(d, pileId, outcome) })),
    reorderPiles: (newOrder) => setDraft((d) => ({ ...d, selectedPileIds: newOrder })),
    setStepTrackOverrides: (overrides) => setDraft((d) => ({ ...d, stepTrackOverrides: overrides })),
  }), []);

  // ── Initialization — fresh / edit / resume ──────────────────────────────

  const seedRoleDefaults = useCallback(
    (seed: RoleDefaultsSeed) => setDraft((d) => ({
      ...d,
      activeRigIds: seed.activeRigIds,
      activeCraneIds: seed.activeCraneIds,
      checklistPersonnel: {
        ...d.checklistPersonnel,
        projectManagerId: seed.projectManagerId,
        planningEngineerId: seed.planningEngineerId,
        shift1: seed.shift1,
        shift2: seed.shift2,
      },
    })),
    [],
  );
  const seedFromChecklist = useCallback((nextDraft: PlanDraft) => setDraft(nextDraft), []);
  const applyPrune = useCallback(
    (staleRigIds: string[], staleCraneIds: string[]) =>
      setDraft((d) => ({ ...d, ...pruneInactiveMachines(d, staleRigIds, staleCraneIds) })),
    [],
  );
  const preselectResumeWork = useCallback(
    (preselectArgs: { pendingWorkItems: ResumeWorkInfo[]; maxAutoPreselectPiles: number }) =>
      setDraft((d) => ({ ...d, ...applyResumePreselection(d, preselectArgs) })),
    [],
  );
  const seedPlanStartTime = useCallback((iso: string) => setDraft((d) => ({ ...d, planStartTime: iso })), []);

  // Same simplification useGeneratePlanData's raw personnel rows get in
  // GeneratePlanScreen for the step components — needed here too since
  // buildRoleDefaultsSeed takes the simplified shape.
  const simplePersonnel = useMemo(
    () => personnel.map((p) => ({ id: p.id, name: p.name, designation: p.designation, isActive: p.isActive })),
    [personnel],
  );

  useRoleDefaultsSeed({ dataLoading, isEditMode, rigs, cranes, roleDefaults, personnel: simplePersonnel, applySeed: seedRoleDefaults });

  const { editSeeding } = useEditModeSeed({
    isEditMode, dataLoading, checklistLoading, checklist, checklistPiles, piles, steps,
    applySeed: seedFromChecklist, setStep,
  });

  useMachineStatusGuard({ dataLoading, editSeeding, rigs, cranes, draft, applyPrune });

  // Seed planStartTime's time-of-day from the site's primary (earliest-start)
  // shift once shift data loads, instead of the generic 8:00 AM default —
  // skipped in edit mode, which seeds planStartTime from the existing checklist.
  const planStartSeeded = useRef(false);
  useEffect(() => {
    if (dataLoading || planStartSeeded.current || isEditMode) return;
    const siteShifts = shifts.filter((s) => s.siteId === siteId);
    const primary = getPrimaryShiftType(siteShifts);
    if (!primary) return;
    planStartSeeded.current = true;
    seedPlanStartTime(combineDateAndTime(targetDate, primary.startTime));
  }, [dataLoading, shifts, siteId, targetDate, isEditMode, seedPlanStartTime]);

  // Default step selection: all selected on mount (after data loads)
  useEffect(() => {
    if (!dataLoading && steps.length && draft.selectedStepIds.length === 0) {
      actions.setSteps(steps.map((s) => s.id));
    }
  }, [dataLoading, steps, draft.selectedStepIds.length, actions]);

  // ── Derived views ────────────────────────────────────────────────────────

  const locationPiles = useMemo(() => {
    if (!draft.locationIds.length) return [];
    return piles.filter((p) => p.locationId && draft.locationIds.includes(p.locationId));
  }, [piles, draft.locationIds]);

  const selectedLocations = useMemo(
    () => locations.filter((l) => draft.locationIds.includes(l.id)),
    [locations, draft.locationIds],
  );

  const selectedPlanPiles = useMemo(
    () => draft.selectedPileIds.flatMap((id) => piles.find((p) => p.id === id) ?? []),
    [piles, draft.selectedPileIds],
  );

  const [pendingWorkItems, setPendingWorkItems] = useState<ResumeWorkInfo[]>([]);
  const [completedPileIds, setCompletedPileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!locationPiles.length) {
      setPendingWorkItems([]);
      setCompletedPileIds(new Set());
      return;
    }
    let cancelled = false;
    findResumeWorkForPiles(siteId, locationPiles.map((pile) => pile.id), targetDate).then(
      ({ pendingWorkItems, completedPileIds }) => {
        if (!cancelled) {
          setPendingWorkItems(pendingWorkItems);
          setCompletedPileIds(new Set(completedPileIds));
        }
      },
    );
    return () => { cancelled = true; };
  }, [locationPiles, siteId, targetDate]);

  usePilePreselection({ step, draft, pendingWorkItems, steps, applySeed: preselectResumeWork, setSteps: actions.setSteps });

  // Piles already fully completed on a prior day must not be re-offered here.
  const assignablePiles = useMemo(
    () => locationPiles.filter((p) => !completedPileIds.has(p.id)),
    [locationPiles, completedPileIds],
  );

  // PileAssignStep shows every location pile (including prior-day-completed
  // ones) for full area visibility — completed rows render faded/non-selectable
  // there. Every other consumer keeps assignablePiles.
  const pilesWithCompletion = useMemo(
    () => locationPiles.map((p) => ({ ...p, completed: completedPileIds.has(p.id) })),
    [locationPiles, completedPileIds],
  );

  const activeRigs = useMemo(
    () => rigs.filter((r) => draft.activeRigIds.includes(r.id)),
    [rigs, draft.activeRigIds],
  );

  const activeCranes = useMemo(
    () => cranes.filter((c) => draft.activeCraneIds.includes(c.id)),
    [cranes, draft.activeCraneIds],
  );

  return {
    draft, actions, editSeeding,
    locationPiles, selectedLocations, selectedPlanPiles, assignablePiles, pilesWithCompletion,
    activeRigs, activeCranes,
  };
}
