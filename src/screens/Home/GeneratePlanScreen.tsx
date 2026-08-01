// src/screens/Home/GeneratePlanScreen.tsx
// Multi-step wizard for generating (or editing) a daily pile plan.
// Owns transient PlanDraft state; commits to SQLite only on the final "Generate" press.
//

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AlertTriangle } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import ReorderPilesOverlay from '@components/plan/generate/preview/ReorderPilesOverlay';
import type { MachineInfo } from '@/types/timeline';

import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import { usePlan, type PileAssignmentInput, type GeneratePlanInput } from '@state/PlanContext';
import { useAuthStore } from '@/store/authStore';
import { useWorkingDate } from '@/store/workingDateStore';

import ProgressHeader, { type Step, STEP_ORDER } from '@components/plan/generate/ProgressHeader';
import StartTimeStep from '@components/plan/generate/steps/StartTimeStep';
import AreaSelectStep from '@components/plan/generate/steps/AreaSelectStep';
import MachineSelectStep from '@components/plan/generate/steps/MachineSelectStep';
import PileAssignStep from '@components/plan/generate/steps/PileAssignStep';
import TeamAssignStep from '@components/plan/generate/steps/TeamAssignStep';
import ShiftInchargeStep from '@components/plan/generate/steps/ShiftInchargeStep';
import StepSelectStep from '@components/plan/generate/steps/StepSelectStep';
import PreviewStep, { type PreviewPile } from '@components/plan/generate/steps/PreviewStep';

import { getPilesBySiteWithDimensions, PileWithDimension } from '@repositories/pilesRepository';
import { getAreasBySite } from '@repositories/areasRepository';
import { findResumeWorkForPiles, type ResumeWorkInfo } from '@/services/resumeWorkService';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getRoleDefaultsBySite } from '@repositories/roleDefaultsRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getSteps } from '@repositories/stepsRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import {
  generatePlanPreview,
  fetchPlanReferenceData,
  type EffectivePlanWindow,
  type PlanTemplateRow,
  type PlanRawWindow,
} from '@/services/pilingPlannerService';
import { countOverrideDiff } from '@components/plan/generate/preview/previewUtils';
import { buildResumePreselection, getLockedStepIds, mergeLockedSteps } from '@/services/planPreselectService';
import type { PilingArea, PilingSitePersonnel, PilingShiftType, PilingStep, PilingSiteRoleDefault } from '@/db/schema';
import { getPlanStepsForChecklist, type PlanStepWithMeta } from '@repositories/planRepository';
import { defaultPlanDraft, planEndTime, type PlanDraft } from '@/types/plan';
import { getPrimaryShiftType, combineDateAndTime } from '@/utils/shiftHelpers';
import { toLocalDateStr } from '@/utils/formatTime';

type EligiblePile = PileWithDimension & {
  /** Alias for pileIdCode for convenience */
  code: string;
};

type SimpleMachine = { id: string; machineNo: string; description?: string | null };

export default function GeneratePlanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isEditMode: boolean = route.params?.edit === true;

  const user = useAuthStore((s) => s.user);
  const {
    checklist,
    checklistPiles,
    generatePlan,
    loadChecklist,
    isGenerating,
    error: planError,
    isLoading: checklistLoading,
  } = usePlan();

  const siteId = user?.siteId ?? ''; // siteId is string | undefined; fallback to ''
  // Literal device date — used only for "today"/"today's" copy phrasing below,
  // never as the default target date (that's the working date's job).
  const today = toLocalDateStr(new Date());
  const workingDate = useWorkingDate();
  // The date this screen is generating/editing a plan for — defaults to the
  // working date when opened without a date param (e.g. the existing
  // "edit today's plan" path from Home, which normally IS the working date).
  const targetDate: string = route.params?.date ?? workingDate;

  // Load the checklist for the target date into PlanContext — HomeScreen only
  // ever loads today's checklist on mount, so a future-day edit needs its own load.
  useEffect(() => {
    if (siteId) loadChecklist(siteId, targetDate);
  }, [siteId, targetDate, loadChecklist]);

  const [piles, setPiles] = useState<EligiblePile[]>([]);
  const [areas, setAreas] = useState<PilingArea[]>([]);
  const [steps, setSteps] = useState<PilingStep[]>([]);
  const [rigs, setRigs] = useState<SimpleMachine[]>([]);
  const [cranes, setCranes] = useState<SimpleMachine[]>([]);
  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<PilingSiteRoleDefault[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  // True until the edit-mode draft-seeding effect below has fully applied the
  // existing checklist and jumped to the preview step — keeps the wizard's
  // loading gate up so it never renders on the default 'start' step first.
  const [editSeeding, setEditSeeding] = useState(isEditMode);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        const [pilesRaw, stepsRaw, rigsRaw, cranesRaw, personnelRaw, shiftsRaw, areasRaw, roleDefaultsRaw] = await Promise.all([
          getPilesBySiteWithDimensions(siteId),
          getSteps(),
          getMachinesByType(siteId, 'RIG'),
          getMachinesByType(siteId, 'CRANE'),
          getPersonnelBySite(siteId),
          getAllShiftTypes(),
          getAreasBySite(siteId),
          getRoleDefaultsBySite(siteId),
        ]);
if (cancelled) return;
        setPiles(
          pilesRaw.map((p) => ({
            ...p,
            code: p.pileIdCode,
          })),
        );
        setSteps(stepsRaw);
        setRigs(rigsRaw.map((r: typeof rigsRaw[0]) => ({ id: r.id, machineNo: r.machineNo })));
        setCranes(cranesRaw.map((c: typeof cranesRaw[0]) => ({ id: c.id, machineNo: c.machineNo })));
        setPersonnel(personnelRaw);
        setShifts(shiftsRaw);
        setAreas(areasRaw);
        setRoleDefaults(roleDefaultsRaw);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const simplePersonnel = useMemo(
    () => personnel.map((p) => ({ id: p.id, name: p.name, designation: p.designation })),
    [personnel],
  );

  const [draft, setDraft] = useState<PlanDraft>(() => defaultPlanDraft(targetDate));

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
    setDraft((prev) => ({ ...prev, planStartTime: combineDateAndTime(targetDate, primary.startTime) }));
  }, [dataLoading, shifts, siteId, targetDate, isEditMode]);

  const areaPiles = useMemo(() => {
    if (!draft.areaIds.length) return [];
    return piles.filter((p) => p.areaId && draft.areaIds.includes(p.areaId));
  }, [piles, draft.areaIds]);

  const selectedAreas = useMemo(
    () => areas.filter((a) => draft.areaIds.includes(a.id)),
    [areas, draft.areaIds],
  );

  const selectedPlanPiles = useMemo(
    () => draft.selectedPileIds.flatMap((id) => piles.find((p) => p.id === id) ?? []),
    [piles, draft.selectedPileIds],
  );

  const [pendingWorkItems, setPendingWorkItems] = useState<ResumeWorkInfo[]>([]);
  const [completedPileIds, setCompletedPileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!areaPiles.length) {
      setPendingWorkItems([]);
      setCompletedPileIds(new Set());
      return;
    }
    let cancelled = false;
    findResumeWorkForPiles(siteId, areaPiles.map((pile) => pile.id), targetDate).then(
      ({ pendingWorkItems, completedPileIds }) => {
        if (!cancelled) {
          setPendingWorkItems(pendingWorkItems);
          setCompletedPileIds(new Set(completedPileIds));
        }
      },
    );
    return () => { cancelled = true; };
  }, [areaPiles, siteId, targetDate]);

  // Piles already fully completed on a prior day must not be re-offered here.
  const assignablePiles = useMemo(
    () => areaPiles.filter((p) => !completedPileIds.has(p.id)),
    [areaPiles, completedPileIds],
  );

  function updateDraft(patch: Partial<PlanDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  // Seed draft in edit mode once data loads
  const seeded = useRef(false);
  useEffect(() => {
    if (!isEditMode || dataLoading || !checklist || !checklistPiles.length || seeded.current) return;
    seeded.current = true;

    (async () => {
      const ids = checklistPiles.map((cp) => cp.pileId);
      const assignments: PlanDraft['assignments'] = {};
      checklistPiles.forEach((cp) => {
        assignments[cp.pileId] = { rig: cp.rigId, crane: cp.craneId };
      });

      // Areas aren't stored on the checklist itself — recover them from the
      // areaId of each checklist pile so AreaSelectStep and PileAssignStep
      // (which both derive from draft.areaIds) preselect correctly on edit.
      const pileById = new Map(piles.map((p) => [p.id, p]));
      const areaIds = [...new Set(
        ids
          .map((pileId) => pileById.get(pileId)?.areaId)
          .filter((areaId): areaId is string => !!areaId),
      )];

      const personnelRows = await getChecklistPersonnel(checklist.id);
      const byRole = (role: string) => personnelRows.filter((r) => r.role === role);

      // Reconstruct which CRANE-track steps were previously overridden onto the
      // Rig — this is never persisted as its own field (see stepTrackOverrides'
      // one-off design), only ever expressed through the real plan step's
      // assigned_machine_id — so on re-entering edit mode we derive it back from
      // the checklist's actual persisted schedule, otherwise the very first local
      // recompute below would silently revert those steps back to Crane.
      const craneStepIds = new Set(steps.filter((s) => s.track === 'CRANE').map((s) => s.id));
      const checklistPileById = new Map(checklistPiles.map((cp) => [cp.id, cp]));
      const planStepRows = await getPlanStepsForChecklist(checklist.id);
      const stepTrackOverrides: PlanDraft['stepTrackOverrides'] = {};
      for (const row of planStepRows) {
        if (!craneStepIds.has(row.stepId)) continue;
        const cp = checklistPileById.get(row.checklistPileId);
        if (!cp || row.assignedMachineId !== cp.rigId) continue;
        const forPile = stepTrackOverrides[cp.pileId] ?? [];
        forPile.push(row.stepId);
        stepTrackOverrides[cp.pileId] = forPile;
      }
      const checklistPersonnel: PlanDraft['checklistPersonnel'] = {
        projectManagerId: byRole('PROJECT_MANAGER')[0]?.personnelId ?? null,
        planningEngineerId: byRole('PLANNING_ENGINEER')[0]?.personnelId ?? null,
        shiftInchargeId: byRole('SHIFT_INCHARGE').find((r) => r.shiftSlot === 1)?.personnelId ?? null,
        shiftInchargeId2: byRole('SHIFT_INCHARGE').find((r) => r.shiftSlot === 2)?.personnelId ?? null,
        engineerByMachineId: Object.fromEntries(
          byRole('ENGINEER')
            .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
            .map((r) => [r.machineId, r.personnelId]),
        ),
        supervisorByMachineId: Object.fromEntries(
          byRole('SUPERVISOR')
            .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
            .map((r) => [r.machineId, r.personnelId]),
        ),
        operatorByMachineId: Object.fromEntries(
          byRole('MACHINE_OPERATOR')
            .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
            .map((r) => [r.machineId, r.personnelId]),
        ),
      };

      setDraft({
        date: checklist.date,
        planStartTime: checklist.planStartTime ?? defaultPlanDraft(checklist.date).planStartTime,
        activeRigIds: [...new Set(checklistPiles.map((cp) => cp.rigId))],
        activeCraneIds: [...new Set(checklistPiles.map((cp) => cp.craneId))],
        selectedPileIds: ids,
        areaIds,
        selectedStepIds: steps.map((s) => s.id),
        assignments,
        resumeWorkByPileId: {},
        stepTrackOverrides,
        checklistPersonnel,
        shiftTypeId: checklist.shiftTypeId ?? null,
      });

      // Skip directly to the preview step when editing an existing plan
      setStep('preview');
      setEditSeeding(false);
    })();
  }, [isEditMode, dataLoading, checklist, checklistPiles, piles]);

  // Edit mode was requested but no checklist exists for this date — nothing
  // to seed, so release the loading gate and fall back to the normal wizard.
  useEffect(() => {
    if (!isEditMode || checklistLoading || checklist || seeded.current) return;
    setEditSeeding(false);
  }, [isEditMode, checklistLoading, checklist]);

  // Default step selection: all selected on mount (after data loads)
  useEffect(() => {
    if (!dataLoading && steps.length && draft.selectedStepIds.length === 0) {
      setDraft((prev) => ({
        ...prev,
        selectedStepIds: steps.map((s) => s.id),
      }));
    }
  }, [dataLoading, steps, draft.selectedStepIds.length]);

  // Pre-fill every role from the site's last-used defaults (reuse
  // requirement). Machines with a saved MACHINE_OPERATOR default come in
  // pre-assigned/active; machines without one stay unassigned/inactive
  // until the user manually assigns an operator in MachineSelectStep.
  const roleDefaultsSeeded = useRef(false);
  useEffect(() => {
    if (dataLoading || roleDefaultsSeeded.current || isEditMode) return;
    if (rigs.length === 0 && cranes.length === 0 && roleDefaults.length === 0) return;
    roleDefaultsSeeded.current = true;

    const rigIds = new Set(rigs.map((r) => r.id));
    const craneIds = new Set(cranes.map((c) => c.id));
    const findSingleton = (role: string, shiftSlot?: number) =>
      roleDefaults.find((d) => d.role === role && (d.shiftSlot ?? null) === (shiftSlot ?? null))?.personnelId ?? null;

    const engineerByMachineId: Record<string, string> = {};
    const supervisorByMachineId: Record<string, string> = {};
    const operatorByMachineId: Record<string, string> = {};
    for (const d of roleDefaults) {
      if (!d.machineId || (!rigIds.has(d.machineId) && !craneIds.has(d.machineId))) continue;
      // Engineers are only ever assigned to rigs — a stale/legacy ENGINEER
      // default for a crane must not resurrect an assignment the Team step
      // no longer lets a user create.
      if (d.role === 'ENGINEER') {
        if (rigIds.has(d.machineId)) engineerByMachineId[d.machineId] = d.personnelId;
      } else if (d.role === 'SUPERVISOR') supervisorByMachineId[d.machineId] = d.personnelId;
      else if (d.role === 'MACHINE_OPERATOR') operatorByMachineId[d.machineId] = d.personnelId;
    }

    setDraft((prev) => ({
      ...prev,
      activeRigIds: rigs.filter((r) => !!operatorByMachineId[r.id]).map((r) => r.id),
      activeCraneIds: cranes.filter((c) => !!operatorByMachineId[c.id]).map((c) => c.id),
      checklistPersonnel: {
        ...prev.checklistPersonnel,
        projectManagerId: findSingleton('PROJECT_MANAGER'),
        planningEngineerId: findSingleton('PLANNING_ENGINEER'),
        shiftInchargeId: findSingleton('SHIFT_INCHARGE', 1),
        shiftInchargeId2: findSingleton('SHIFT_INCHARGE', 2),
        engineerByMachineId,
        supervisorByMachineId,
        operatorByMachineId,
      },
    }));
  }, [dataLoading, roleDefaults, isEditMode, rigs, cranes]);

  const [step, setStep] = useState<Step>('start');
  const preselectKeyRef = useRef('');

  useEffect(() => {
    preselectKeyRef.current = '';
  }, [draft.areaIds]);

  useEffect(() => {
    if (step !== 'piles') return;

    const preselectKey = [
      pendingWorkItems.map((p) => p.pileId).join(','),
      draft.activeRigIds.join(','),
      draft.activeCraneIds.join(','),
    ].join('|');

    if (preselectKeyRef.current === preselectKey) return;
    preselectKeyRef.current = preselectKey;

    const preselection = buildResumePreselection({
      pendingItems: pendingWorkItems,
      activeRigIds: draft.activeRigIds,
      activeCraneIds: draft.activeCraneIds,
    });

    setDraft((prev) => {
      const manualIds = prev.selectedPileIds.filter(
        (id) => !preselection.selectedPileIds.includes(id),
      );
      const manualAssignments = Object.fromEntries(
        manualIds
          .filter((id) => prev.assignments[id]?.rig && prev.assignments[id]?.crane)
          .map((id) => [id, prev.assignments[id]]),
      );

      return {
        ...prev,
        selectedPileIds: [...preselection.selectedPileIds, ...manualIds],
        assignments: { ...manualAssignments, ...preselection.assignments },
        resumeWorkByPileId: preselection.resumeWorkByPileId,
      };
    });
  }, [step, pendingWorkItems, draft.activeRigIds, draft.activeCraneIds]);

  useEffect(() => {
    if (step !== 'steps') return;

    const locked = getLockedStepIds(draft.selectedPileIds, draft.resumeWorkByPileId);
    if (locked.size === 0) return;

    const missing = [...locked].filter((id) => !draft.selectedStepIds.includes(id));
    if (missing.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      selectedStepIds: mergeLockedSteps(prev.selectedStepIds, missing, steps),
    }));
  }, [step, draft.selectedPileIds, draft.resumeWorkByPileId, draft.selectedStepIds, steps]);

  function goNext() {
    if (step === 'preview') {
      // In edit mode, show confirmation modal before saving
      if (isEditMode) {
        setConfirmModalVisible(true);
        return;
      }
      handleGenerate();
      return;
    }

    const idx = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  }

  function goToPrevStep() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx === 0) return;

    setStep(STEP_ORDER[idx - 1]);
  }

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const canContinue = useMemo(() => {
    switch (step) {
      case 'start':
        return (
          !!draft.checklistPersonnel.projectManagerId &&
          !!draft.checklistPersonnel.planningEngineerId
        );
      case 'area':
        return draft.areaIds.length > 0;
      case 'machines': {
        const allMachineIds = [...draft.activeRigIds, ...draft.activeCraneIds];
        return (
          allMachineIds.length > 0 &&
          allMachineIds.every((id) => !!draft.checklistPersonnel.operatorByMachineId[id])
        );
      }
      case 'team': {
        const allMachineIds = [...draft.activeRigIds, ...draft.activeCraneIds];
        return (
          allMachineIds.length > 0 &&
          draft.activeRigIds.every((id) => !!draft.checklistPersonnel.engineerByMachineId[id]) &&
          allMachineIds.every((id) => !!draft.checklistPersonnel.supervisorByMachineId[id])
        );
      }
      case 'piles':
        return (
          draft.selectedPileIds.length > 0 &&
          draft.selectedPileIds.every(
            (id) => draft.assignments[id]?.rig && draft.assignments[id]?.crane,
          )
        );
      case 'steps':
        return draft.selectedStepIds.length > 0;
      default:
        return true;
    }
  }, [step, draft]);

  const [previewSteps, setPreviewSteps] = useState<PlanStepWithMeta[]>([]);
  const [previewWarningPileIds, setPreviewWarningPileIds] = useState<string[]>([]);
  const [previewWindowsByMachineId, setPreviewWindowsByMachineId] = useState<
    Record<string, EffectivePlanWindow[]>
  >({});
  const [previewLoading, setPreviewLoading] = useState(false);

  // Duration templates + non-working windows are 100% static for the whole
  // wizard session (only siteId/shiftTypeId can actually change them) — fetched
  // once here instead of on every recompute, so tapping "Confirm Reassignment"
  // doesn't re-hit SQLite for data that hasn't moved. Cleared automatically
  // when this screen unmounts; refetched only if siteId/shiftTypeId change.
  const [planReferenceData, setPlanReferenceData] = useState<{
    templateRows: PlanTemplateRow[];
    rawWindows: PlanRawWindow[];
  } | null>(null);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetchPlanReferenceData({ siteId, shiftTypeId: draft.shiftTypeId ?? undefined }).then((data) => {
      if (!cancelled) setPlanReferenceData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, draft.shiftTypeId]);

  // Not-yet-confirmed Rig/Crane tile selections from the Preview step's PilesAccordion.
  // Tapping a tile only ever updates this — never draft.stepTrackOverrides directly —
  // so nothing recomputes until the footer's "Confirm Reassignment" action commits it.
  // Resets to the committed value whenever the wizard supplies a different draft.
  const [pendingTrackOverrides, setPendingTrackOverrides] = useState(draft.stepTrackOverrides);
  useEffect(() => {
    setPendingTrackOverrides(draft.stepTrackOverrides);
  }, [draft.stepTrackOverrides]);
  const pendingTrackOverrideDiff = countOverrideDiff(pendingTrackOverrides, draft.stepTrackOverrides);
  function confirmTrackOverrides() {
    updateDraft({ stepTrackOverrides: pendingTrackOverrides });
  }

// We generate a temporary preview whenever the user arrives at the preview step.
  async function updatePreview() {
    if (!siteId || draft.selectedPileIds.length === 0) {
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      setPreviewWindowsByMachineId({});
      return;
    }

    setPreviewLoading(true);
    try {
      const selectedPiles = selectedPlanPiles;
      const previewPilesInput = selectedPiles.map((pile) => {
        const assignment = draft.assignments[pile.id];
        return {
          checklistPileId: pile.id,
          pileId: pile.id,
          pileIdCode: pile.code,
          dimensionId: pile.dimensionId,
          rigId: assignment?.rig ?? '',
          craneId: assignment?.crane ?? '',
          resumeWork: draft.resumeWorkByPileId[pile.id],
          stepTrackOverrides: draft.stepTrackOverrides[pile.id],
        };
      });

      const { planRows, warningPileIds, windowsByMachineId } = await generatePlanPreview({
        piles: previewPilesInput,
        planStartTime: draft.planStartTime,
        siteId,
        shiftTypeId: draft.shiftTypeId ?? undefined,
        selectedStepIds: draft.selectedStepIds,
        // steps is this screen's own already-loaded step-definition list (see
        // the initial data-loading effect above) — no need for the service to
        // fetch it again. templateRows/rawWindows come from the session cache
        // above once populated; omitted (undefined) until then, in which case
        // buildPlanRowsForPiles falls back to fetching them itself.
        referenceData: { allSteps: steps, ...planReferenceData },
      });

      setPreviewSteps(planRows as PlanStepWithMeta[]);
      setPreviewWarningPileIds(warningPileIds);
      setPreviewWindowsByMachineId(windowsByMachineId);
    } catch (err) {
      console.error('Error generating plan preview:', err);
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      setPreviewWindowsByMachineId({});
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (step === 'preview') {
      updatePreview();
    }
  }, [step, draft, piles, siteId]);

async function handleGenerate() {
    if (!siteId) return;

    const selectedPiles = selectedPlanPiles;
    const pilesInput: PileAssignmentInput[] = selectedPiles.map((p) => ({
      pileId: p.id,
      pileCode: p.code,
      dimensionId: p.dimensionId,
      rigId: draft.assignments[p.id].rig,
      craneId: draft.assignments[p.id].crane,
      resumeWork: draft.resumeWorkByPileId[p.id],
      stepTrackOverrides: draft.stepTrackOverrides[p.id],
    }));

    const endIso = planEndTime(draft.planStartTime);

    const input: GeneratePlanInput = {
      date: draft.date,
      planStartTime: draft.planStartTime,
      planEndTime: endIso,
      checklistPersonnel: draft.checklistPersonnel,
      shiftTypeId: draft.shiftTypeId,
      piles: pilesInput,
      stepIds: draft.selectedStepIds,
      isEdit: isEditMode,
    };

    try {
      await generatePlan(siteId, input);
      navigation.goBack();
    } catch {
      // error surfaced via planError from PlanContext
    }
  }

  const activeRigs = useMemo(
    () => rigs.filter((r) => draft.activeRigIds.includes(r.id)),
    [rigs, draft.activeRigIds],
  );

  const activeCranes = useMemo(
    () => cranes.filter((c) => draft.activeCraneIds.includes(c.id)),
    [cranes, draft.activeCraneIds],
  );

  // Build preview piles (already-assigned piles with machine labels)
  const builtPreviewPiles: PreviewPile[] = useMemo(() => {
    return draft.selectedPileIds.flatMap((id) => {
      const pile = selectedPlanPiles.find((p) => p.id === id);
      if (!pile) return [];
      const asgn = draft.assignments[id];
      if (!asgn) return [];
      const rigNo = rigs.find((r) => r.id === asgn.rig)?.machineNo ?? '—';
      const craneNo = cranes.find((c) => c.id === asgn.crane)?.machineNo ?? '—';
      return [{
        id: pile.id,
        checklistPileId: pile.id,
        code: pile.code,
        dia: pile.dia,
        depth: pile.depth,
        rigMachineNo: rigNo,
        craneMachineNo: craneNo,
        rigId: asgn.rig,
        craneId: asgn.crane,
      }];
    });
  }, [draft.selectedPileIds, draft.assignments, selectedPlanPiles, rigs, cranes]);

  function handleReorderPiles(newOrder: string[]) {
    updateDraft({ selectedPileIds: newOrder });
  }

  const [editingMachineId, setEditingMachineId] = useState<string | undefined>();
  const machineInfos: MachineInfo[] = [
    ...activeRigs.map((r) => ({ id: r.id, machineNo: r.machineNo, type: 'RIG' as const })),
    ...activeCranes.map((c) => ({ id: c.id, machineNo: c.machineNo, type: 'CRANE' as const })),
  ];
  const editingMachine = machineInfos.find((m) => m.id === editingMachineId);

  function pilesForMachine(machine: MachineInfo) {
    return builtPreviewPiles
      .filter((p) => (machine.type === 'RIG' ? p.rigId : p.craneId) === machine.id)
      .map((p) => ({ id: p.checklistPileId, label: `Pile ${p.code}` }));
  }

  function mergeOrder(fullOrder: string[], subsetNewOrder: string[]): string[] {
    const subsetIds = new Set(subsetNewOrder);
    let i = 0;
    return fullOrder.map((id) => (subsetIds.has(id) ? subsetNewOrder[i++] : id));
  }

  function handleReorderMachine(newSubsetOrder: string[]) {
    // Each arrow tap is its own discrete commit (unlike a single drag-end),
    // so this fires repeatedly while the overlay stays open — don't close it here.
    handleReorderPiles(mergeOrder(builtPreviewPiles.map((p) => p.checklistPileId), newSubsetOrder));
  }

  if (dataLoading || editSeeding) {
    return (
      <LinearGradient
        colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
        style={styles.flex}
      >
        <SafeAreaView style={[styles.flex, styles.center]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading site data…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ProgressHeader
          step={step}
          onClose={() => navigation.goBack()}
          onBack={goToPrevStep}
          backDisabled={STEP_ORDER.indexOf(step) === 0}
          onNext={goNext}
          nextDisabled={!canContinue || isGenerating}
        />

        {/* Piles step owns its own FlatList — must NOT be inside a ScrollView */}
        {step === 'piles' ? (
          <View style={styles.pilesStepContainer}>
            <PileAssignStep
              draft={draft}
              onUpdate={updateDraft}
              piles={assignablePiles}
              areas={selectedAreas.map((a) => ({ id: a.id, name: a.name }))}
              activeRigs={activeRigs}
              activeCranes={activeCranes}
            />
            {planError ? <Text style={styles.errorText}>{planError}</Text> : null}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 'area' && (
              <AreaSelectStep
                draft={draft}
                onUpdate={updateDraft}
                areas={areas.map((a) => ({ id: a.id, name: a.name, code: a.code }))}
              />
            )}

            {step === 'start' && (
              <StartTimeStep draft={draft} onUpdate={updateDraft} personnel={simplePersonnel} />
            )}

            {step === 'machines' && (
              <MachineSelectStep
                draft={draft}
                onUpdate={updateDraft}
                rigs={rigs}
                cranes={cranes}
                personnel={simplePersonnel}
              />
            )}

            {step === 'team' && (
              <TeamAssignStep
                draft={draft}
                onUpdate={updateDraft}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                personnel={simplePersonnel}
              />
            )}

            {step === 'steps' && (
              <StepSelectStep
                draft={draft}
                onUpdate={updateDraft}
                steps={steps}
              />
            )}

            {step === 'shiftIncharge' && (
              <ShiftInchargeStep
                draft={draft}
                onUpdate={updateDraft}
                personnel={simplePersonnel}
                shifts={shifts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  startTime: s.startTime,
                  endTime: s.endTime,
                }))}
              />
            )}

            {step === 'preview' && (
              <PreviewStep
                draft={draft}
                onUpdate={updateDraft}
                pendingTrackOverrides={pendingTrackOverrides}
                onPendingTrackOverridesChange={setPendingTrackOverrides}
                planSteps={previewSteps}
                isLoading={previewLoading}
                windowsByMachineId={previewWindowsByMachineId}
                piles={builtPreviewPiles}
                onEditMachine={setEditingMachineId}
                onNavigateToStep={(s) => setStep(s)}
                activeRigs={rigs.filter((r) => draft.activeRigIds.includes(r.id)).map((r) => ({
                  id: r.id,
                  machineNo: r.machineNo,
                  type: 'RIG' as const,
                }))}
                activeCranes={cranes.filter((c) => draft.activeCraneIds.includes(c.id)).map((c) => ({
                  id: c.id,
                  machineNo: c.machineNo,
                  type: 'CRANE' as const,
                }))}
                personnel={simplePersonnel}
                shifts={shifts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  startTime: s.startTime,
                  endTime: s.endTime,
                }))}
                warningPileCodes={piles
                  .filter((p) => previewWarningPileIds.includes(p.id))
                  .map((p) => p.code)}
              />
            )}

            {planError ? (
              <Text style={styles.errorText}>{planError}</Text>
            ) : null}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {step === 'preview' && pendingTrackOverrideDiff > 0 ? (
            // Takes over the footer's fixed bottom slot in place of the normal
            // Save Changes/Generate Plan button while any tile pick hasn't been
            // confirmed yet — the schedule hasn't recomputed, so committing the
            // plan now would silently ignore the pending picks.
            <View style={styles.confirmReassignBar}>
              <Text style={styles.confirmReassignText}>
                {pendingTrackOverrideDiff} step{pendingTrackOverrideDiff === 1 ? '' : 's'} reassigned
              </Text>
              <Pressable
                style={[styles.confirmReassignBtn, previewLoading && styles.continueBtnDisabled]}
                onPress={confirmTrackOverrides}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.confirmReassignBtnText}>Confirm Reassignment</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={!canContinue || isGenerating}
              onPress={goNext}
              style={[
                styles.continueBtn,
                (!canContinue || isGenerating) && styles.continueBtnDisabled,
              ]}
            >
              {isGenerating && step === 'preview' ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.continueText}>
                  {step === 'preview' && isEditMode
                    ? 'Save Changes'
                    : step === 'preview'
                    ? 'Generate Plan'
                    : 'Continue'}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Confirmation modal for edit mode */}
        <AppModal
          visible={confirmModalVisible}
          onClose={() => setConfirmModalVisible(false)}
          title="Save Changes?"
          subtitle={`You are about to update the existing plan for ${draft.date === today ? 'today' : draft.date}.`}
        >
          <View style={styles.confirmBody}>
            <View style={styles.confirmIconWrap}>
              <AlertTriangle size={28} color={colors.warning} />
            </View>
            <Text style={styles.confirmTitle}>
              Update {draft.date === today ? "today's" : `${draft.date}'s`} plan?
            </Text>
            <Text style={styles.confirmMessage}>
              This will replace the current plan with your updated selections,
              including piles, machine assignments, supervisors, and step timings.
              Any existing actual progress data will be preserved.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveBtn}
                onPress={() => {
                  setConfirmModalVisible(false);
                  handleGenerate();
                }}
              >
                <Text style={styles.saveText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </AppModal>

        {editingMachine ? (
          <ReorderPilesOverlay
            visible
            onClose={() => setEditingMachineId(undefined)}
            machine={editingMachine}
            piles={pilesForMachine(editingMachine)}
            onReorder={handleReorderMachine}
            isUpdating={previewLoading}
          />
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  areaStep: { gap: spacing.sm, paddingHorizontal: spacing.md },
  areaTitle: { ...typography.pageTitle, color: colors.textPrimary },
  areaDescription: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  areaCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  areaCardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  areaCardTitle: { ...typography.cardTitle, color: colors.textPrimary },
  areaCardTitleSelected: { color: colors.accent },
  areaCardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pilePick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  pilePickSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pilePickCode: { ...typography.cardTitle, color: colors.textPrimary },
  pilePickMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pilePickAction: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    zIndex: 10,
    elevation: 10,
  },
  continueBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadow.soft,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueText: { ...typography.body, fontWeight: '700', color: colors.white },
  confirmReassignBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  confirmReassignText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  confirmReassignBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  confirmReassignBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Confirmation modal styles
  confirmBody: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,149,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  confirmTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.12)',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
  pilesStepContainer: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});