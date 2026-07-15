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

import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import { usePlan, type PileAssignmentInput, type GeneratePlanInput } from '@state/PlanContext';
import { useAuthStore } from '@/store/authStore';

import ProgressHeader, { type Step, STEP_ORDER } from '@components/plan/generate/ProgressHeader';
import IntroStep from '@components/plan/generate/steps/IntroStep';
import StartTimeStep from '@components/plan/generate/steps/StartTimeStep';
import AreaSelectStep from '@components/plan/generate/steps/AreaSelectStep';
import MachineSelectStep from '@components/plan/generate/steps/MachineSelectStep';
import PileAssignStep from '@components/plan/generate/steps/PileAssignStep';
import SupervisorStep from '@components/plan/generate/steps/SupervisorStep';
import StepSelectStep from '@components/plan/generate/steps/StepSelectStep';
import PreviewStep, { type PreviewPile } from '@components/plan/generate/steps/PreviewStep';

import { getPilesBySiteWithDimensions, PileWithDimension } from '@repositories/pilesRepository';
import { getAreasBySite } from '@repositories/areasRepository';
import { getPendingWorkForPileIds, savePendingWork } from '@repositories/workProgressRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getSteps } from '@repositories/stepsRepository';
import { generatePlanPreview } from '@/services/pilingPlannerService';
import { buildResumePreselection, getLockedStepIds, mergeLockedSteps } from '@/services/planPreselectService';
import type { PilingArea, PilingPersonnel, PilingShiftType, PilingStep, PileWorkProgress } from '@/db/schema';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { defaultPlanDraft, planEndTime, type PlanDraft } from '@/types/plan';

type EligiblePile = PileWithDimension & {
  /** Alias for pileIdCode for convenience */
  code: string;
};

type SimpleMachine = { id: string; machineNo: string; description?: string | null };

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function GeneratePlanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isEditMode: boolean = route.params?.edit === true;

  const user = useAuthStore((s) => s.user);
  const { checklist, checklistPiles, generatePlan, isGenerating, error: planError } = usePlan();

  const siteId = user?.siteId ?? ''; // siteId is string | undefined; fallback to ''
  const today = toLocalDateStr(new Date());

  const [piles, setPiles] = useState<EligiblePile[]>([]);
  const [areas, setAreas] = useState<PilingArea[]>([]);
  const [steps, setSteps] = useState<PilingStep[]>([]);
  const [rigs, setRigs] = useState<SimpleMachine[]>([]);
  const [cranes, setCranes] = useState<SimpleMachine[]>([]);
  const [personnel, setPersonnel] = useState<PilingPersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        const [pilesRaw, stepsRaw, rigsRaw, cranesRaw, personnelRaw, shiftsRaw, areasRaw] = await Promise.all([
          getPilesBySiteWithDimensions(siteId),
          getSteps(),
          getMachinesByType(siteId, 'RIG'),
          getMachinesByType(siteId, 'CRANE'),
          getPersonnelBySite(siteId),
          getAllShiftTypes(),
          getAreasBySite(siteId),
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
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const [draft, setDraft] = useState<PlanDraft>(() => defaultPlanDraft(today));

  const areaPiles = useMemo(() => {
    if (!draft.areaIds.length) return [];
    return piles.filter((p) => p.areaId && draft.areaIds.includes(p.areaId));
  }, [piles, draft.areaIds]);

  const selectedPlanPiles = useMemo(
    () => piles.filter((p) => draft.selectedPileIds.includes(p.id)),
    [piles, draft.selectedPileIds],
  );

  const [pendingWorkItems, setPendingWorkItems] = useState<PileWorkProgress[]>([]);

  useEffect(() => {
    if (!areaPiles.length) {
      setPendingWorkItems([]);
      return;
    }
    let cancelled = false;
    getPendingWorkForPileIds(areaPiles.map((pile) => pile.id)).then((pending) => {
      if (!cancelled) setPendingWorkItems(pending);
    });
    return () => { cancelled = true; };
  }, [areaPiles]);

  function updateDraft(patch: Partial<PlanDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  // Seed draft in edit mode once data loads
  const seeded = useRef(false);
  useEffect(() => {
    if (!isEditMode || dataLoading || !checklist || !checklistPiles.length || seeded.current) return;
    seeded.current = true;

    const ids = checklistPiles.map((cp) => cp.pileId);
    const assignments: PlanDraft['assignments'] = {};
    checklistPiles.forEach((cp) => {
      assignments[cp.pileId] = { rig: cp.rigId, crane: cp.craneId };
    });

    setDraft({
      date: checklist.date,
      planStartTime: checklist.planStartTime ?? defaultPlanDraft(checklist.date).planStartTime,
      activeRigIds: [...new Set(checklistPiles.map((cp) => cp.rigId))],
      activeCraneIds: [...new Set(checklistPiles.map((cp) => cp.craneId))],
      selectedPileIds: ids,
      areaIds: [],
      selectedStepIds: steps.map((s) => s.id),
      assignments,
      resumeWorkByPileId: {},
      supervisorId: checklist.supervisorId ?? null,
      supervisorId2: checklist.supervisorId2 ?? null,
      shiftTypeId: checklist.shiftTypeId ?? null,
    });

    // Skip directly to the preview step when editing an existing plan
    setStep('preview');
  }, [isEditMode, dataLoading, checklist, checklistPiles]);

  // Default machine selection: all selected on mount (after data loads)
  const machinesDefaulted = useRef(false);
  useEffect(() => {
    if (!dataLoading && steps.length && draft.selectedStepIds.length === 0) {
      setDraft((prev) => ({
        ...prev,
        selectedStepIds: steps.map((s) => s.id),
      }));
    }
  }, [dataLoading, steps, draft.selectedStepIds.length]);

  useEffect(() => {
    if (dataLoading || machinesDefaulted.current || isEditMode) return;
    if (rigs.length === 0 && cranes.length === 0) return;
    machinesDefaulted.current = true;
    setDraft((prev) => ({
      ...prev,
      activeRigIds: rigs.map((r) => r.id),
      activeCraneIds: cranes.map((c) => c.id),
    }));
  }, [dataLoading, rigs, cranes, isEditMode]);

  const [step, setStep] = useState<Step>('intro');
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

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx === 0) { navigation.goBack(); return; }

    setStep(STEP_ORDER[idx - 1]);
  }

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const canContinue = useMemo(() => {
    switch (step) {
      case 'area':
        return draft.areaIds.length > 0;
      case 'machines':
        return draft.activeRigIds.length > 0 && draft.activeCraneIds.length > 0;
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

// We generate a temporary preview whenever the user arrives at the preview step.
  async function updatePreview() {
    if (!siteId || draft.selectedPileIds.length === 0) {
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      return;
    }

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
        };
      });

      const { planRows, warningPileIds } = await generatePlanPreview({
        piles: previewPilesInput,
        planStartTime: draft.planStartTime,
        siteId,
        shiftTypeId: draft.shiftTypeId ?? undefined,
        selectedStepIds: draft.selectedStepIds,
      });

      setPreviewSteps(planRows as PlanStepWithMeta[]);
      setPreviewWarningPileIds(warningPileIds);
    } catch (err) {
      console.error('Error generating plan preview:', err);
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
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
    }));

    const endIso = planEndTime(draft.planStartTime);

    const input: GeneratePlanInput = {
      date: draft.date,
      planStartTime: draft.planStartTime,
      planEndTime: endIso,
      supervisorId: draft.supervisorId,
      supervisorId2: draft.supervisorId2,
      shiftTypeId: draft.shiftTypeId,
      piles: pilesInput,
      stepIds: draft.selectedStepIds,
    };

    try {
      await Promise.all(Object.entries(draft.resumeWorkByPileId).map(([pileId, resume]) =>
        savePendingWork({ id: `progress_${pileId}`, pileId, stepId: resume.stepId, remainingMinutes: resume.remainingMinutes, lastRigId: draft.assignments[pileId]?.rig ?? resume.lastRigId ?? null, lastCraneId: draft.assignments[pileId]?.crane ?? resume.lastCraneId ?? null }),
      ));
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

  const supervisor1Name = useMemo(
    () => personnel.find((p) => p.id === draft.supervisorId)?.name ?? null,
    [personnel, draft.supervisorId],
  );
  const supervisor2Name = useMemo(
    () => personnel.find((p) => p.id === draft.supervisorId2)?.name ?? null,
    [personnel, draft.supervisorId2],
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
      }];
    });
  }, [draft.selectedPileIds, draft.assignments, selectedPlanPiles, rigs, cranes]);

  if (dataLoading) {
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
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ProgressHeader
          step={step}
          onBack={goBack}
          onNext={goNext}
          nextDisabled={!canContinue || isGenerating}
        />

        {/* Piles step owns its own FlatList — must NOT be inside a ScrollView */}
        {step === 'piles' ? (
          <View style={styles.pilesStepContainer}>
            <PileAssignStep
              draft={draft}
              onUpdate={updateDraft}
              piles={areaPiles}
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
            {step === 'intro' && (
              <IntroStep />
            )}

            {step === 'area' && (
              <AreaSelectStep
                draft={draft}
                onUpdate={updateDraft}
                areas={areas.map((a) => ({ id: a.id, name: a.name, code: a.code }))}
              />
            )}

            {step === 'start' && (
              <StartTimeStep draft={draft} onUpdate={updateDraft} />
            )}

            {step === 'machines' && (
              <MachineSelectStep
                draft={draft}
                onUpdate={updateDraft}
                rigs={rigs}
                cranes={cranes}
              />
            )}

            {step === 'steps' && (
              <StepSelectStep
                draft={draft}
                onUpdate={updateDraft}
                steps={steps}
              />
            )}

            {step === 'supervisors' && (
              <SupervisorStep
                draft={draft}
                onUpdate={updateDraft}
                personnel={personnel.map((p) => ({
                  id: p.id,
                  name: p.name,
                  designation: p.designation,
                }))}
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
                planSteps={previewSteps}
                piles={builtPreviewPiles}
                supervisor1Name={supervisor1Name}
                supervisor2Name={supervisor2Name}
                activeRigCount={draft.activeRigIds.length}
                activeCraneCount={draft.activeCraneIds.length}
                totalStepsCount={steps.length}
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
                personnel={personnel.map((p) => ({
                  id: p.id,
                  name: p.name,
                  designation: p.designation,
                }))}
                shifts={shifts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  startTime: s.startTime,
                  endTime: s.endTime,
                }))}
                selectedSteps={steps
                  .filter((s) => draft.selectedStepIds.includes(s.id))
                  .map((s) => ({
                    id: s.id,
                    stepName: s.stepName,
                    track: s.track,
                    sequenceOrder: s.sequenceOrder,
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
                {step === 'intro'
                  ? 'Get Started'
                  : step === 'preview' && isEditMode
                  ? 'Save Changes'
                  : step === 'preview'
                  ? 'Generate Plan'
                  : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Confirmation modal for edit mode */}
        <AppModal
          visible={confirmModalVisible}
          onClose={() => setConfirmModalVisible(false)}
          title="Save Changes?"
          subtitle="You are about to update the existing plan for today."
        >
          <View style={styles.confirmBody}>
            <View style={styles.confirmIconWrap}>
              <AlertTriangle size={28} color={colors.warning} />
            </View>
            <Text style={styles.confirmTitle}>Update today's plan?</Text>
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
    paddingBottom: spacing.md,
  },
});