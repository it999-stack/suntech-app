// src/screens/Home/GeneratePlanScreen.tsx
// Multi-step wizard for generating (or editing) a daily pile plan.
// Owns transient PlanDraft state (via usePlanDraft); commits to SQLite only
// on the final "Generate" press.
//

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import NextStepFab from '@components/plan/generate/NextStepFab';
import ReorderPilesOverlay from '@components/plan/generate/preview/ReorderPilesOverlay';
import Button from '@components/shared/Button';

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
import { flushResumeCloseOuts } from '@/services/resumeWorkService';
import {
  buildTemplateKeySet,
  describeMissingTemplateCoverage,
  findMissingTemplateCoverage,
} from '@/services/pileApplicableSteps';
import { planEndTime } from '@/types/plan';
import { toLocalDateStr } from '@/utils/formatTime';
import { notify } from '@utils/notify';
import { isShiftTeamComplete, findOrphanedTeamMachines, type OrphanedTeamMachine } from '@/utils/personnelRoles';
import { useTrackedScrollView } from '@hooks/useTrackedScrollView';

import { useGeneratePlanData } from './generatePlan/useGeneratePlanData';
import { usePlanDraft } from './generatePlan/usePlanDraft';
import { usePlanPreview } from './generatePlan/usePlanPreview';
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
    () => personnel.map((p) => ({ id: p.id, name: p.name, designation: p.designation, isActive: p.isActive })),
    [personnel],
  );

  const [step, setStep] = useState<Step>('start');
  // Whether PileAssignStep currently has piles checkbox-selected — while true,
  // it shows BulkAssignBar instead of the shared NextStepFab below.
  const [pilesHasSelection, setPilesHasSelection] = useState(false);

  const {
    draft, actions, editSeeding,
    selectedLocations, selectedPlanPiles, assignablePiles, pilesWithCompletion,
    activeRigs, activeCranes,
  } = usePlanDraft({
    siteId, targetDate, isEditMode, step, setStep,
    checklist, checklistPiles, checklistLoading,
    resources: { piles, locations, steps, rigs, cranes, personnel, shifts, roleDefaults, dataLoading },
  });

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

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const teamStepRef = useRef<TeamAssignStepHandle>(null);
  const resumeStepRef = useRef<ResumeConfirmStepHandle>(null);
  const { scrollViewRef, scrollYRef, onScroll, scrollEventThrottle } = useTrackedScrollView();

  async function goNext() {
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

    // Last step before Preview — precompute the plan while still here (FAB
    // shows its own spinner the whole time) so Preview opens already
    // computed, instead of navigating first and showing a loading screen
    // there. See usePlanPreview's precomputePreview doc comment.
    if (step === 'steps') {
      // Stay HERE when an in-scope step has no duration for one of the plan's
      // pile sizes: this screen is where it can actually be fixed (deselect
      // the step), and the plan the server would build is one it now rejects
      // outright with a 400.
      if (missingTemplates.length > 0) {
        notify.error(describeMissingTemplateCoverage(missingTemplates), {
          title: 'Missing step durations',
        });
        return;
      }
      await precomputePreview();
      setStep('preview');
      return;
    }

    const idx = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  }

  // Memoized (unlike goNext above) so the hardware-back listener below can
  // depend on it without tearing down and re-registering on every render.
  const goToPrevStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx === 0) return;

    setStep(STEP_ORDER[idx - 1]);
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goToPrevStep();
        return true;
      });
      return () => subscription.remove();
    }, [goToPrevStep]),
  );

  const {
    result: preview,
    setPendingTrackOverrides,
    setEditingMachineId,
    handleReorderMachine,
    precomputePreview,
  } = usePlanPreview({ step, draft, actions, piles, siteId, selectedPlanPiles, steps, activeRigs, activeCranes });

  const effectiveDayStart = useMemo(
    () => resolveEffectiveDayStart(draft.planStartTime, preview.referenceData?.rawWindows ?? []),
    [draft.planStartTime, preview.referenceData],
  );

  // Every in-scope step with no duration template for one of this plan's pile
  // sizes — the client-side mirror of the server's 400 on plan generation.
  // Nothing defaults to 60 minutes any more (see planScheduler.ts), so this is
  // a hard blocker: it holds the wizard on the Steps screen (goNext, where
  // deselecting the step is the fix) and keeps Generate disabled.
  const templateRows = preview.referenceData?.templateRows;
  const selectedStepIds = draft.selectedStepIds;
  const missingTemplates = useMemo(() => {
    // Reference data hasn't loaded yet — report nothing rather than flagging
    // every step as uncovered.
    if (!templateRows) return [];
    const selectedSet = new Set(selectedStepIds);
    return findMissingTemplateCoverage({
      piles: selectedPlanPiles,
      steps: steps.filter((s) => selectedSet.has(s.id)),
      templates: buildTemplateKeySet(templateRows),
    });
  }, [templateRows, selectedPlanPiles, steps, selectedStepIds]);

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
        // No uncommitted tile picks (debounce above hasn't auto-committed yet),
        // no step left unschedulable for want of a duration template — those
        // need a Head Office fix (or deselecting on the Steps screen) first —
        // no pile the scheduler had to skip for any other reason, and no
        // Team-assigned machine left with zero piles (would be rejected by the
        // server's exact-coverage check; see findOrphanedTeamMachines).
        return (
          preview.pendingTrackOverrides === draft.stepTrackOverrides &&
          missingTemplates.length === 0 &&
          preview.warningPileIds.length === 0 &&
          orphanedTeamMachines.length === 0
        );
      default:
        return true;
    }
  }, [step, draft, preview.pendingTrackOverrides, missingTemplates, preview.warningPileIds, orphanedTeamMachines]);

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
    } catch {
      // error surfaced via planError from PlanContext; modal stays open (loading
      // resets via isGenerating) so the user can see the failure and retry/cancel.
      // Crucially the staged close-outs stay staged — nothing has been written
      // to the previous day, so a retry (or a walk-away) leaves it intact.
      return;
    }

    // The plan is committed server-side, so the previous-day close-outs the
    // supervisor confirmed alongside it can finally be written. Deliberately
    // after generation, not before: this is the whole point of staging them —
    // an abandoned wizard must not leave a step marked finished with the
    // remaining-time estimate that accompanied it thrown away.
    let closeOutsFailed = false;
    try {
      await flushResumeCloseOuts(Object.values(draft.pendingCloseOuts));
    } catch (err) {
      console.error('flushResumeCloseOuts failed:', err);
      closeOutsFailed = true;
    }

    if (closeOutsFailed) {
      // The plan itself is fine — say so, but don't claim a clean run. The
      // steps stay in progress, so the next generation will ask again.
      notify.error("Plan saved, but the previous day's finish times could not be recorded.");
    } else {
      notify.success(isEditMode ? 'Plan updated successfully' : 'Plan generated successfully');
    }
    setConfirmModalVisible(false);
    navigation.goBack();
  }

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
  // What DurationWarningCard lists on the Preview step: one row per pile×step
  // that cannot be scheduled for want of a duration template, plus a bare
  // pile row for any pile the scheduler rejected for some other reason (no
  // dimension set, no machine for a step's track) so it still has a visible
  // explanation rather than only disabling Generate.
  const unschedulableSteps = useMemo(() => {
    const rows = missingTemplates.flatMap((m) =>
      m.pileCodes.map((pileCode) => ({ pileCode, stepName: m.stepName })),
    );
    const explained = new Set(rows.map((r) => r.pileCode));
    const otherPileCodes = piles
      .filter((p) => preview.warningPileIds.includes(p.id) && !explained.has(p.code))
      .map((p) => ({ pileCode: p.code }));
    return [...rows, ...otherPileCodes];
  }, [missingTemplates, piles, preview.warningPileIds]);

  if (dataLoading || editSeeding) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading site data…</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {/* Bottom only — the top inset and the backdrop are applied once in
          App.tsx's AppShell. This screen still needs the bottom edge for its
          footer FAB to clear the home indicator. */}
      <SafeAreaView style={styles.flex} edges={['bottom']}>
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
                actions={actions}
                piles={pilesWithCompletion}
                locations={selectedLocations.map((l) => ({ id: l.id, name: l.name }))}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                onSelectionChange={setPilesHasSelection}
              />
            ) : (
              <ResumeConfirmStep
                ref={resumeStepRef}
                draft={draft}
                actions={actions}
                piles={assignablePiles}
                activeRigs={activeRigs}
                activeCranes={activeCranes}
                effectiveDayStart={effectiveDayStart}
                allSteps={steps}
              />
            )}
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.flex}
            onScroll={onScroll}
            scrollEventThrottle={scrollEventThrottle}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 'location' && (
              <LocationSelectStep
                draft={draft}
                actions={actions}
                locations={locations.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
              />
            )}

            {step === 'start' && (
              <StartTimeStep draft={draft} actions={actions} personnel={simplePersonnel} />
            )}

            {step === 'machines' && (
              <MachineSelectStep
                draft={draft}
                actions={actions}
                rigs={rigs}
                cranes={cranes}
              />
            )}

            {(step === 'team' || step === 'teamNight') && (
              <TeamAssignStep
                ref={teamStepRef}
                draft={draft}
                actions={actions}
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
                actions={actions}
                steps={steps}
                planPiles={selectedPlanPiles}
                templateRows={preview.referenceData?.templateRows ?? []}
              />
            )}

            {step === 'preview' && (
              <PreviewStep
                draft={draft}
                actions={actions}
                pendingTrackOverrides={preview.pendingTrackOverrides}
                onPendingTrackOverridesChange={setPendingTrackOverrides}
                planSteps={preview.steps}
                isLoading={preview.isRecomputing || (isGenerating && !isEditMode)}
                allSteps={steps}
                windowsByMachineId={preview.windowsByMachineId}
                piles={preview.previewPiles}
                onEditMachine={setEditingMachineId}
                onNavigateToStep={(s) => setStep(s)}
                activeRigs={previewActiveRigs}
                activeCranes={previewActiveCranes}
                personnel={simplePersonnel}
                shifts={previewShifts}
                unschedulableSteps={unschedulableSteps}
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
            submit action (Generate Plan / Save Changes), not just "next".
            Rendered here as the single shared instance for every step
            (including Piles, unless it's showing BulkAssignBar instead) so
            its screen position never drifts between steps. */}
        {step !== 'preview' && !(step === 'piles' && pilesHasSelection) && (
          <NextStepFab
            onPress={goNext}
            disabled={(step === 'team' || step === 'teamNight' || step === 'resume') ? isGenerating : (!canContinue || isGenerating || (step === 'steps' && preview.isLoading))}
            loading={step === 'steps' && preview.isLoading}
          />
        )}

        {step === 'preview' && (
          <View style={styles.footer}>
            <Button
              label={isEditMode ? 'Save Changes' : 'Generate Plan'}
              onPress={goNext}
              disabled={!canContinue || isGenerating || preview.isRecomputing}
            />
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

        {preview.machineOverlay.editingMachine ? (
          <ReorderPilesOverlay
            visible={preview.machineOverlay.isOpen}
            onClose={() => setEditingMachineId(undefined)}
            machine={preview.machineOverlay.editingMachine}
            piles={preview.machineOverlay.pilesForMachine(preview.machineOverlay.editingMachine)}
            onReorder={handleReorderMachine}
            isUpdating={preview.isLoading}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  scrollContent: {
    flexGrow: 1,
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
