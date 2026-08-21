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
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import NextStepFab from '@components/plan/generate/NextStepFab';
import ReorderPilesOverlay from '@components/plan/generate/preview/ReorderPilesOverlay';

import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import { usePlan, type PileAssignmentInput, type GeneratePlanInput } from '@state/PlanContext';
import { useAuthStore } from '@/store/authStore';
import { useWorkingDate } from '@/store/workingDateStore';

import ProgressHeader, { type Step, STEP_ORDER } from '@components/plan/generate/ProgressHeader';
import StartTimeStep from '@components/plan/generate/steps/StartTimeStep';
import LocationSelectStep from '@components/plan/generate/steps/LocationSelectStep';
import MachineSelectStep from '@components/plan/generate/steps/MachineSelectStep';
import PileAssignStep from '@components/plan/generate/steps/PileAssignStep';
import ResumeConfirmStep, { type ResumeConfirmStepHandle } from '@components/plan/generate/steps/ResumeConfirmStep';
import TeamAssignStep, { type TeamAssignStepHandle } from '@components/plan/generate/steps/TeamAssignStep';
import StepSelectStep from '@components/plan/generate/steps/StepSelectStep';
import PreviewStep from '@components/plan/generate/steps/PreviewStep';

import { pileNeedsResumeConfirm } from '@components/plan/generate/steps/resume-confirm/useResumeConfirmQueue';
import { resolveEffectiveDayStart } from '@/services/pilingPlannerService';
import { findResumeWorkForPiles, type ResumeWorkInfo } from '@/services/resumeWorkService';
import { defaultPlanDraft, planEndTime, type PlanDraft } from '@/types/plan';
import { getPrimaryShiftType, combineDateAndTime } from '@/utils/shiftHelpers';
import { toLocalDateStr } from '@/utils/formatTime';
import { notify } from '@utils/notify';
import { isShiftTeamComplete, findOrphanedTeamMachines, type OrphanedTeamMachine } from '@/utils/personnelRoles';
import { useTrackedScrollView } from '@hooks/useTrackedScrollView';

import { useGeneratePlanData } from './generatePlan/useGeneratePlanData';
import { useEditModeSeed } from './generatePlan/useEditModeSeed';
import { useRoleDefaultsSeed } from './generatePlan/useRoleDefaultsSeed';
import { usePilePreselection } from './generatePlan/usePilePreselection';
import { usePlanPreview } from './generatePlan/usePlanPreview';
import { usePreviewReorder } from './generatePlan/usePreviewReorder';
import EditConfirmModal from './generatePlan/EditConfirmModal';

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

  const siteId = user?.siteId ?? '';
  const today = toLocalDateStr(new Date());
  const workingDate = useWorkingDate();
  const targetDate: string = route.params?.date ?? workingDate;

  // Load the checklist for the target date into PlanContext — HomeScreen only
  // ever loads today's checklist on mount, so a future-day edit needs its own load.
  useEffect(() => {
    if (siteId) loadChecklist(siteId, targetDate);
  }, [siteId, targetDate, loadChecklist]);

  // planError used to render inline as red screen text; now surfaced as a
  // toast instead, same as every other failure path in this screen.
  useEffect(() => {
    if (planError) notify.error(planError);
  }, [planError]);

  const { piles, locations, steps, rigs, cranes, personnel, shifts, roleDefaults, dataLoading } =
    useGeneratePlanData(siteId);

  const simplePersonnel = useMemo(
    () => personnel.map((p) => ({ id: p.id, name: p.name, designation: p.designation })),
    [personnel],
  );

  const [draft, setDraft] = useState<PlanDraft>(() => defaultPlanDraft(targetDate));
  function updateDraft(patch: Partial<PlanDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  const [step, setStep] = useState<Step>('start');

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

  // The rig/crane ids that will actually appear on the submitted piles[] —
  // same source handleGenerate uses to build pilesInput, so this can never
  // drift from what's actually sent. Used to catch Team-step assignments
  // for a machine that ended up with zero piles before it becomes a 400
  // from the server (see findOrphanedTeamMachines).
  const pileAssignedRigIds = useMemo(
    () => new Set(draft.selectedPileIds.map((id) => draft.assignments[id]?.rig).filter(Boolean) as string[]),
    [draft.selectedPileIds, draft.assignments],
  );
  const pileAssignedCraneIds = useMemo(
    () => new Set(draft.selectedPileIds.map((id) => draft.assignments[id]?.crane).filter(Boolean) as string[]),
    [draft.selectedPileIds, draft.assignments],
  );
  const orphanedTeamMachines = useMemo(
    () => findOrphanedTeamMachines(draft.checklistPersonnel, pileAssignedRigIds, pileAssignedCraneIds),
    [draft.checklistPersonnel, pileAssignedRigIds, pileAssignedCraneIds],
  );
  const orphanedTeamMachinesMessage = useMemo(() => {
    if (orphanedTeamMachines.length === 0) return null;
    const machineNoFor = (id: string) =>
      rigs.find((r) => r.id === id)?.machineNo ?? cranes.find((c) => c.id === id)?.machineNo ?? id;
    const roleLabel: Record<OrphanedTeamMachine['role'], string> = {
      ENGINEER: 'Engineer',
      SUPERVISOR: 'Supervisor',
      MACHINE_OPERATOR: 'Operator',
    };
    const byMachine = new Map<string, string[]>();
    for (const o of orphanedTeamMachines) {
      const label = `${roleLabel[o.role]}, shift ${o.shiftSlot}`;
      const existing = byMachine.get(o.machineId) ?? [];
      existing.push(label);
      byMachine.set(o.machineId, existing);
    }
    const lines = [...byMachine.entries()].map(
      ([machineId, labels]) => `${machineNoFor(machineId)} has an assigned team (${labels.join('; ')}) but no piles in this plan.`,
    );
    return `${lines.join(' ')} Go back to Piles and assign it a pile, or remove it in Machines.`;
  }, [orphanedTeamMachines, rigs, cranes]);

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

  const { editSeeding } = useEditModeSeed({
    isEditMode, dataLoading, checklistLoading, checklist, checklistPiles, piles, steps,
    setDraft, setStep,
  });

  // Default step selection: all selected on mount (after data loads)
  useEffect(() => {
    if (!dataLoading && steps.length && draft.selectedStepIds.length === 0) {
      setDraft((prev) => ({
        ...prev,
        selectedStepIds: steps.map((s) => s.id),
      }));
    }
  }, [dataLoading, steps, draft.selectedStepIds.length]);

  useRoleDefaultsSeed({ dataLoading, isEditMode, rigs, cranes, roleDefaults, setDraft });

  usePilePreselection({ step, draft, setDraft, pendingWorkItems, steps });

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const teamStepRef = useRef<TeamAssignStepHandle>(null);
  const resumeStepRef = useRef<ResumeConfirmStepHandle>(null);
  const { scrollViewRef, scrollYRef, onScroll, scrollEventThrottle } = useTrackedScrollView();

  function goNext() {
    if (step === 'team' || step === 'teamNight') {
      const teamComplete = teamStepRef.current ? teamStepRef.current.focusFirstMissing() : canContinue;
      if (!teamComplete) return;
    }

    if (step === 'resume') {
      const resumeComplete = resumeStepRef.current ? resumeStepRef.current.focusFirstMissing() : canContinue;
      if (!resumeComplete) return;
    }

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

  const {
    pendingTrackOverrides, setPendingTrackOverrides,
    previewSteps, previewWarningPileIds, previewWindowsByMachineId,
    previewRecomputing, previewLoading, planReferenceData,
  } = usePlanPreview({ step, draft, updateDraft, piles, siteId, selectedPlanPiles, steps });

  // Where a resume step effectively starts in the new plan (after skipping any opening
  // non-working window) — the anchor ResumeConfirmStep's "plan finish time" picker
  // measures duration against. Falls back to the raw plan start until reference data
  // (non-working windows) has loaded.
  const effectiveDayStart = useMemo(
    () => resolveEffectiveDayStart(draft.planStartTime, planReferenceData?.rawWindows ?? []),
    [draft.planStartTime, planReferenceData],
  );

  const canContinue = useMemo(() => {
    switch (step) {
      case 'start':
        return !!draft.checklistPersonnel.projectManagerId;
      case 'location':
        return draft.locationIds.length > 0;
      case 'machines': {
        return [...draft.activeRigIds, ...draft.activeCraneIds].length > 0;
      }
      case 'team': {
        if ([...draft.activeRigIds, ...draft.activeCraneIds].length === 0) return false;
        return isShiftTeamComplete(draft.checklistPersonnel.shift1, draft.activeRigIds, draft.activeCraneIds);
      }
      case 'teamNight': {
        if ([...draft.activeRigIds, ...draft.activeCraneIds].length === 0) return false;
        return isShiftTeamComplete(draft.checklistPersonnel.shift2, draft.activeRigIds, draft.activeCraneIds);
      }
      case 'piles':
        // Crane is optional — a rig can perform any CRANE-track step, never
        // the reverse — so only a rig assignment is required per pile.
        return (
          draft.selectedPileIds.length > 0 &&
          draft.selectedPileIds.every((id) => !!draft.assignments[id]?.rig)
        );
      case 'resume':
        return !draft.selectedPileIds.some((id) => pileNeedsResumeConfirm(draft.resumeWorkByPileId, id));
      case 'steps':
        return draft.selectedStepIds.length > 0;
      case 'preview':
        // No uncommitted tile picks (debounce above hasn't auto-committed yet), no
        // piles stuck on the default 60m duration — those need a Head Office fix
        // first — and no Team-assigned machine left with zero piles (would be
        // rejected by the server's exact-coverage check; see
        // findOrphanedTeamMachines).
        return (
          pendingTrackOverrides === draft.stepTrackOverrides &&
          previewWarningPileIds.length === 0 &&
          orphanedTeamMachines.length === 0
        );
      default:
        return true;
    }
  }, [step, draft, pendingTrackOverrides, previewWarningPileIds, orphanedTeamMachines]);

  async function handleGenerate() {
    if (!siteId) return;
    if (orphanedTeamMachines.length > 0) return;

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
      notify.success(isEditMode ? 'Plan updated successfully' : 'Plan generated successfully');
      setConfirmModalVisible(false);
      navigation.goBack();
    } catch {
      // error surfaced via planError from PlanContext; modal stays open (loading
      // resets via isGenerating) so the user can see the failure and retry/cancel.
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

  const {
    builtPreviewPiles, setEditingMachineId, editingMachine, isMachineOverlayOpen,
    pilesForMachine, handleReorderMachine,
  } = usePreviewReorder({ draft, updateDraft, selectedPlanPiles, activeRigs, activeCranes });

  // Shaped/derived views of otherwise-stable data, memoized so PreviewStep (and the
  // memoized PilePreviewPage rows beneath it) see the same prop reference across
  // re-renders that don't actually touch rigs/cranes/shifts/warnings — e.g. tapping a
  // Rig/Crane tile on one pile shouldn't invalidate every other pile's memoized row.
  const previewActiveRigs = useMemo(
    () => activeRigs.map((r) => ({ id: r.id, machineNo: r.machineNo, type: 'RIG' as const })),
    [activeRigs],
  );
  const previewActiveCranes = useMemo(
    () => activeCranes.map((c) => ({ id: c.id, machineNo: c.machineNo, type: 'CRANE' as const })),
    [activeCranes],
  );
  const previewShifts = useMemo(
    () => shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime })),
    [shifts],
  );
  const previewWarningPileCodes = useMemo(
    () => piles.filter((p) => previewWarningPileIds.includes(p.id)).map((p) => p.code),
    [piles, previewWarningPileIds],
  );

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
        />

        {/* key={step} remounts this wrapper on every step change so FadeIn replays each
            time — a lightweight, UI-thread-only crossfade (no exiting side, see discussion)
            that also gives the screen a real paint boundary between steps, same idea as
            MainTabNavigator's `animation: 'fade'` but implemented by hand since these steps
            are conditional JSX, not separate navigator routes. */}
        <Animated.View key={step} entering={FadeIn.duration(180)} style={styles.flex}>
        {/* Piles and Resume steps own their own FlatList — must NOT be inside a ScrollView */}
        {step === 'piles' || step === 'resume' ? (
          <View style={styles.pilesStepContainer}>
            {step === 'piles' ? (
              <PileAssignStep
                draft={draft}
                onUpdate={updateDraft}
                piles={pilesWithCompletion}
                locations={selectedLocations.map((l) => ({ id: l.id, name: l.name }))}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                onContinue={goNext}
                continueDisabled={!canContinue || isGenerating}
              />
            ) : (
              <ResumeConfirmStep
                ref={resumeStepRef}
                draft={draft}
                onUpdate={updateDraft}
                piles={assignablePiles}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                effectiveDayStart={effectiveDayStart}
              />
            )}
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            onScroll={onScroll}
            scrollEventThrottle={scrollEventThrottle}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 'location' && (
              <LocationSelectStep
                draft={draft}
                onUpdate={updateDraft}
                locations={locations.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
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
              />
            )}

            {(step === 'team' || step === 'teamNight') && (
              <TeamAssignStep
                ref={teamStepRef}
                draft={draft}
                onUpdate={updateDraft}
                shiftSlot={step === 'team' ? 1 : 2}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                personnel={simplePersonnel}
                shifts={shifts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  startTime: s.startTime,
                  endTime: s.endTime,
                }))}
                scrollViewRef={scrollViewRef}
                scrollYRef={scrollYRef}
              />
            )}

            {step === 'steps' && (
              <StepSelectStep
                draft={draft}
                onUpdate={updateDraft}
                steps={steps}
                planPiles={selectedPlanPiles}
                templateRows={planReferenceData?.templateRows ?? []}
              />
            )}

            {step === 'preview' && (
              <PreviewStep
                draft={draft}
                onUpdate={updateDraft}
                pendingTrackOverrides={pendingTrackOverrides}
                onPendingTrackOverridesChange={setPendingTrackOverrides}
                planSteps={previewSteps}
                isLoading={previewRecomputing}
                allSteps={steps}
                windowsByMachineId={previewWindowsByMachineId}
                piles={builtPreviewPiles}
                onEditMachine={setEditingMachineId}
                onNavigateToStep={(s) => setStep(s)}
                activeRigs={previewActiveRigs}
                activeCranes={previewActiveCranes}
                personnel={simplePersonnel}
                shifts={previewShifts}
                warningPileCodes={previewWarningPileCodes}
                siteId={siteId}
              />
            )}

            {step === 'preview' && orphanedTeamMachinesMessage ? (
              <Text style={styles.errorText}>{orphanedTeamMachinesMessage}</Text>
            ) : null}
          </ScrollView>
        )}
        </Animated.View>

        {/* Every step but Preview: a floating next-step chevron instead of a
            full-width "Continue" bar — Preview's own button below is a real
            submit action (Generate Plan / Save Changes), not just "next". */}
        {step !== 'piles' && step !== 'preview' && (
          <NextStepFab
            onPress={goNext}
            disabled={(step === 'team' || step === 'teamNight' || step === 'resume') ? isGenerating : (!canContinue || isGenerating)}
          />
        )}

        {step === 'preview' && (
          <View style={styles.footer}>
            <Pressable
              disabled={!canContinue || isGenerating || previewRecomputing}
              onPress={goNext}
              style={[
                styles.continueBtn,
                (!canContinue || isGenerating || previewRecomputing) && styles.continueBtnDisabled,
              ]}
            >
              {(isGenerating && !isEditMode) || previewRecomputing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.continueText}>{isEditMode ? 'Save Changes' : 'Generate Plan'}</Text>
              )}
            </Pressable>
          </View>
        )}

        <EditConfirmModal
          visible={confirmModalVisible}
          onClose={() => setConfirmModalVisible(false)}
          onConfirm={handleGenerate}
          date={draft.date}
          today={today}
          loading={isGenerating}
        />

        {editingMachine ? (
          <ReorderPilesOverlay
            visible={isMachineOverlayOpen}
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
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadow.soft,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueText: { ...typography.body, fontWeight: '700', color: colors.white },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  pilesStepContainer: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
});
