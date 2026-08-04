// src/screens/Home/FillActualScreen.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '@app-types/navigation';
import { ChevronLeft, CheckCircle2, Circle, ArrowRight, MoreHorizontal, AlertTriangle, ListOrdered } from 'lucide-react-native';
import { colors, spacing, typography } from '@theme/theme';
import { formatTime, formatMinutes12, toLocalIsoString, resolveOvernightDate } from '@utils/formatTime';
import { stepWorkStart } from '@utils/helpers';
import { usePlan, type LogMachineEventInput } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import PileProgressCard from '@components/plan/actual/PileProgressCard';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { getPilesBySite } from '@repositories/pilesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getMachineEventsForChecklistPile } from '@repositories/machineEventsRepository';
import type { PilingMachine, PilingPile, PilingSitePersonnel, PilMachineEvent } from '@db/schema';
import type { ActualEntry } from '@app-types/plan';

/** Shape expected by PileProgressCard and PileStepsModalAdapter. */
type PileGroup = {
  checklistPileId: string;
  pileId: string;
  pileCode: string;
  rig: string;
  crane: string;
  steps: ActualEntry[];
  /** True when a not-yet-done step's assigned machine has status BREAKDOWN. */
  hasBreakdownWarning: boolean;
};

/** Convert ISO timestamp to minutes-since-midnight (used by old components). */
function isoToMinutes(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return undefined;
  }
}

/** Current time-of-day as minutes-since-midnight. */
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

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
    isLoading,
    conflictNotice,
    dismissConflictNotice,
    loadChecklist,
    setActualTime,
    setRemarks,
    logMachineEvent,
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

  // ── Local machine + pile name lookups ───────────────────────────────────
  const [machines, setMachines] = useState<PilingMachine[]>([]);
  const [machineMap, setMachineMap] = useState<Map<string, string>>(new Map());
  const [pileMap, setPileMap] = useState<Map<string, PilingPile>>(new Map());
  const [personnelMap, setPersonnelMap] = useState<Map<string, PilingSitePersonnel>>(new Map());
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Shift Incharge (Shift 1) for the header subtitle — the closest
  // equivalent to what "supervisor" used to mean before the multi-role
  // system replaced it.
  const [shiftIncharge1Id, setShiftIncharge1Id] = useState<string | null>(null);
  useEffect(() => {
    if (!checklist) {
      setShiftIncharge1Id(null);
      return;
    }
    getChecklistPersonnel(checklist.id)
      .then((rows) => {
        const row = rows.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 1);
        setShiftIncharge1Id(row?.personnelId ?? null);
      })
      .catch(() => setShiftIncharge1Id(null));
  }, [checklist]);

  useEffect(() => {
    if (!siteId) return;
    setLookupsLoading(true);
    (async () => {
      const [fetchedMachines, piles, personnel] = await Promise.all([
        getMachinesBySite(siteId),
        getPilesBySite(siteId),
        getPersonnelBySite(siteId),
      ]);
      setMachines(fetchedMachines);
      setMachineMap(new Map(fetchedMachines.map((m) => [m.id, m.machineNo])));
      setPileMap(new Map(piles.map((p) => [p.id, p])));
      setPersonnelMap(new Map(personnel.map((p) => [p.id, p])));
      setLookupsLoading(false);
    })();
  }, [siteId]);

  const machineStatusById = useMemo(
    () => new Map(machines.map((m) => [m.id, m.status])),
    [machines],
  );

  // ── Build pile groups from context data ─────────────────────────────────
  const pileGroups = useMemo((): PileGroup[] => {
    if (!checklistPiles.length) return [];

    return checklistPiles.map((cp) => {
      const pile = pileMap.get(cp.pileId);

      // Steps for this checklist-pile, merged plan + actual
      const cpPlanSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === cp.id);

      const steps: ActualEntry[] = cpPlanSteps.map((ps) => {
        const actual = cpActualSteps.find((a) => a.stepId === ps.stepId);
        return {
          stepId: ps.stepId,
          pileId: cp.pileId,
          pileCode: pile?.pileIdCode ?? cp.pileId,
          stepName: ps.stepName,
          track: ps.track as 'RIG' | 'CRANE' | 'COMPRESSOR',
          sequenceOrder: ps.sequenceOrder,
          plannedStart: isoToMinutes(stepWorkStart(ps)) ?? 0,
          // Preserve undefined (rather than fabricating midnight) when this
          // step is "continuing" — it never had a committed end time.
          plannedEnd: isoToMinutes(ps.plannedEnd),
          actualStart: isoToMinutes(actual?.actualStart ?? null),
          actualEnd: isoToMinutes(actual?.actualEnd ?? null),
          remarks: actual?.remarks ?? undefined,
          assignedMachineId: ps.assignedMachineId ?? undefined,
          assignedMachineNo: ps.assignedMachineNo || undefined,
        };
      });

      // Machine events (breakdown reporting) only apply to the current step —
      // the one step actively being worked, regardless of track — so the
      // warning only fires when that specific step's assigned machine is down.
      const currentStep = [...steps]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .find((s) => s.actualEnd === undefined);
      const hasBreakdownWarning =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'BREAKDOWN';

      return {
        checklistPileId: cp.id,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        rig: machineMap.get(cp.rigId) ?? cp.rigId,
        crane: machineMap.get(cp.craneId) ?? cp.craneId,
        steps,
        hasBreakdownWarning,
      };
    });
  }, [checklistPiles, planSteps, actualSteps, pileMap, machineMap, machineStatusById]);

  // ── Partition piles into "up next per machine" vs the rest ──────────────
  // A pile's own "current step" isn't the same as "this pile's machine is
  // actively on it right now" — a machine works piles one at a time in
  // seq_no order, so several not-yet-finished piles assigned to the same
  // rig can each nominally have an unfinished rig step even though the rig
  // has only reached the first one. The real signal, per machine, is the
  // earliest-seq_no pile that still has an unfinished step assigned to it —
  // pileGroups is already seq_no order, so the first match per machine is
  // that machine's front-of-queue pile.
  const { activeGroups, upcomingGroups } = useMemo(() => {
    const machineIds = new Set<string>();
    pileGroups.forEach((g) =>
      g.steps.forEach((s) => {
        if (s.assignedMachineId) machineIds.add(s.assignedMachineId);
      }),
    );

    const frontPileIds = new Set<string>();
    machineIds.forEach((machineId) => {
      const front = pileGroups.find((g) =>
        g.steps.some((s) => s.assignedMachineId === machineId && s.actualEnd === undefined),
      );
      if (front) frontPileIds.add(front.checklistPileId);
    });

    return {
      activeGroups: pileGroups.filter((g) => frontPileIds.has(g.checklistPileId)),
      upcomingGroups: pileGroups.filter((g) => !frontPileIds.has(g.checklistPileId)),
    };
  }, [pileGroups]);

  // ── Modal state ─────────────────────────────────────────────────────────
  const [openCpId, setOpenCpId] = useState<string | null>(null);
  const openGroup = pileGroups.find((g) => g.checklistPileId === openCpId) ?? null;

  // ── Adapt setActualTime for the modal, which calls by stepId only ────────
  // PlanContext expects: setActualTime(checklistPileId, stepId, field, isoTimestamp)
  // We need to wrap it — the open group gives us checklistPileId.
  //
  // The picked value is only a time-of-day (minutes-since-midnight) — the
  // wheel picker has no day-navigation control — so we must resolve which
  // calendar day it belongs to ourselves. We anchor on the nearest real ISO
  // timestamp already known for this step sequence (the previous step's
  // actual end for a start time, or this step's own actual start for an end
  // time) and roll forward a day if the picked time-of-day is earlier than
  // the anchor's, so overnight continuations land on the correct date instead
  // of always being forced onto "today".
  const handleSetActualTime = useCallback(
    async (stepId: string, field: 'actualStart' | 'actualEnd', minutesSinceMidnight: number) => {
      if (!openGroup) return;

      const cpPlanSteps = planSteps
        .filter((s) => s.checklistPileId === openGroup.checklistPileId)
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === openGroup.checklistPileId);
      const idx = cpPlanSteps.findIndex((s) => s.stepId === stepId);

      let anchorIso: string;
      if (field === 'actualEnd') {
        anchorIso =
          cpActualSteps.find((a) => a.stepId === stepId)?.actualStart ??
          cpPlanSteps[idx]?.plannedStart ??
          checklist?.planStartTime ??
          toLocalIsoString(new Date());
      } else {
        const prevPlan = idx > 0 ? cpPlanSteps[idx - 1] : null;
        const prevActual = prevPlan ? cpActualSteps.find((a) => a.stepId === prevPlan.stepId) : null;
        anchorIso =
          prevActual?.actualEnd ??
          prevPlan?.plannedEnd ??
          prevPlan?.plannedStart ??
          cpPlanSteps[idx]?.plannedStart ??
          checklist?.planStartTime ??
          toLocalIsoString(new Date());
      }

      const dt = resolveOvernightDate(anchorIso, minutesSinceMidnight);
      await setActualTime(openGroup.checklistPileId, stepId, field, toLocalIsoString(dt));
    },
    [openGroup, planSteps, actualSteps, checklist, setActualTime],
  );

  const handleSaveRemarks = useCallback(
    async (stepId: string, text: string) => {
      if (!openGroup) return;
      await setRemarks(openGroup.checklistPileId, stepId, text);
    },
    [openGroup, setRemarks],
  );

  const handleLogMachineEvent = useCallback(
    async (stepId: string, input: LogMachineEventInput) => {
      if (!openGroup) return;
      await logMachineEvent(openGroup.checklistPileId, stepId, input);
    },
    [openGroup, logMachineEvent],
  );

  // ── Shift Incharge display ──────────────────────────────────────────────
  const supervisorName = shiftIncharge1Id
    ? personnelMap.get(shiftIncharge1Id)?.name ?? 'Unknown'
    : null;

  const startTimeDisplay = checklist?.planStartTime
    ? formatTime(checklist.planStartTime)
    : null;

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
            <Pressable
              onPress={() => navigation.navigate('EditPlan', { date: workingDate })}
              hitSlop={12}
              disabled={!checklist}
              style={{ opacity: checklist ? 1 : 0.35 }}
            >
              <ListOrdered size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
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

          {!isLoading && !lookupsLoading && activeGroups.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Up Next</Text>
              {activeGroups.map((group) => (
                <PileProgressCard
                  key={group.checklistPileId}
                  pileCode={group.pileCode}
                  rig={group.rig}
                  crane={group.crane}
                  steps={group.steps}
                  hasBreakdownWarning={group.hasBreakdownWarning}
                  onPress={() => setOpenCpId(group.checklistPileId)}
                />
              ))}
            </>
          )}

          {!isLoading && !lookupsLoading && upcomingGroups.length > 0 && (
            <>
              {activeGroups.length > 0 && <Text style={styles.sectionHeader}>Remaining Piles</Text>}
              {upcomingGroups.map((group) => (
                <PileProgressCard
                  key={group.checklistPileId}
                  pileCode={group.pileCode}
                  rig={group.rig}
                  crane={group.crane}
                  steps={group.steps}
                  hasBreakdownWarning={group.hasBreakdownWarning}
                  onPress={() => setOpenCpId(group.checklistPileId)}
                />
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {openGroup && (
        <PileStepsModalAdapter
          group={openGroup}
          machines={machines}
          onClose={() => setOpenCpId(null)}
          onSetActualTime={handleSetActualTime}
          onSaveRemarks={handleSaveRemarks}
          onLogMachineEvent={handleLogMachineEvent}
        />
      )}
    </LinearGradient>
  );
}

// ─── Modal content for logging actual start/finish times per pile step ───────

import AppModal from '@components/shared/AppModal';
import StepTimeControl from '@components/plan/actual/StepTimeControl';
import StepActionsModal from '@components/plan/actual/StepActionsModal';
import EditTimeButton from '@components/plan/actual/EditTimeButton';
import { radius } from '@theme/theme';
import EmptyState from '@/components/shared/EmptyState';

function trackColors(track: ActualEntry['track']): { bg: string; fg: string } {
  if (track === 'RIG') return { bg: colors.accentSoft, fg: colors.accent };
  if (track === 'CRANE') return { bg: 'rgba(255,149,0,0.12)', fg: colors.warning };
  return { bg: colors.machines.compressor.soft, fg: colors.machines.compressor.color };
}

/** Current assigned machine per track, derived from this pile's steps —
 * the not-done step with the earliest sequence order per track (or, if every
 * step of that track is done, the last one), since that's "what's actually
 * assigned right now" for a breakdown report. */
function getCurrentMachineIdByTrack(steps: ActualEntry[]): Partial<Record<ActualEntry['track'], string>> {
  const result: Partial<Record<ActualEntry['track'], string>> = {};
  const tracks: ActualEntry['track'][] = ['RIG', 'CRANE', 'COMPRESSOR'];
  for (const track of tracks) {
    const trackSteps = steps.filter((s) => s.track === track).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    if (!trackSteps.length) continue;
    const notDone = trackSteps.find((s) => s.actualEnd === undefined);
    const chosen = notDone ?? trackSteps[trackSteps.length - 1];
    if (chosen.assignedMachineId) result[track] = chosen.assignedMachineId;
  }
  return result;
}

function PileStepsModalAdapter({
  group,
  machines,
  onClose,
  onSetActualTime,
  onSaveRemarks,
  onLogMachineEvent,
}: {
  group: PileGroup;
  machines: PilingMachine[];
  onClose: () => void;
  onSetActualTime: (stepId: string, field: 'actualStart' | 'actualEnd', minutes: number) => Promise<void>;
  onSaveRemarks: (stepId: string, text: string) => Promise<void>;
  onLogMachineEvent: (stepId: string, input: LogMachineEventInput) => Promise<void>;
}) {
  // Steps always unlock in piling_steps.sequence_order, regardless of track —
  // exactly one step (the first not yet finished) is ever "current" at a time.
  const steps = [...group.steps].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const currentStepId = steps.find((s) => s.actualEnd === undefined)?.stepId;
  const allDone = !currentStepId;

  // Only the most recently completed step's times can be corrected — older
  // history stays frozen. Done steps are always a contiguous prefix (steps
  // unlock strictly in order), so this is just the step right before the
  // current one, or the last step if the whole pile is done.
  const currentIdxForEdit = steps.findIndex((s) => s.stepId === currentStepId);
  const lastDoneIndex = currentIdxForEdit === -1 ? steps.length - 1 : currentIdxForEdit - 1;

  // Local state for the step-actions modal (remarks + machine events).
  // Machine events can only be logged/edited on the current step — completed
  // steps only get remarks (retroactively changing a completed step's machine
  // has no sensible meaning, and future/locked steps aren't being worked yet).
  const [actionsFor, setActionsFor] = useState<{
    stepId: string;
    stepName: string;
    track: ActualEntry['track'];
    remarks?: string;
    initialTab: 'remarks' | 'machine_events';
    allowMachineEvents: boolean;
  } | null>(null);
  const [history, setHistory] = useState<PilMachineEvent[]>([]);

  useEffect(() => {
    if (!actionsFor) return;
    let cancelled = false;
    getMachineEventsForChecklistPile(group.checklistPileId).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [actionsFor, group.checklistPileId]);

  const currentMachineIdByTrack = useMemo(() => getCurrentMachineIdByTrack(steps), [steps]);
  const currentStep = steps.find((s) => s.stepId === currentStepId);

  const currentStepHasBreakdown =
    group.hasBreakdownWarning &&
    !!currentStep &&
    !!currentStep.assignedMachineId &&
    machines.find((m) => m.id === currentStep.assignedMachineId)?.status === 'BREAKDOWN';

  const subtitle = [group.rig && `Rig ${group.rig}`, group.crane && `Crane ${group.crane}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <AppModal visible title={group.pileCode} subtitle={subtitle || undefined} onClose={onClose}>
      {currentStepHasBreakdown && currentStep && (
        <Pressable
          style={modalStyles.warningBanner}
          onPress={() =>
            setActionsFor({
              stepId: currentStep.stepId,
              stepName: currentStep.stepName,
              track: currentStep.track,
              remarks: currentStep.remarks,
              initialTab: 'machine_events',
              allowMachineEvents: true,
            })
          }
        >
          <AlertTriangle size={16} color={colors.danger} />
          <Text style={modalStyles.warningBannerText}>
            Machine reported down — tap to reassign
          </Text>
        </Pressable>
      )}

      {steps.map((step, idx) => {
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent = step.stepId === currentStepId;
        const isLocked = !isDone && !isCurrent;
        const isEditableDoneStep = isDone && idx === lastDoneIndex;
        const lateMinutes =
          isDone && step.plannedEnd != null ? step.actualEnd! - step.plannedEnd : null;
        const isLate = lateMinutes != null && lateMinutes > 0;

        return (
          <View key={step.stepId} style={modalStyles.stepRow}>
            <View style={modalStyles.markerCol}>
              {isDone ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : (
                <Circle size={20} color={isCurrent ? colors.accent : colors.textSecondary} />
              )}
              {idx < steps.length - 1 && <View style={modalStyles.markerLine} />}
            </View>

            <View style={[modalStyles.stepContent, isLocked && modalStyles.stepContentLocked]}>
              <View style={modalStyles.stepHeaderRow}>
                <Text style={modalStyles.stepName}>{step.stepName}</Text>
                <View style={modalStyles.stepHeaderRight}>
                  <View
                    style={[
                      modalStyles.trackBadge,
                      { backgroundColor: trackColors(step.track).bg },
                    ]}
                  >
                    <Text
                      style={[
                        modalStyles.trackTag,
                        { color: trackColors(step.track).fg },
                      ]}
                    >
                      {`${step.track}${step.assignedMachineNo ? ` (${step.assignedMachineNo})` : ''}`}
                    </Text>
                  </View>
                  <Pressable
                    style={modalStyles.ellipsisBtn}
                    hitSlop={8}
                    onPress={() =>
                      setActionsFor({
                        stepId: step.stepId,
                        stepName: step.stepName,
                        track: step.track,
                        remarks: step.remarks,
                        initialTab: 'remarks',
                        allowMachineEvents: isCurrent,
                      })
                    }
                  >
                    <MoreHorizontal size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
              

              <View style={modalStyles.timeRow}>
                <Text style={modalStyles.rowLabel}>PLAN</Text>
                <Text style={modalStyles.timeText}>{formatMinutes12(step.plannedStart)}</Text>
                <ArrowRight size={12} color={colors.textSecondary} style={modalStyles.timeIcon} />
                <Text style={modalStyles.timeText}>
                  {step.plannedEnd == null ? 'To be continued' : formatMinutes12(step.plannedEnd)}
                </Text>
              </View>

              {isDone && (
                <View style={modalStyles.timeRow}>
                  <Text style={[modalStyles.rowLabel, modalStyles.rowLabelActual]}>ACTUAL</Text>
                  <Text style={modalStyles.loggedText}>{formatMinutes12(step.actualStart!)}</Text>
                  {isEditableDoneStep && (
                    <EditTimeButton
                      minutes={step.actualStart!}
                      label="start time"
                      minMinutes={idx > 0 ? steps[idx - 1].actualEnd : undefined}
                      minMinutesLabel="the previous step's end time"
                      maxMinutes={step.actualEnd}
                      maxMinutesLabel="this step's own finish time"
                      onConfirm={(mins) => onSetActualTime(step.stepId, 'actualStart', mins)}
                    />
                  )}
                  <ArrowRight size={12} color={colors.success} style={modalStyles.timeIcon} />
                  <Text style={[modalStyles.loggedText, isLate && modalStyles.lateText]}>
                    {formatMinutes12(step.actualEnd!)}
                  </Text>
                  {isEditableDoneStep && (
                    <EditTimeButton
                      minutes={step.actualEnd!}
                      label="finish time"
                      minMinutes={step.actualStart}
                      minMinutesLabel="this step's start time"
                      maxMinutes={
                        idx < steps.length - 1 && steps[idx + 1].actualStart !== undefined
                          ? steps[idx + 1].actualStart
                          : undefined
                      }
                      maxMinutesLabel="the next step's start time"
                      onConfirm={(mins) => onSetActualTime(step.stepId, 'actualEnd', mins)}
                    />
                  )}
                </View>
              )}

              {isCurrent && !isStarted && (
                <StepTimeControl
                  mode="start"
                  stepName={step.stepName}
                  // Prefer "right after the previous step actually ended" over
                  // the originally-planned start — more realistic once the day
                  // has drifted from plan. Falls back to plannedStart for the
                  // first step (no previous step to anchor to).
                  defaultMinutes={(idx > 0 ? steps[idx - 1].actualEnd : undefined) ?? step.plannedStart}
                  onConfirm={(mins) => onSetActualTime(step.stepId, 'actualStart', mins)}
                  remarks={step.remarks}
                  onAddRemarks={() =>
                    setActionsFor({
                      stepId: step.stepId,
                      stepName: step.stepName,
                      track: step.track,
                      remarks: step.remarks,
                      initialTab: 'remarks',
                      allowMachineEvents: true,
                    })
                  }
                  minMinutes={idx > 0 ? steps[idx - 1].actualEnd : undefined}
                  minMinutesLabel="the previous step's end time"
                />
              )}

              {isCurrent && isStarted && !isDone && (
                <>
                  <View style={modalStyles.timeRow}>
                    <Text style={modalStyles.startedText}>
                      Started {formatMinutes12(step.actualStart!)}
                    </Text>
                    <EditTimeButton
                      minutes={step.actualStart!}
                      label="start time"
                      minMinutes={idx > 0 ? steps[idx - 1].actualEnd : undefined}
                      minMinutesLabel="the previous step's end time"
                      onConfirm={(mins) => onSetActualTime(step.stepId, 'actualStart', mins)}
                    />
                  </View>
                  <StepTimeControl
                    mode="finish"
                    stepName={step.stepName}
                    // Only trust plannedEnd as a default if it's still after the
                    // actual start — if the step started late, the original plan
                    // window may have already passed, so defaulting to it would
                    // just get rejected by minMinutes. Fall back to now instead.
                    defaultMinutes={
                      step.plannedEnd != null && step.plannedEnd > step.actualStart!
                        ? step.plannedEnd
                        : nowMinutes()
                    }
                    onConfirm={(mins) => onSetActualTime(step.stepId, 'actualEnd', mins)}
                    remarks={step.remarks}
                    onAddRemarks={() =>
                      setActionsFor({
                        stepId: step.stepId,
                        stepName: step.stepName,
                        track: step.track,
                        remarks: step.remarks,
                        initialTab: 'remarks',
                        allowMachineEvents: true,
                      })
                    }
                    minMinutes={step.actualStart}
                    minMinutesLabel="this step's start time"
                  />
                </>
              )}

              {isLocked && (
                <Text style={modalStyles.lockedText}>Waiting on previous step</Text>
              )}
            </View>
          </View>
        );
      })}

      {allDone && (
        <View style={modalStyles.allDoneWrap}>
          <CheckCircle2 size={22} color={colors.success} />
          <Text style={modalStyles.allDoneText}>
            All steps for {group.pileCode} are complete
          </Text>
        </View>
      )}

      {actionsFor && (
        <StepActionsModal
          visible
          pileCode={group.pileCode}
          stepName={actionsFor.stepName}
          defaultTrack={actionsFor.track}
          machines={machines}
          currentMachineIdByTrack={currentMachineIdByTrack}
          history={history}
          remarks={actionsFor.remarks}
          initialTab={actionsFor.initialTab}
          allowMachineEvents={actionsFor.allowMachineEvents}
          onClose={() => setActionsFor(null)}
          onSaveRemarks={(text) => onSaveRemarks(actionsFor.stepId, text)}
          onLogMachineEvent={(input) => onLogMachineEvent(actionsFor.stepId, input)}
        />
      )}
    </AppModal>
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
  sectionHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
});

const modalStyles = StyleSheet.create({
  stepRow: { flexDirection: 'row', marginBottom: spacing.md },
  markerCol: { alignItems: 'center', width: 24 },
  markerLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.1)',
    marginVertical: 3,
  },
  stepContent: { flex: 1, paddingLeft: spacing.sm },
  stepContentLocked: { opacity: 0.45 },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepName: { ...typography.cardTitle, color: colors.textPrimary },
  trackBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  trackTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  plannedText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  loggedText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.success,
    marginTop: spacing.xs,
  },
  startedText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.xs,
  },
  lockedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  allDoneWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  allDoneText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  rowLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    width: 46,
  },
  rowLabelActual: {
    color: colors.success,
  },
  lateText: {
    color: colors.danger,
  },
  varianceChip: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  varianceChipLate: {
    backgroundColor: colors.dangerSoft,
  },
  varianceChipOnTime: {
    backgroundColor: colors.successSoft,
  },
  varianceChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  timeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timeIcon: {
    marginHorizontal: 4,
  },
  stepHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ellipsisBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  warningBannerText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.danger,
    flex: 1,
  },
});
