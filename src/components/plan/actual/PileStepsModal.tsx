// src/components/plan/actual/PileStepsModal.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeftRight,
  AlertTriangle,
  MessageSquarePlus,
  Coffee,
  PencilLine,
} from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import StepTimeControl from '@components/plan/actual/StepTimeControl';
import EditTimeButton from '@components/plan/actual/EditTimeButton';
import DeleteTimeButton from '@components/plan/actual/DeleteTimeButton';
import RemarksModal from '@components/plan/actual/RemarksModal';
import MachineDownModal from '@components/plan/actual/MachineDownModal';
import MachineIdleModal from '@components/plan/actual/MachineIdleModal';
import MachineReplaceModal from '@components/plan/actual/MachineReplaceModal';
import MeasurementFieldsModal, {
  type MeasurementFieldConfig,
} from '@components/plan/actual/MeasurementFieldsModal';
import { getMachineEventsForChecklistPile } from '@repositories/machineEventsRepository';
import type { PilingMachine, PilMachineEvent, PilContractor, PilingDailyChecklist } from '@db/schema';
import type { ActualEntry, PileGroup, PileMeasurementFields } from '@app-types/plan';
import type { LogMachineEventInput } from '@state/PlanContext';
import { findMeasurementTrigger, getMeasurementFieldsForStep } from '@utils/pileMeasurementTriggers';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import {
  formatMinutes12,
  formatTime,
  formatTimeWithDay,
  formatDuration,
  durationMinutes,
  addMinutes,
  toLocalIsoString,
} from '@utils/formatTime';
import { hasMachineConflict, hasPileStepConflict, type MachineFloorIndex } from '@utils/machineFloor';
import { getTrackBadgeColors } from '@utils/helpers';

/** Current time-of-day as minutes-since-midnight. */
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Current assigned machine per *business* track, derived from this pile's
 * steps — the not-done step with the earliest sequence order per business
 * track (or, if every step of that track is done, the last one), since
 * that's "what's actually assigned right now" for a breakdown report.
 * Grouped by businessTrack (the step definition's fixed nominal track), not
 * the live `track` (whichever machine currently executes it) — otherwise a
 * step's group key would itself change identity the moment it's replaced,
 * making the resulting map impossible to look back up by its original
 * track (see isEligibleReplacementType in eventLabels.ts for why this
 * matters for Replace Machine specifically). */
function getCurrentMachineIdByTrack(steps: ActualEntry[]): Partial<Record<ActualEntry['track'], string>> {
  const result: Partial<Record<ActualEntry['track'], string>> = {};
  const tracks: ActualEntry['track'][] = ['RIG', 'CRANE', 'COMPRESSOR'];
  for (const track of tracks) {
    const trackSteps = steps
      .filter((s) => (s.businessTrack ?? s.track) === track)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    if (!trackSteps.length) continue;
    const notDone = trackSteps.find((s) => s.actualEnd === undefined);
    const chosen = notDone ?? trackSteps[trackSteps.length - 1];
    if (chosen.assignedMachineId) result[track] = chosen.assignedMachineId;
  }
  return result;
}

interface Props {
  group: PileGroup;
  machines: PilingMachine[];
  machineFloorIndex: MachineFloorIndex;
  /** Site-scoped contractor master list — backs the "Name of Pile
   * Contractor" / "Name of Cage Contractor" measurement fields. */
  contractors: PilContractor[];
  /** Caps actual start/finish entry to this checklist's own plan window
   * (planStartTime .. planEndTime + 1h grace) — null/missing fields mean no
   * plan generated yet, so no restriction is applied. */
  checklist: Pick<PilingDailyChecklist, 'planStartTime' | 'planEndTime'> | null;
  onClose: () => void;
  onSetActualTime: (
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    minutes: number,
    explicitDate?: Date,
  ) => Promise<void>;
  onClearActualTime: (stepId: string, field: 'actualStart' | 'actualEnd') => Promise<void>;
  onSaveRemarks: (stepId: string, text: string) => Promise<void>;
  onLogMachineEvent: (stepId: string, input: LogMachineEventInput) => Promise<void>;
  /** Upserts a partial patch of one-time engineering measurements for this
   * pile — see MeasurementFieldsModal.tsx / pileMeasurementTriggers.ts. */
  onSaveMeasurements: (patch: Partial<PileMeasurementFields>) => Promise<void>;
}

export default function PileStepsModal({
  group,
  machines,
  machineFloorIndex,
  contractors,
  checklist,
  onClose,
  onSetActualTime,
  onClearActualTime,
  onSaveRemarks,
  onLogMachineEvent,
  onSaveMeasurements,
}: Props) {
  const steps = [...group.steps].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const currentStepId = steps.find((s) => s.actualEnd === undefined)?.stepId;
  const allDone = !currentStepId;

  // Jumps to the current (needs-actuals) step's card the moment it reports
  // its layout — happens at most once per pile opened (re-armed below
  // whenever a different pile's group is shown), so re-renders from e.g.
  // ticking the clock or saving a time don't yank the scroll position back.
  // Not animated — the sheet's own slide-up is already the entrance motion;
  // a second animated scroll on top of that just reads as extra lag. Left
  // short of the card's exact top so the tail end of the previous (done)
  // step's card still peeks in above it, giving context instead of the
  // current card sitting flush at the very top edge. See AppModal's
  // forwarded ScrollView ref.
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledToCurrentRef = useRef(false);
  useEffect(() => {
    hasScrolledToCurrentRef.current = false;
  }, [group.checklistPileId]);
  const SCROLL_PEEK_OFFSET = 200;
  function handleStepCardLayout(stepId: string, y: number) {
    if (stepId !== currentStepId || hasScrolledToCurrentRef.current) return;
    hasScrolledToCurrentRef.current = true;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(y - SCROLL_PEEK_OFFSET, 0), animated: false });
    }, 50);
  }

  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    setContentReady(true);
  }, []);

  const [remarksFor, setRemarksFor] = useState<{
    stepId: string;
    stepName: string;
    remarks?: string;
  } | null>(null);
  const [measurementModal, setMeasurementModal] = useState<{
    title: string;
    fields: MeasurementFieldConfig[];
  } | null>(null);

  // Wraps onSetActualTime: once the actual start/end for this step is
  // recorded, checks whether that (stepName, field) pair is one of the five
  // measurement trigger points (see pileMeasurementTriggers.ts) and, if so,
  // opens the low-friction measurement popup right after — never a hard
  // gate on the time entry itself, which has already been saved by the time
  // this fires.
  const handleSetActualTime = async (
    step: ActualEntry,
    field: 'actualStart' | 'actualEnd',
    minutes: number,
    explicitDate?: Date,
  ) => {
    await onSetActualTime(step.stepId, field, minutes, explicitDate);
    const trigger = findMeasurementTrigger(step.stepName, field);
    if (trigger) setMeasurementModal({ title: trigger.title, fields: trigger.fields });
  };

  // "Edit measurements" on a step's own Measurements summary — covers every
  // field the step is responsible for (both its start and end triggers, if
  // any), not just whichever one most recently fired.
  const openStepMeasurements = (step: ActualEntry) => {
    const fields = getMeasurementFieldsForStep(step.stepName);
    if (fields.length === 0) return;
    setMeasurementModal({ title: `${step.stepName} Measurements`, fields });
  };
  const [machineEventFor, setMachineEventFor] = useState<{
    kind: 'down' | 'idle' | 'replace';
    stepId: string;
    stepName: string;
    track: ActualEntry['track'];
    initialEventType?: LogMachineEventInput['eventType'];
  } | null>(null);
  const [history, setHistory] = useState<PilMachineEvent[]>([]);

  useEffect(() => {
    if (!machineEventFor) return;
    let cancelled = false;
    getMachineEventsForChecklistPile(group.checklistPileId).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [machineEventFor, group.checklistPileId]);

  // Caps actual start/finish entry to this checklist's own plan window —
  // plan_start_time through plan_end_time + 1h grace. undefined (no
  // restriction) when the checklist has no plan yet.
  const planWindowMinIso = checklist?.planStartTime ?? undefined;
  const planWindowMaxIso = useMemo(
    () => (checklist?.planEndTime ? toLocalIsoString(addMinutes(new Date(checklist.planEndTime), 60)) : undefined),
    [checklist?.planEndTime],
  );

  const currentMachineIdByTrack = useMemo(() => getCurrentMachineIdByTrack(steps), [steps]);
  const currentStep = steps.find((s) => s.stepId === currentStepId);

  // Cross-pile "does this candidate time overlap another pile's already-recorded
  // busy interval on this step's assigned machine" checkers — see
  // src/utils/machineFloor.ts. `forStart`/`forFinish` each close over whichever
  // of this step's own bounds is currently fixed (undefined when filling for the
  // first time, the already-saved value when editing), so the same pair covers
  // both the first-time-fill controls (StepTimeControl) and the edit-existing-
  // value controls (EditTimeButton) for this step.
  const machineConflictChecksByStepId = useMemo(() => {
    const map = new Map<string, { forStart: (c: Date) => boolean; forFinish: (c: Date) => boolean }>();
    for (const step of steps) {
      if (!step.assignedMachineId) continue;
      const machineId = step.assignedMachineId;
      const ownStart = step.actualStartIso ? new Date(step.actualStartIso) : undefined;
      const ownEnd = step.actualEndIso ? new Date(step.actualEndIso) : undefined;
      map.set(step.stepId, {
        forStart: (candidate) =>
          hasMachineConflict(machineFloorIndex, machineId, group.checklistPileId, step.stepId, candidate, ownEnd),
        forFinish: (candidate) =>
          hasMachineConflict(
            machineFloorIndex,
            machineId,
            group.checklistPileId,
            step.stepId,
            ownStart ?? candidate,
            candidate,
          ),
      });
    }
    return map;
  }, [steps, machineFloorIndex, group.checklistPileId]);

  // Within-pile "does this candidate time overlap another step's already-
  // recorded interval on this same pile" checkers — the pile-sequence
  // counterpart to machineConflictChecksByStepId above, regardless of which
  // machine each step is assigned to. See src/utils/machineFloor.ts.
  const pileConflictChecksByStepId = useMemo(() => {
    const map = new Map<string, { forStart: (c: Date) => boolean; forFinish: (c: Date) => boolean }>();
    for (const step of steps) {
      const ownStart = step.actualStartIso ? new Date(step.actualStartIso) : undefined;
      const ownEnd = step.actualEndIso ? new Date(step.actualEndIso) : undefined;
      map.set(step.stepId, {
        forStart: (candidate) => hasPileStepConflict(steps, step.stepId, candidate, ownEnd),
        forFinish: (candidate) => hasPileStepConflict(steps, step.stepId, ownStart ?? candidate, candidate),
      });
    }
    return map;
  }, [steps]);

  const currentStepHasBreakdown =
    group.hasBreakdownWarning &&
    !!currentStep &&
    !!currentStep.assignedMachineId &&
    machines.find((m) => m.id === currentStep.assignedMachineId)?.status === 'BREAKDOWN';

  // Blocks the fill/edit time controls on the current step (see
  // StepTimeControl/EditTimeButton's `blocked` prop) without locking the
  // whole card — Replace Machine and the warning banner above must stay
  // reachable so the user has a way to resolve this.
  const breakdownBlockedNotice = currentStepHasBreakdown
    ? {
        title: `${machines.find((m) => m.id === currentStep!.assignedMachineId)?.machineNo ?? 'Machine'} is down`,
        message: 'Replace the machine or mark it resumed to continue.',
      }
    : undefined;

  const currentStepBlockedByIdle =
    group.isBlockedByIdle &&
    !!currentStep &&
    !!currentStep.assignedMachineId &&
    machines.find((m) => m.id === currentStep.assignedMachineId)?.status === 'IDLE';

  const subtitle = [
    group.rigs.length > 0 && `Rig ${group.rigs.join(', ')}`,
    group.cranes.length > 0 && `Crane ${group.cranes.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <AppModal
      ref={scrollRef}
      visible
      title={group.pileCode}
      subtitle={subtitle || undefined}
      onClose={onClose}
      avoidKeyboard={false}
    >
      {!contentReady ? (
        <View style={modalStyles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
      <>
      {currentStepHasBreakdown && currentStep && (
        <Pressable
          style={modalStyles.warningBanner}
          onPress={() =>
            setMachineEventFor({
              kind: 'down',
              stepId: currentStep.stepId,
              stepName: currentStep.stepName,
              track: currentStep.businessTrack ?? currentStep.track,
            })
          }
        >
          <AlertTriangle size={16} color={colors.danger} />
          <Text style={modalStyles.warningBannerText}>
            Machine reported down — tap to resolve
          </Text>
        </Pressable>
      )}

      {currentStepBlockedByIdle && currentStep && (
        <Pressable
          style={modalStyles.idleBanner}
          onPress={() =>
            setMachineEventFor({
              kind: 'idle',
              stepId: currentStep.stepId,
              stepName: currentStep.stepName,
              track: currentStep.businessTrack ?? currentStep.track,
              initialEventType: 'IDLE_END',
            })
          }
        >
          <Coffee size={16} color={colors.warning} />
          <Text style={modalStyles.idleBannerText}>Machine idle — tap to end idle</Text>
        </Pressable>
      )}

      {steps.map((step, idx) => {
        const prevStep = idx > 0 ? steps[idx - 1] : undefined;
        const nextStep = idx < steps.length - 1 ? steps[idx + 1] : undefined;
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent = step.stepId === currentStepId;
        const isLocked = !isDone && !isCurrent;
        const isBlockedByIdle = isCurrent && !!currentStepBlockedByIdle;
        const isHistorical = !!step.isHistorical;
        const lateMinutes =
          isDone && step.plannedEndIso != null
            ? durationMinutes(step.actualStartIso!, step.actualEndIso!) -
              durationMinutes(step.plannedStartIso!, step.plannedEndIso!)
            : null;
        const isLate = lateMinutes != null && lateMinutes > 0;

        return (
          <View
            key={`${isHistorical ? 'hist' : 'cur'}-${step.stepId}`}
            onLayout={(e) => handleStepCardLayout(step.stepId, e.nativeEvent.layout.y)}
            style={[modalStyles.card, (isLocked || isBlockedByIdle || isHistorical) && modalStyles.cardLocked]}
          >
            <View style={modalStyles.headerRow}>
              <View style={modalStyles.headerLeft}>
                {isDone ? (
                  <CheckCircle2 size={20} color={colors.success} />
                ) : (
                  <Circle size={20} color={isCurrent ? colors.accent : colors.textSecondary} />
                )}
                <Text style={modalStyles.stepName}>{step.stepName}</Text>
                <View
                  style={[
                    modalStyles.trackBadge,
                    { backgroundColor: getTrackBadgeColors(step.track).bg },
                  ]}
                >
                  <Text
                    style={[
                      modalStyles.trackTag,
                      { color: getTrackBadgeColors(step.track).fg },
                    ]}
                  >
                    {`${step.track}${step.assignedMachineNo ? ` (${step.assignedMachineNo})` : ''}`}
                  </Text>
                </View>
              </View>

              {(isStarted || isDone || isCurrent) && !isHistorical && !isLocked && (
                <View style={modalStyles.headerActions}>
                  <Pressable
                    style={modalStyles.iconBtn}
                    hitSlop={8}
                    accessibilityLabel={step.remarks ? 'Edit remarks' : 'Add remarks'}
                    onPress={() =>
                      setRemarksFor({ stepId: step.stepId, stepName: step.stepName, remarks: step.remarks })
                    }
                  >
                    <MessageSquarePlus size={16} color={colors.accent} />
                  </Pressable>
                  <Pressable
                    style={modalStyles.iconBtn}
                    hitSlop={8}
                    accessibilityLabel="Replace machine"
                    onPress={() =>
                      setMachineEventFor({
                        kind: 'replace',
                        stepId: step.stepId,
                        stepName: step.stepName,
                        track: step.businessTrack ?? step.track,
                      })
                    }
                  >
                    <ArrowLeftRight size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              )}
            </View>

            <View style={modalStyles.divider} />

            <View style={modalStyles.planBlock}>
              <Text style={modalStyles.planLabel}>
                Plan
                {step.plannedEndIso != null && ` · ${formatDuration(step.plannedStartIso!, step.plannedEndIso)}`}
              </Text>
              <View style={modalStyles.planTimeRow}>
                <Text style={modalStyles.planTimeText}>{formatTimeWithDay(step.plannedStartIso!)}</Text>
                <ArrowRight size={15} color={colors.textSecondary} />
                <Text style={modalStyles.planTimeText}>
                  {step.plannedEndIso == null ? 'To be continued' : formatTimeWithDay(step.plannedEndIso)}
                </Text>
              </View>
              {step.planBreaks?.map((brk, i) => (
                <Text key={i} style={modalStyles.planBreakText}>
                  Includes {brk.label} · {formatTime(brk.start)} – {formatTime(brk.end)}
                </Text>
              ))}
            </View>

            {isDone && (
              <>
                <View style={modalStyles.divider} />
                <View style={modalStyles.actualHeaderRow}>
                  <Text style={modalStyles.actualLabel}>
                    ACTUAL · {formatDuration(step.actualStartIso!, step.actualEndIso!).toUpperCase()}
                  </Text>
                  <View style={modalStyles.delayGroup}>
                    <Text style={modalStyles.delayLabel}>Activity delay</Text>
                    <View
                      style={[
                        modalStyles.statusPill,
                        { backgroundColor: isLate ? colors.dangerSoft : colors.successSoft },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.statusPillText,
                          { color: isLate ? colors.danger : colors.success },
                        ]}
                      >
                        {isLate ? `+${lateMinutes}m delay` : 'On time'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={modalStyles.fieldRow}>
                  <Text style={modalStyles.fieldLabel}>Start</Text>
                  <Text style={modalStyles.fieldValue}>{formatTimeWithDay(step.actualStartIso)}</Text>
                  {!isHistorical && (
                    <View style={modalStyles.fieldActions}>
                      <EditTimeButton
                        minutes={step.actualStart!}
                        label="start time"
                        minBoundIso={prevStep?.actualEndIso}
                        maxBoundIso={step.actualEndIso}
                        planWindowMinIso={planWindowMinIso}
                        planWindowMaxIso={planWindowMaxIso}
                        machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                        pileConflictCheck={pileConflictChecksByStepId.get(step.stepId)?.forStart}
                        onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualStart', mins, explicitDate)}
                        anchorIso={step.startAnchorIso}
                      />
                      <DeleteTimeButton
                        label="start time"
                        cascadeWarning="This will also clear the finish time."
                        onConfirm={() => onClearActualTime(step.stepId, 'actualStart')}
                      />
                    </View>
                  )}
                </View>

                <View style={modalStyles.fieldRow}>
                  <Text style={modalStyles.fieldLabel}>End</Text>
                  <Text style={[modalStyles.fieldValue, isLate && modalStyles.lateText]}>
                    {formatTimeWithDay(step.actualEndIso)}
                  </Text>
                  {!isHistorical && (
                    <View style={modalStyles.fieldActions}>
                      <EditTimeButton
                        minutes={step.actualEnd!}
                        label="finish time"
                        minBoundIso={step.actualStartIso}
                        maxBoundIso={nextStep?.actualStartIso}
                        planWindowMinIso={planWindowMinIso}
                        planWindowMaxIso={planWindowMaxIso}
                        machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forFinish}
                        pileConflictCheck={pileConflictChecksByStepId.get(step.stepId)?.forFinish}
                        onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualEnd', mins, explicitDate)}
                        anchorIso={step.endAnchorIso}
                      />
                      <DeleteTimeButton
                        label="finish time"
                        onConfirm={() => onClearActualTime(step.stepId, 'actualEnd')}
                      />
                    </View>
                  )}
                </View>
              </>
            )}

            {isCurrent && isStarted && !isDone && !isBlockedByIdle && (
              <View style={modalStyles.fieldRow}>
                <Text style={modalStyles.fieldLabel}>Start</Text>
                <Text style={modalStyles.fieldValue}>{formatTimeWithDay(step.actualStartIso)}</Text>
                <View style={modalStyles.fieldActions}>
                  <EditTimeButton
                    minutes={step.actualStart!}
                    label="start time"
                    minBoundIso={prevStep?.actualEndIso}
                    maxBoundIso={step.actualEndIso}
                    planWindowMinIso={planWindowMinIso}
                    planWindowMaxIso={planWindowMaxIso}
                    machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                    pileConflictCheck={pileConflictChecksByStepId.get(step.stepId)?.forStart}
                    onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualStart', mins, explicitDate)}
                    anchorIso={step.startAnchorIso}
                    blocked={breakdownBlockedNotice}
                  />
                  <DeleteTimeButton
                    label="start time"
                    onConfirm={() => onClearActualTime(step.stepId, 'actualStart')}
                  />
                </View>
              </View>
            )}

            {step.remarks && (isStarted || isDone) && (
              <View style={modalStyles.remarkBox}>
                <MessageSquarePlus size={14} color={colors.textSecondary} style={modalStyles.remarkIcon} />
                <Text style={modalStyles.remarkText}>
                  {step.remarks}{' '}
                  {!isHistorical && (
                    <Text
                      style={modalStyles.remarkEdit}
                      onPress={() =>
                        setRemarksFor({ stepId: step.stepId, stepName: step.stepName, remarks: step.remarks })
                      }
                    >
                      Edit
                    </Text>
                  )}
                </Text>
              </View>
            )}

            {(isStarted || isDone) && !isLocked && (() => {
              const applicableFields = getMeasurementFieldsForStep(step.stepName);
              if (applicableFields.length === 0) return null;
              const measurements = group.measurements;
              const filledCount = applicableFields.filter((f) => measurements?.[f.key] != null).length;
              return (
                <>
                  <View style={modalStyles.divider} />
                  <View style={modalStyles.actualHeaderRow}>
                    <Text style={modalStyles.actualLabel}>MEASUREMENTS</Text>
                    <View style={[modalStyles.statusPill, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[modalStyles.statusPillText, { color: colors.accent }]}>
                        {filledCount}/{applicableFields.length} filled
                      </Text>
                    </View>
                  </View>
                  <View style={modalStyles.measurementsGrid}>
                    {applicableFields.map((field) => {
                      const value = measurements?.[field.key];
                      const display =
                        field.type === 'contractor'
                          ? contractors.find((c) => c.id === value)?.name ?? '-'
                          : value == null
                            ? '-'
                            : `${value} ${field.unit}`;
                      // Strip a trailing "(Full Name)" gloss for the compact
                      // grid — e.g. "E.G.L. (Existing Ground Level)" -> "E.G.L."
                      const shortLabel = field.label.replace(/\s*\([^)]*\)\s*$/, '');
                      return (
                        <View key={field.key} style={modalStyles.measurementCell}>
                          <Text style={modalStyles.measurementLabel}>{shortLabel}</Text>
                          <Text
                            style={[
                              modalStyles.measurementValue,
                              value == null && modalStyles.measurementValueEmpty,
                            ]}
                          >
                            {display}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  {!isHistorical && (
                    <Pressable
                      style={modalStyles.editMeasurementsBtn}
                      onPress={() => openStepMeasurements(step)}
                    >
                      <PencilLine size={14} color={colors.accent} />
                      <Text style={modalStyles.editMeasurementsBtnText}>Edit measurements</Text>
                    </Pressable>
                  )}
                </>
              );
            })()}

            {isCurrent && !isStarted && !isBlockedByIdle && (
              <StepTimeControl
                mode="start"
                defaultMinutes={prevStep?.actualEnd ?? step.plannedStart}
                onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualStart', mins, explicitDate)}
                machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                pileConflictCheck={pileConflictChecksByStepId.get(step.stepId)?.forStart}
                minBoundIso={prevStep?.actualEndIso}
                planWindowMinIso={planWindowMinIso}
                planWindowMaxIso={planWindowMaxIso}
                anchorIso={step.startAnchorIso}
                blocked={breakdownBlockedNotice}
              />
            )}

            {isCurrent && isStarted && !isDone && !isBlockedByIdle && (
              <StepTimeControl
                mode="finish"
                defaultMinutes={
                  step.plannedEnd != null && step.plannedEnd > step.actualStart!
                    ? step.plannedEnd
                    : nowMinutes()
                }
                onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualEnd', mins, explicitDate)}
                machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forFinish}
                pileConflictCheck={pileConflictChecksByStepId.get(step.stepId)?.forFinish}
                minBoundIso={step.actualStartIso}
                planWindowMinIso={planWindowMinIso}
                planWindowMaxIso={planWindowMaxIso}
                anchorIso={step.endAnchorIso}
                blocked={breakdownBlockedNotice}
              />
            )}

            {isLocked && (
              <Text style={modalStyles.lockedText}>Waiting on previous step</Text>
            )}

            {isBlockedByIdle && (
              <Text style={modalStyles.lockedText}>Machine idle — end idle to continue</Text>
            )}
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
      </>
      )}

      {remarksFor && (
        <RemarksModal
          visible
          stepName={remarksFor.stepName}
          initialValue={remarksFor.remarks}
          onClose={() => setRemarksFor(null)}
          onSave={(text) => onSaveRemarks(remarksFor.stepId, text)}
        />
      )}

      {measurementModal && (
        <MeasurementFieldsModal
          visible
          title={measurementModal.title}
          fields={measurementModal.fields}
          initialValues={group.measurements}
          contractors={contractors}
          onClose={() => setMeasurementModal(null)}
          onSave={onSaveMeasurements}
        />
      )}

      {machineEventFor?.kind === 'down' && (
        <MachineDownModal
          visible
          pileCode={group.pileCode}
          stepName={machineEventFor.stepName}
          defaultTrack={machineEventFor.track}
          initialEventType={machineEventFor.initialEventType as 'BREAKDOWN' | 'RESUMED' | undefined}
          machines={machines}
          currentMachineIdByTrack={currentMachineIdByTrack}
          history={history}
          onClose={() => setMachineEventFor(null)}
          onLogMachineEvent={(input) => onLogMachineEvent(machineEventFor.stepId, input)}
        />
      )}

      {machineEventFor?.kind === 'idle' && (
        <MachineIdleModal
          visible
          pileCode={group.pileCode}
          stepName={machineEventFor.stepName}
          defaultTrack={machineEventFor.track}
          initialEventType={machineEventFor.initialEventType as 'IDLE_START' | 'IDLE_END' | undefined}
          machines={machines}
          currentMachineIdByTrack={currentMachineIdByTrack}
          history={history}
          onClose={() => setMachineEventFor(null)}
          onLogMachineEvent={(input) => onLogMachineEvent(machineEventFor.stepId, input)}
        />
      )}

      {machineEventFor?.kind === 'replace' && (
        <MachineReplaceModal
          visible
          pileCode={group.pileCode}
          stepName={machineEventFor.stepName}
          defaultTrack={machineEventFor.track}
          machines={machines}
          currentMachineIdByTrack={currentMachineIdByTrack}
          history={history}
          onClose={() => setMachineEventFor(null)}
          onLogMachineEvent={(input) => onLogMachineEvent(machineEventFor.stepId, input)}
        />
      )}
    </AppModal>
  );
}

const modalStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  cardLocked: { opacity: 0.5 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  stepName: { ...typography.cardTitle, color: colors.textPrimary },
  trackBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  trackTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  planBlock: {
    marginBottom: spacing.sm,
  },
  planLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  planTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 4,
    gap: spacing.sm,
  },
  planTimeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  planBreakText: {
    fontSize: 12,
    fontWeight: '400',
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginTop: 3,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  actualHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actualLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  delayGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  delayLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 40,
  },
  fieldValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lateText: {
    color: colors.danger,
  },
  remarkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(20,20,31,0.04)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  remarkIcon: { marginTop: 2 },
  remarkText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  remarkEdit: {
    color: colors.accent,
    fontWeight: '700',
  },
  lockedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  measurementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    marginHorizontal: -spacing.xs,
  },
  measurementCell: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  measurementLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  measurementValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  measurementValueEmpty: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  editMeasurementsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    ...shadow.soft,
  },
  editMeasurementsBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.accent,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  allDoneWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  allDoneText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
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
  idleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  idleBannerText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
    flex: 1,
  },
});
