// src/screens/Home/FillActualScreen.tsx

import { useCallback, useEffect, useRef } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '@app-types/navigation';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '@theme/theme';
import { TRACK_META } from '@utils/helpers';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import PileStepsModal from '@components/plan/actual/PileStepsModal';
import MachineDownModal from '@components/plan/actual/MachineDownModal';
import MachineIdleModal from '@components/plan/actual/MachineIdleModal';
import SwipeableTabBar from '@components/shared/SwipeableTabBar';
import ReorderPilesOverlay from '@components/plan/generate/preview/ReorderPilesOverlay';
import AddPileModal from '@components/plan/actual/AddPileModal';
import EmptyState from '@components/shared/EmptyState';
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

  // Tapping a pile that's idle-blocked has nothing to act on there anymore
  // (see MachinePilesPage) — scroll up to the machine card's End Idle
  // action instead, since it's the first thing in the selected machine's
  // page content.
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const {
    machines,
    machineMap,
    pileMap,
    personnelMap,
    contractors,
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
    machineMap,
    machineStatusById,
    checklist,
    windowsByMachineId,
    completedStepsByPileId,
    measurementsByPileId: pileMeasurementsByPileId,
  });

  const { machineFloorIndex, frontPileIdByMachineId, currentStepByMachineId } = useMachineFloor({ pileGroups });

  const {
    activeMachines,
    machinePagesById,
    machineBadgeItems,
    selectedMachineId,
    setSelectedMachineId,
  } = useMachinePages({ checklistPiles, machineMap, pileGroups, frontPileIdByMachineId });

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

  const { handleSetActualTime, handleClearActualTime, handleSaveRemarks, handleSaveMeasurements } =
    useActualTimeActions({
      openGroup,
      planSteps,
      actualSteps,
      checklist,
      setActualTime,
      clearActualTime,
      setRemarks,
      setPileMeasurement,
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
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Log Actuals</Text>
            <View style={{ width: 22 }} />
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(isLoading || lookupsLoading) && (
            <ActivityIndicator
              size="large"
              color={colors.accent}
              style={{ marginTop: spacing.xxl }}
            />
          )}

          {!isLoading && !lookupsLoading && !checklist && (
            <EmptyState
              icon="calendar"
              title="No plan generated"
              message="No plan has been created for today yet."
            />
          )}

          {!isLoading && !lookupsLoading && checklist && pileGroups.length === 0 && (
            <EmptyState
              icon="layers"
              title="No piles in plan"
              message="Today's plan doesn't include any piles yet."
            />
          )}

          {!isLoading && !lookupsLoading && activeMachines.length > 0 && (
            <SwipeableTabBar
              items={machineBadgeItems}
              value={selectedMachineId ?? activeMachines[0].id}
              onChange={setSelectedMachineId}
              scrollHint="dots"
              pillVariant="piles"
              dividerStyle={{ marginTop: spacing.md }}
              renderPage={(item) => {
                const page = machinePagesById.get(item.value) ?? {
                  activeGroups: EMPTY_PILE_GROUPS,
                  upcomingGroups: EMPTY_PILE_GROUPS,
                };
                const machine = activeMachines.find((m) => m.id === item.value);
                if (!machine) return null;
                return (
                  <MachinePilesPage
                    machine={machine}
                    status={machineStatusById.get(machine.id)}
                    railColor={TRACK_META[machine.type].color}
                    activeGroups={page.activeGroups}
                    upcomingGroups={page.upcomingGroups}
                    openIdle={idleSessionByMachineId.get(item.value)}
                    hasActiveStep={currentStepByMachineId.has(machine.id)}
                    onOpenPile={setOpenCpId}
                    onIdleBlockedPilePress={scrollToTop}
                    onBreakdown={() => handleOpenMachineEvent(machine.id, machine.type, 'BREAKDOWN')}
                    onStartIdle={() => handleOpenMachineEvent(machine.id, machine.type, 'IDLE_START')}
                    onEndIdle={() => handleOpenMachineEvent(machine.id, machine.type, 'IDLE_END')}
                    onEditSequence={openSequenceModal}
                  />
                );
              }}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      {openGroup && (
        <PileStepsModal
          group={openGroup}
          machines={machines}
          machineFloorIndex={machineFloorIndex}
          contractors={contractors}
          checklist={checklist}
          onClose={() => setOpenCpId(null)}
          onSetActualTime={handleSetActualTime}
          onClearActualTime={handleClearActualTime}
          onSaveRemarks={handleSaveRemarks}
          onLogMachineEvent={handleLogMachineEvent}
          onSaveMeasurements={handleSaveMeasurements}
        />
      )}

      {machineEventFor && machineEventFor.eventType === 'BREAKDOWN' && (
        <MachineDownModal
          visible
          pileCode={machineEventPileCode!}
          stepName={machineEventStepName!}
          defaultTrack={machineEventFor.track}
          initialEventType="BREAKDOWN"
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

      {sequenceModalOpen && activeMachine && (
        <ReorderPilesOverlay
          key={sequenceRemountKey}
          visible
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

      {addPileModalOpen && activeMachine && (
        <AddPileModal
          visible
          onClose={() => setAddPileModalOpen(false)}
          siteId={siteId}
          checklistId={checklist!.id}
          draftRows={draftRows ?? []}
          excludePileIds={new Set((draftRows ?? []).map((r) => r.pileId))}
          lockedMachine={{
            kind: activeMachine.type === 'RIG' ? 'rig' : 'crane',
            machine: machines.find((m) => m.id === activeMachine.id)!,
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
