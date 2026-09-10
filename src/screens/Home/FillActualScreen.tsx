// src/screens/Home/FillActualScreen.tsx

import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '@app-types/navigation';
import { ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography } from '@theme/theme';
import { TRACK_META } from '@utils/helpers';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import PileStepsModal from '@components/plan/actual/PileStepsModal';
import MachineDownModal from '@components/plan/actual/MachineDownModal';
import MachineIdleModal from '@components/plan/actual/MachineIdleModal';
import SwipeableTabBar from '@components/shared/SwipeableTabBar';
import ReorderPilesModal from '@components/plan/generate/preview/ReorderPilesModal';
import ReplanPromptSheet from '@components/plan/actual/ReplanPromptSheet';
import AddPileModal from '@components/plan/actual/AddPileModal';
import EmptyState from '@components/shared/EmptyState';
import { useModalBackGuard } from '@components/shared/ModalHost';
import { useLookups } from './fillActual/useLookups';
import { useShiftInchargeLookup } from './fillActual/useShiftInchargeLookup';
import { useMachineEvents } from './fillActual/useMachineEvents';
import { useResumeSteps } from './fillActual/useResumeSteps';
import { useNonWorkingWindows } from './fillActual/useNonWorkingWindows';
import { usePileGroups } from './fillActual/usePileGroups';
import { useMachineFloor } from './fillActual/useMachineFloor';
import { useMachinePages, EMPTY_PILE_GROUPS } from './fillActual/useMachinePages';
import { usePileModal } from './fillActual/usePileModal';
import { useSequenceEditor } from './fillActual/useSequenceEditor';
import { useReplanPrompt } from './fillActual/useReplanPrompt';
import { useActualTimeActions } from './fillActual/useActualTimeActions';
import { useMachineEventActions } from './fillActual/useMachineEventActions';
import MachinePilesPage from './fillActual/MachinePilesPage';

type FillActualsRouteProp = RouteProp<HomeStackParamList, 'FillActuals'>;

export default function FillActualsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<FillActualsRouteProp>();
  const user = useAuthStore((s) => s.user);
  const siteId = user?.siteId ?? '';
  const deviceWorkingDate = useWorkingDate();
  const workingDate = route.params?.date ?? deviceWorkingDate;

  // ReorderPilesModal/AddPileModal live on this screen — without this, the
  // Android hardware back button can pop this screen out from under an open
  // modal instead of just closing it (native-stack's own back handling can
  // bypass ModalHost's BackHandler listener entirely; see useModalBackGuard).
  useModalBackGuard();

  const {
    checklist,
    planSteps,
    actualSteps,
    checklistPiles,
    pileMeasurementsByPileId,
    isLoading,
    conflictNotice,
    dismissConflictNotice,
    loadChecklist,
    setActualTime,
    clearActualTime,
    setRemarks,
    setPileMeasurement,
    logMachineEvent,
    editPlanMidDay,
    previewEditPlanMidDay,
    segmentsByStepKey,
    pauseStep,
    resumeStep,
    finishSegment,
    editSegmentTime,
    setSegmentNotes,
    deleteSegment,
  } = usePlan();

  // ── Load the working date's checklist on mount ─────────────────────────
  useEffect(() => {
    if (siteId) loadChecklist(siteId, workingDate);
  }, [siteId, workingDate, loadChecklist]);

  // ── Surface genuine sync conflicts instead of silently overwriting ──────
  useEffect(() => {
    if (!conflictNotice) return;
    // Alert.alert('Updated elsewhere', conflictNotice, [
    //   { text: 'OK', onPress: dismissConflictNotice },
    // ]);
  }, [conflictNotice, dismissConflictNotice]);

  const {
    machines,
    machineMap,
    pileMap,
    personnelMap,
    contractors,
    allSteps,
    durationTemplates,
    lookupsLoading,
    reloadMachines,
    machineStatusById,
  } = useLookups({ siteId });

  // Shift Incharge (Shift 1) — the closest equivalent to what "supervisor"
  // used to mean before the multi-role system replaced it.
  const { shiftIncharge1Id } = useShiftInchargeLookup({ checklist });

  const { machineEvents, reloadMachineEvents, openIdleByMachineId, idleSessionByMachineId } = useMachineEvents({
    checklist,
  });

  const { completedStepsByPileId } = useResumeSteps({ siteId, checklist, checklistPiles });

  const { windowsByMachineId } = useNonWorkingWindows({ checklist, planSteps });

  const { pileGroups } = usePileGroups({
    checklistPiles,
    planSteps,
    actualSteps,
    pileMap,
    machines,
    machineMap,
    machineStatusById,
    checklist,
    windowsByMachineId,
    completedStepsByPileId,
    measurementsByPileId: pileMeasurementsByPileId,
    allSteps,
    durationTemplates,
    segmentsByStepKey,
  });

  const { machineFloorIndex, frontPileIdByMachineId, currentStepByMachineId, inProgressStepByMachineId } =
    useMachineFloor({ pileGroups });

  const {
    activeMachines,
    machinePagesById,
    machineBadgeItems,
    selectedMachineId,
    setSelectedMachineId,
  } = useMachinePages({ checklistPiles, machines, machineMap, pileGroups, frontPileIdByMachineId });

  const { setOpenCpId, openGroup } = usePileModal({ pileGroups });

  const {
    rigs,
    cranes,
    activeMachine,
    draftRows,
    sequencePiles,
    sequenceModalOpen,
    sequenceRemountKey,
    addPileModalOpen,
    setAddPileModalOpen,
    isSavingSequence,
    openSequenceModal,
    closeSequenceModal,
    handleReorderConfirm,
    handleRemovePile,
    handleAddPileConfirm,
  } = useSequenceEditor({
    siteId,
    checklist,
    workingDate,
    checklistPiles,
    pileGroups,
    pileMap,
    machines,
    activeMachines,
    selectedMachineId,
    editPlanMidDay,
    previewEditPlanMidDay,
  });

  const replan = useReplanPrompt({
    siteId,
    checklist,
    workingDate,
    checklistPiles,
    pileGroups,
    previewEditPlanMidDay,
    editPlanMidDay,
  });

  const {
    handleSetActualTime,
    handleClearActualTime,
    handleSaveRemarks,
    handleSaveMeasurements,
    handlePauseStep,
    handleResumeStep,
    handleFinishSegment,
    handleEditSegmentTime,
    handleSetSegmentNotes,
    handleDeleteSegment,
  } = useActualTimeActions({
    openGroup,
    checklist,
    setActualTime,
    clearActualTime,
    setRemarks,
    setPileMeasurement,
    pauseStep,
    resumeStep,
    finishSegment,
    editSegmentTime,
    setSegmentNotes,
    deleteSegment,
  });

  const {
    handleLogMachineEvent,
    machineEventFor,
    handleOpenMachineEvent,
    handleLogMachineEventForCard,
    machineEventHistory,
    closeMachineEvent,
  } = useMachineEventActions({
    openGroup,
    checklistPiles,
    machineEvents,
    openIdleByMachineId,
    currentStepByMachineId,
    machineMap,
    logMachineEvent,
    reloadMachines,
    reloadMachineEvents,
  });

  // AddPileModal's lockedMachine — looked up here (not force-unwrapped inline
  // in the JSX) so a transient miss (e.g. `machines` still loading) can gate
  // the modal's mount instead of crashing on `.id` of an undefined machine.
  const lockedMachineRecord = activeMachine ? machines.find((m) => m.id === activeMachine.id) : undefined;

  const machineEventPileCode =
    machineEventFor &&
    (pileGroups.find((g) => g.checklistPileId === machineEventFor.checklistPileId)?.pileCode ??
      machineEventFor.machineNo);
  const machineEventStepName =
    machineEventFor &&
    (pileGroups
      .find((g) => g.checklistPileId === machineEventFor.checklistPileId)
      ?.steps.find((s) => s.stepId === machineEventFor.stepId)?.stepName ?? machineEventFor.eventType);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={colors.backdropGradient} style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Log Actuals</Text>
            <View style={{ width: 22 }} />
          </View>
        </View>

        {isLoading || lookupsLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : !checklist ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="calendar"
              title="No plan generated"
              message="No plan has been created for today yet."
            />
          </View>
        ) : pileGroups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="layers"
              title="No piles in plan"
              message="Today's plan doesn't include any piles yet."
            />
          </View>
        ) : activeMachines.length > 0 ? (
          <View style={styles.pagerArea}>
            <SwipeableTabBar
              items={machineBadgeItems}
              value={selectedMachineId ?? activeMachines[0].id}
              onChange={setSelectedMachineId}
              scrollHint="dots"
              pillVariant="piles"
              dividerStyle={{ marginTop: spacing.md }}
              fillHeight
              renderPage={(item) => {
                const page = machinePagesById.get(item.value) ?? {
                  groups: EMPTY_PILE_GROUPS,
                  frontPileId: undefined,
                };
                const machine = activeMachines.find((m) => m.id === item.value);
                if (!machine) return null;
                return (
                  <MachinePilesPage
                    machine={machine}
                    status={machineStatusById.get(machine.id)}
                    railColor={TRACK_META[machine.type].color}
                    groups={page.groups}
                    frontPileId={page.frontPileId}
                    openIdle={idleSessionByMachineId.get(item.value)}
                    hasActiveStep={currentStepByMachineId.has(machine.id)}
                    onOpenPile={setOpenCpId}
                    onBreakdown={() => handleOpenMachineEvent(machine.id, machine.type, 'BREAKDOWN')}
                    onStartIdle={() => handleOpenMachineEvent(machine.id, machine.type, 'IDLE_START')}
                    onEndIdle={() => handleOpenMachineEvent(machine.id, machine.type, 'IDLE_END')}
                    onEditSequence={openSequenceModal}
                  />
                );
              }}
            />
          </View>
        ) : null}
      </View>

      {openGroup && (
        <PileStepsModal
          group={openGroup}
          machines={machines}
          machineFloorIndex={machineFloorIndex}
          inProgressStepByMachineId={inProgressStepByMachineId}
          contractors={contractors}
          checklist={checklist}
          onClose={() => setOpenCpId(null)}
          onSetActualTime={handleSetActualTime}
          onClearActualTime={handleClearActualTime}
          onSaveRemarks={handleSaveRemarks}
          onLogMachineEvent={handleLogMachineEvent}
          onSaveMeasurements={handleSaveMeasurements}
          onPauseStep={async (stepId, input) => {
            await handlePauseStep(stepId, input);
            // Only after the pause is durably recorded. The prompt is a
            // follow-up offer, never a gate on logging the time.
            await replan.offerReplan();
          }}
          onResumeStep={handleResumeStep}
          onFinishSegment={handleFinishSegment}
          onEditSegmentTime={handleEditSegmentTime}
          onSetSegmentNotes={handleSetSegmentNotes}
          onDeleteSegment={handleDeleteSegment}
        />
      )}

      {machineEventFor && machineEventFor.eventType === 'BREAKDOWN' && (
        <MachineDownModal
          visible
          pileCode={machineEventPileCode!}
          stepName={machineEventStepName!}
          defaultTrack={machineEventFor.track}
          machines={machines}
          currentMachineIdByTrack={{ [machineEventFor.track]: machineEventFor.machineId }}
          history={machineEventHistory}
          onClose={closeMachineEvent}
          onLogMachineEvent={handleLogMachineEventForCard}
        />
      )}

      {machineEventFor && machineEventFor.eventType !== 'BREAKDOWN' && (
        <MachineIdleModal
          visible
          pileCode={machineEventPileCode!}
          stepName={machineEventStepName!}
          defaultTrack={machineEventFor.track}
          initialEventType={machineEventFor.eventType as 'IDLE_START' | 'IDLE_END'}
          machines={machines}
          currentMachineIdByTrack={{ [machineEventFor.track]: machineEventFor.machineId }}
          history={machineEventHistory}
          onClose={closeMachineEvent}
          onLogMachineEvent={handleLogMachineEventForCard}
        />
      )}

      {activeMachine && (
        <ReorderPilesModal
          key={sequenceRemountKey}
          visible={sequenceModalOpen}
          onClose={closeSequenceModal}
          machine={activeMachine}
          piles={sequencePiles}
          onReorder={handleReorderConfirm}
          onRemove={handleRemovePile}
          onAddPile={() => setAddPileModalOpen(true)}
          isUpdating={isSavingSequence}
          confirmLabel="Save Changes"
          subtitleText="Reorder, add, or remove piles, then save"
        />
      )}

      {replan.preview && (
        <ReplanPromptSheet
          visible
          preview={replan.preview}
          isApplying={replan.isApplying}
          onClose={replan.dismiss}
          onConfirm={replan.confirmReplan}
        />
      )}

      {activeMachine && checklist && lockedMachineRecord && (
        <AddPileModal
          visible={addPileModalOpen}
          onClose={() => setAddPileModalOpen(false)}
          siteId={siteId}
          checklistId={checklist.id}
          targetDate={workingDate}
          excludePileCodes={
            new Set(
              (draftRows ?? [])
                .map((r) => pileMap.get(r.pileId)?.pileIdCode)
                .filter((code): code is string => !!code),
            )
          }
          lockedMachine={{
            kind: activeMachine.type === 'RIG' ? 'rig' : 'crane',
            machine: lockedMachineRecord,
          }}
          rigs={rigs}
          cranes={cranes}
          isSaving={isSavingSequence}
          onConfirm={handleAddPileConfirm}
        />
      )}
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerArea: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: { ...typography.h2, color: colors.textPrimary, fontWeight: '700' },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  pagerArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
