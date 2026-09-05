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
  Link2,
  CirclePlay,
  CircleStop,
  Info,
  Hourglass,
  Clock,
  Ruler,
} from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
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
  formatDurationMinutes,
  durationMinutes,
} from '@utils/formatTime';
import { computeExpectedStepStart, type MachineFloorIndex } from '@utils/machineFloor';
import { type ConflictNotice } from '@utils/timeValidation';
import { buildActualTimeRules } from '@utils/actualTimeRules';
import { getTrackBadgeColors } from '@utils/helpers';
import { notify } from '@utils/notify';

/** Signed duration for a delay chip — e.g. 460 → "+7h 40m", -10 → "-10m", 0 → "On time". */
function formatSignedDuration(minutes: number): string {
  if (minutes === 0) return 'On time';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatDurationMinutes(Math.abs(minutes))}`;
}

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
  contractors: PilContractor[];
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
  // Memoised on group.steps (itself stable — usePileGroups builds it in a
  // useMemo). Without this the sort produces a new array identity every
  // render, which silently defeats every downstream useMemo keyed on `steps`
  // — currentMachineIdByTrack, the two conflict-check maps, and
  // expectedStartByStepId were all recomputing on each render.
  const steps = useMemo(
    () => [...group.steps].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [group.steps],
  );
  // "Current" is now a purely VISUAL hint — the accent circle and the
  // auto-scroll target. It no longer gates which step's CARD renders a fill
  // control: a pile's plan can cover only part of its applicable steps (see
  // usePileGroups), so a later unplanned step would otherwise stay hidden
  // behind a step nobody is going to fill. Every not-yet-completed step
  // renders one, but starting it is still gated on every earlier step being
  // done first (see earliestIncompletePredecessor below) — a pile's steps
  // are one physical sequence regardless of what got planned. Once a step is
  // allowed to start, the time bounds (see buildActualTimeRules) constrain
  // which moment it lands on.
  const currentStepId = steps.find((s) => s.actualEnd === undefined)?.stepId;
  const allDone = !currentStepId;

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

  // Every bound, conflict check, and picker seed for this pile's time entry —
  // assembled once here instead of spelled out at each of the four call
  // sites. See utils/actualTimeRules.ts for why it's a plain builder rather
  // than a hook.
  const rules = useMemo(
    () =>
      buildActualTimeRules({
        steps,
        checklistPileId: group.checklistPileId,
        pileCode: group.pileCode,
        machineFloorIndex,
        planWindowMinIso: checklist?.planStartTime ?? undefined,
        planWindowMaxIso: checklist?.planEndTime ?? undefined,
      }),
    [steps, group.checklistPileId, group.pileCode, machineFloorIndex, checklist?.planStartTime, checklist?.planEndTime],
  );

  const currentMachineIdByTrack = useMemo(() => getCurrentMachineIdByTrack(steps), [steps]);
  const currentStep = steps.find((s) => s.stepId === currentStepId);

  // "Expected start" per step — see DELAY_CALCULATIONS.md's Start Delay
  // chain: that step's own assigned machine's most recent real completion
  // at or before this step's own actual start (across the whole checklist,
  // not just this pile), plus this step's own buffer; falls back to this
  // step's own planned start when the machine has no such prior completion.
  // Only computed once a step has an actualStart — Start Delay is undefined
  // before that.
  const expectedStartByStepId = useMemo(() => {
    const map = new Map<string, NonNullable<ReturnType<typeof computeExpectedStepStart>>>();
    for (const step of steps) {
      if (!step.actualStartIso) continue;
      const expected = computeExpectedStepStart(
        machineFloorIndex,
        step.assignedMachineId,
        group.checklistPileId,
        step.stepId,
        step.actualStartIso,
        // May be absent for an unplanned step — computeExpectedStepStart then
        // returns null unless the machine has a real earlier completion to
        // chain off, and nothing is fabricated either way.
        step.plannedStartIso,
        step.bufferMinutes,
      );
      if (expected) map.set(step.stepId, expected);
    }
    return map;
  }, [steps, machineFloorIndex, group.checklistPileId]);

  /**
   * The nearest step before this one (by sequence order, across the whole
   * pile regardless of track) that hasn't been completed yet — historical
   * rows never count, since they're carry-over steps that are always already
   * finished. `undefined` once every earlier step has an actualEnd.
   *
   * This is what actually stops BORING from being started before CASING is
   * done. actualTimeRules.ts's latestEarlierEnd only bounds WHEN a step's
   * start may land once starting it is allowed — when no earlier step has
   * finished yet, there's nothing recorded to bound against, so that alone
   * would let the picker accept any time at all.
   *
   * Used directly at the render site to HIDE the "Fill start time" control
   * altogether (with an inline caption naming what's blocking it) rather than
   * showing a disabled button or a tap-to-toast — unlike the machine
   * breakdown/idle block below, there is nothing to resolve by interacting
   * with this step's own card, so a live control here would just invite a
   * wasted tap.
   */
  function earliestIncompletePredecessor(step: ActualEntry): ActualEntry | undefined {
    return steps.find(
      (other) => !other.isHistorical && other.sequenceOrder < step.sequenceOrder && other.actualEnd === undefined,
    );
  }

  /**
   * Why time entry is blocked for ONE step right now, or undefined — covers
   * breakdown and idle (see StepTimeControl/EditTimeButton's `blocked` prop):
   * the fill/edit buttons still render and stay tappable, tapping one just
   * surfaces this via notify.error instead of opening the picker. Never locks
   * the whole card — Replace Machine / the banners above must stay reachable
   * so the user has a way to resolve it either way.
   *
   * Deliberately does NOT cover an incomplete previous step — see
   * earliestIncompletePredecessor above, which hides the control instead of
   * leaving it tappable.
   *
   * Resolved per step from that step's OWN assigned machine, not from the
   * pile's single "current" step: now that every unfinished step is fillable,
   * keying the block on the current step alone would let an idle machine's
   * later steps be filled straight past the block (and would pin the block to
   * the wrong step whenever the pile's current step sits on a different
   * machine). group.hasBreakdownWarning / group.isBlockedByIdle keep their
   * current-step meaning for the pile-level banners and card badges.
   */
  function blockedNoticeForStep(step: ActualEntry): ConflictNotice | undefined {
    if (step.isHistorical) return undefined;
    if (!step.assignedMachineId) return undefined;
    const machine = machines.find((m) => m.id === step.assignedMachineId);
    if (machine?.status === 'BREAKDOWN') {
      return {
        title: `${machine.machineNo ?? 'Machine'} is down`,
        message: 'Replace the machine or mark it resumed to continue.',
      };
    }
    if (machine?.status === 'IDLE') {
      return {
        title: `${machine.machineNo ?? 'Machine'} is idle`,
        message: 'End the idle session to continue.',
      };
    }
    return undefined;
  }

  const currentStepHasBreakdown =
    group.hasBreakdownWarning &&
    !!currentStep &&
    !!currentStep.assignedMachineId &&
    machines.find((m) => m.id === currentStep.assignedMachineId)?.status === 'BREAKDOWN';

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
      showCloseButton={false}
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

      {steps.map((step) => {
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent = step.stepId === currentStepId;
        const isHistorical = !!step.isHistorical;
        // A step the plan never covered has no planned span, so it can be
        // neither on time nor late — there is nothing to be late against.
        const isPlanned = step.plannedStartIso != null;
        const lateMinutes =
          isDone && isPlanned && step.plannedEndIso != null
            ? durationMinutes(step.actualStartIso!, step.actualEndIso!) -
              durationMinutes(step.plannedStartIso!, step.plannedEndIso)
            : null;
        const isLate = lateMinutes != null && lateMinutes > 0;
        const blockedNotice = blockedNoticeForStep(step);
        // Only meaningful for a not-yet-started step — once isStarted, the
        // ordering constraint was already satisfied when it first began.
        const blockingPredecessor = isStarted ? undefined : earliestIncompletePredecessor(step);

        return (
          <View
            key={`${isHistorical ? 'hist' : 'cur'}-${step.stepId}`}
            onLayout={(e) => handleStepCardLayout(step.stepId, e.nativeEvent.layout.y)}
            style={[modalStyles.stepWrap, isHistorical && modalStyles.cardLocked]}
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

              {(isStarted || isDone || isCurrent) && !isHistorical && (
                <View style={modalStyles.headerActions}>
                  <Button
                    label="Remarks"
                    icon={MessageSquarePlus}
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      setRemarksFor({ stepId: step.stepId, stepName: step.stepName, remarks: step.remarks })
                    }
                  />
                  <Button
                    icon={ArrowLeftRight}
                    variant="secondary"
                    size="md"
                    iconColor={colors.textSecondary}
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
                  />
                </View>
              )}
            </View>

            <View style={[modalStyles.planCard, isHistorical && modalStyles.planCardLocked]}>
              <Text style={modalStyles.planLabel}>
                Plan
              </Text>
              {/* No plan row at all — the scheduler ran out of window before
                  reaching this step, so it has no planned times and never
                  will. The template duration is shown as a clearly non-binding
                  reference (nothing validates against it), never as a plan. */}
              {!isPlanned ? (
                <View style={modalStyles.planTimeRow}>
                  <Text style={modalStyles.planTimeText}>Planned Later</Text>
                   {step.templateMinutes != null && (
                      <Text style={modalStyles.planReferenceText}>
                        · Avg. {formatDurationMinutes(step.templateMinutes)}
                      </Text>
                    )}
                </View>
              ) : (
              <View style={modalStyles.planTimeRow}>
                <Text style={modalStyles.planTimeText}>{formatTimeWithDay(step.plannedStartIso)}</Text>
                <ArrowRight size={15} color={colors.textSecondary} />
                <Text style={modalStyles.planTimeText}>
                  {step.plannedEndIso == null ? 'To be continued' : formatTimeWithDay(step.plannedEndIso)}
                </Text>
              </View>
              )}
              {step.planBreaks?.map((brk, i) => (
                <Text key={i} style={modalStyles.planBreakText}>
                  Includes {brk.label} · {formatTime(brk.start)} – {formatTime(brk.end)}
                </Text>
              ))}
            </View>

            {/* isStarted, not "isCurrent && isStarted": any started step shows
                its actuals now that any step can be started. */}
            {(isDone || isStarted) && (() => {
              const expectedStart = expectedStartByStepId.get(step.stepId);
              const startDelayMinutes = expectedStart
                ? durationMinutes(expectedStart.expectedStartIso, step.actualStartIso!)
                : null;
              return (
                <>
                  <View style={modalStyles.actualSection}>
                  <View style={modalStyles.actualHeaderTopRow}>
                    <View style={modalStyles.actualHeaderLeft}>
                      <Clock size={15} color={colors.accentBlue} />
                      <Text style={modalStyles.actualLabelBlue}>ACTUAL</Text>
                    </View>
                    {startDelayMinutes != null && (
                      <View style={modalStyles.delayGroup}>
                        <Text style={modalStyles.delayLabel}>Start delay</Text>
                        <View
                          style={[
                            modalStyles.statusPill,
                            { backgroundColor: startDelayMinutes > 0 ? colors.dangerSoft : colors.successSoft },
                          ]}
                        >
                          <Text
                            style={[
                              modalStyles.statusPillText,
                              { color: startDelayMinutes > 0 ? colors.danger : colors.success },
                            ]}
                          >
                            {formatSignedDuration(startDelayMinutes)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={modalStyles.actualCard}>
                    <View style={modalStyles.actualRow}>
                      <View style={modalStyles.actualRowTop}>
                        <View style={modalStyles.iconChip}>
                          <Link2 size={14} color={colors.accentBlue} />
                        </View>
                        <View style={modalStyles.actualRowText}>
                          <Text style={[modalStyles.actualRowLabel, modalStyles.actualRowLabelFaded]} numberOfLines={1}>Expected start</Text>
                          <Text style={modalStyles.actualRowSubtitle}>
                            {expectedStart?.anchorPileCode
                              ? `${expectedStart.anchorPileCode} - ${expectedStart.anchorStepName} ended`
                              : isPlanned
                                ? 'Planned start'
                                : 'Planned Later'}
                          </Text>
                        </View>
                      </View>
                      <View style={modalStyles.actualRowBottom}>
                        <Text style={[modalStyles.actualRowValue, modalStyles.actualRowValueFaded]}>
                          {formatTimeWithDay(expectedStart?.expectedStartIso)}
                        </Text>
                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            notify.info(
                              startDelayMinutes == null
                                ? 'No expected start available for this step.'
                                : startDelayMinutes === 0
                                  ? 'Started right on the expected time.'
                                  : startDelayMinutes > 0
                                    ? `Started ${startDelayMinutes}m later than expected.`
                                    : `Started ${Math.abs(startDelayMinutes)}m earlier than expected.`,
                            )
                          }
                        >
                          <Info size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={modalStyles.actualRow}>
                      <View style={modalStyles.actualRowTop}>
                        <View style={modalStyles.iconChip}>
                          <CirclePlay size={14} color={colors.accentBlue} />
                        </View>
                        <View style={modalStyles.actualRowText}>
                          <Text style={modalStyles.actualRowLabel} numberOfLines={1}>Actual start</Text>
                        </View>
                      </View>
                      <View style={modalStyles.actualRowBottom}>
                        <Text style={modalStyles.actualRowValue}>{formatTimeWithDay(step.actualStartIso)}</Text>
                        {!isHistorical && (
                          <View style={modalStyles.fieldActions}>
                            <EditTimeButton
                              {...rules.forStep(step.stepId, 'start')}
                              minutes={step.actualStart!}
                              label="start time"
                              onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualStart', mins, explicitDate)}
                              blocked={!isDone ? blockedNotice : undefined}
                            />
                            <DeleteTimeButton
                              label="start time"
                              valueLabel={formatTimeWithDay(step.actualStartIso)}
                              cascadeWarning={isDone ? 'This will also clear the finish time.' : undefined}
                              onConfirm={() => onClearActualTime(step.stepId, 'actualStart')}
                            />
                          </View>
                        )}
                      </View>
                    </View>

                    {isDone && (
                      <View style={modalStyles.actualRow}>
                        <View style={modalStyles.actualRowTop}>
                          <View style={modalStyles.iconChip}>
                            <CircleStop size={14} color={colors.accentBlue} />
                          </View>
                          <View style={modalStyles.actualRowText}>
                            <Text style={modalStyles.actualRowLabel} numberOfLines={1}>Actual end</Text>
                          </View>
                        </View>
                        <View style={modalStyles.actualRowBottom}>
                          <Text style={[modalStyles.actualRowValue, isLate && modalStyles.lateText]}>
                            {formatTimeWithDay(step.actualEndIso)}
                          </Text>
                          {!isHistorical && (
                            <View style={modalStyles.fieldActions}>
                              <EditTimeButton
                                {...rules.forStep(step.stepId, 'finish')}
                                minutes={step.actualEnd!}
                                label="finish time"
                                onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualEnd', mins, explicitDate)}
                              />
                              <DeleteTimeButton
                                label="finish time"
                                valueLabel={formatTimeWithDay(step.actualEndIso)}
                                onConfirm={() => onClearActualTime(step.stepId, 'actualEnd')}
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Rendered for any finished step, planned or not — the
                      actual duration is real either way. Only the two
                      plan-relative columns degrade: an unplanned step has no
                      planned span to average against and therefore no
                      lateness, so no delay pill is shown for it. */}
                  {isDone && (
                    <View style={modalStyles.statsRow}>
                      <View style={modalStyles.statsCol}>
                        <Clock size={14} color={colors.textSecondary} />
                        <Text style={modalStyles.statsColLabel}>Avg. duration</Text>
                        <Text style={modalStyles.statsColValue}>
                          {isPlanned && step.plannedEndIso != null
                            ? formatDuration(step.plannedStartIso!, step.plannedEndIso)
                            : 'Planned Later'}
                        </Text>
                      </View>
                      <View style={[modalStyles.statsCol, modalStyles.statsColRuled]}>
                        <Clock size={14} color={colors.textSecondary} />
                        <Text style={modalStyles.statsColLabel}>Actual duration</Text>
                        <Text style={modalStyles.statsColValue}>
                          {formatDuration(step.actualStartIso!, step.actualEndIso!)}
                        </Text>
                      </View>
                      <View style={[modalStyles.statsCol, modalStyles.statsColRuled]}>
                        <Hourglass
                          size={14}
                          color={lateMinutes == null ? colors.textSecondary : isLate ? colors.danger : colors.success}
                        />
                        <Text style={modalStyles.statsColLabel}>Activity delay</Text>
                        {lateMinutes == null ? (
                          <Text style={modalStyles.statsColValue}>—</Text>
                        ) : (
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
                              {formatSignedDuration(lateMinutes)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {(isStarted || isDone) && (() => {
                    const applicableFields = getMeasurementFieldsForStep(step.stepName);
                    if (applicableFields.length === 0) return null;
                    const measurements = group.measurements;
                    const filledCount = applicableFields.filter((f) => measurements?.[f.key] != null).length;
                    return (
                      <View style={modalStyles.actualCard}>
                        <View style={modalStyles.actualHeaderRow}>
                          <View style={modalStyles.measurementsLabelRow}>
                            <Ruler size={14} color={colors.textSecondary} />
                            <Text style={modalStyles.actualLabel}>MEASUREMENTS</Text>
                          </View>
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
                          <Button
                            label="Edit measurements"
                            icon={PencilLine}
                            variant="secondary"
                            onPress={() => openStepMeasurements(step)}
                          />
                        )}
                      </View>
                    );
                  })()}
                  </View>
                </>
              );
            })()}

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

            {/* Any not-yet-completed step is fillable — not just the pile's
                first unfinished one, so an unplanned step later in the
                sequence isn't stuck waiting behind a step nobody is going to
                fill. But it can only actually be STARTED once every earlier
                step is done — a pile's steps are one physical sequence, so
                BORING cannot begin before CASING is finished regardless of
                whether either was planned. While blockingPredecessor is set,
                the "Fill start time" control is hidden entirely rather than
                shown disabled or tappable-with-a-toast: there is nothing to
                resolve from THIS card, so a live control would just invite a
                wasted tap. Once a step IS allowed to start, the time bounds
                from its rules (latest earlier actual end / earliest later
                actual start) constrain which moment it lands on. */}
            {!isHistorical && !isStarted && !blockingPredecessor && (
              <StepTimeControl
                {...rules.forStep(step.stepId, 'start')}
                mode="start"
                onConfirm={(mins, explicitDate) =>
                  handleSetActualTime(step, 'actualStart', mins, explicitDate)
                }
                blocked={blockedNotice}
              />
            )}

            {!isHistorical && isStarted && !isDone && (
              <StepTimeControl
                {...rules.forStep(step.stepId, 'finish')}
                mode="finish"
                onConfirm={(mins, explicitDate) => handleSetActualTime(step, 'actualEnd', mins, explicitDate)}
                blocked={blockedNotice}
              />
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
  stepWrap: {
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
    marginBottom: spacing.sm,
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
  planCard: {
    backgroundColor: colors.fade,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planCardLocked: {
    backgroundColor: colors.glassFillStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 2,
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
    color: colors.textSecondary,
  },
  planReferenceText: {
    fontSize: 13,
    fontWeight: '400',
    fontStyle: 'italic',
    color: colors.textSecondary,
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
  actualSection: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentBlue,
  },
  actualHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actualHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actualLabelBlue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.accentBlue,
  },
  actualCard: {
    backgroundColor: colors.transparent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  actualRow: {
    gap: spacing.xs,
  },
  actualRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actualRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actualRowText: { flex: 1 },
  actualRowLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  actualRowLabelFaded: { color: colors.textSecondary },
  actualRowSubtitle: { ...typography.smallTxt, color: colors.textSecondary, marginTop: 2 },
  actualRowValue: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  actualRowValueFaded: { color: colors.textSecondary },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statsColRuled: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statsColLabel: { ...typography.smallTxt, color: colors.textSecondary },
  statsColValue: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  measurementsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
