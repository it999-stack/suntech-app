// src/components/plan/actual/PileStepsModal.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  MoreHorizontal,
  AlertTriangle,
  MessageSquarePlus,
  Coffee,
} from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import StepTimeControl from '@components/plan/actual/StepTimeControl';
import EditTimeButton from '@components/plan/actual/EditTimeButton';
import DeleteTimeButton from '@components/plan/actual/DeleteTimeButton';
import RemarksModal from '@components/plan/actual/RemarksModal';
import MachineEventsModal from '@components/plan/actual/MachineEventsModal';
import { getMachineEventsForChecklistPile } from '@repositories/machineEventsRepository';
import type { PilingMachine, PilMachineEvent } from '@db/schema';
import type { ActualEntry, PileGroup } from '@app-types/plan';
import type { LogMachineEventInput } from '@state/PlanContext';
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
import {
  getMachineConflict,
  nextFreeTimeOnOrAfter,
  type MachineFloorIndex,
  type MachineConflictInfo,
} from '@utils/machineFloor';

function trackColors(track: ActualEntry['track']): { bg: string; fg: string } {
  if (track === 'RIG') return { bg: colors.accentSoft, fg: colors.accent };
  if (track === 'CRANE') return { bg: 'rgba(255,149,0,0.12)', fg: colors.warning };
  return { bg: colors.machines.compressor.soft, fg: colors.machines.compressor.color };
}

/** Current time-of-day as minutes-since-midnight. */
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
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

/** Default start time for a step's first "Fill start time" entry: starting from
 * today's existing same-pile default (prevStep.actualEnd ?? plannedStart), skip
 * forward past any other pile's already-recorded busy interval on this same
 * machine (see nextFreeTimeOnOrAfter), then add step.bufferMinutes on top — so
 * the suggested default never opens the picker on a value that would
 * immediately conflict. This is only ever a suggestion: the user can still
 * confirm any time that doesn't genuinely overlap another interval, buffer or
 * not — see getMachineConflict, the actual hard validation. */
function resolveStartDefault(
  step: ActualEntry,
  prevStep: ActualEntry | undefined,
  machineFloorIndex: MachineFloorIndex,
): { defaultMinutes: number; anchorIso?: string } {
  const samePileDefaultMinutes = prevStep?.actualEnd ?? step.plannedStart;
  const samePileDefaultIso = prevStep?.actualEndIso ?? step.plannedStartIso;
  if (!step.assignedMachineId || !samePileDefaultIso) {
    return { defaultMinutes: samePileDefaultMinutes, anchorIso: step.startAnchorIso };
  }

  const nextFree = nextFreeTimeOnOrAfter(
    machineFloorIndex,
    step.assignedMachineId,
    step.stepId,
    new Date(samePileDefaultIso),
  );
  const buffered = addMinutes(nextFree, step.bufferMinutes);

  return {
    defaultMinutes: buffered.getHours() * 60 + buffered.getMinutes(),
    anchorIso: toLocalIsoString(buffered),
  };
}

interface Props {
  group: PileGroup;
  machines: PilingMachine[];
  machineFloorIndex: MachineFloorIndex;
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
}

export default function PileStepsModal({
  group,
  machines,
  machineFloorIndex,
  onClose,
  onSetActualTime,
  onClearActualTime,
  onSaveRemarks,
  onLogMachineEvent,
}: Props) {
  const steps = [...group.steps].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const currentStepId = steps.find((s) => s.actualEnd === undefined)?.stepId;
  const allDone = !currentStepId;

  const [remarksFor, setRemarksFor] = useState<{
    stepId: string;
    stepName: string;
    remarks?: string;
  } | null>(null);
  const [machineEventFor, setMachineEventFor] = useState<{
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
    const map = new Map<
      string,
      { forStart: (c: Date) => MachineConflictInfo | undefined; forFinish: (c: Date) => MachineConflictInfo | undefined }
    >();
    for (const step of steps) {
      if (!step.assignedMachineId) continue;
      const machineId = step.assignedMachineId;
      const ownStart = step.actualStartIso ? new Date(step.actualStartIso) : undefined;
      const ownEnd = step.actualEndIso ? new Date(step.actualEndIso) : undefined;
      map.set(step.stepId, {
        forStart: (candidate) => getMachineConflict(machineFloorIndex, machineId, step.stepId, candidate, ownEnd),
        forFinish: (candidate) =>
          getMachineConflict(machineFloorIndex, machineId, step.stepId, ownStart ?? candidate, candidate),
      });
    }
    return map;
  }, [steps, machineFloorIndex]);

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

  const subtitle = [group.rig && `Rig ${group.rig}`, group.crane && `Crane ${group.crane}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <AppModal
      visible
      title={group.pileCode}
      subtitle={subtitle || undefined}
      onClose={onClose}
      avoidKeyboard={false}
    >
      {currentStepHasBreakdown && currentStep && (
        <Pressable
          style={modalStyles.warningBanner}
          onPress={() =>
            setMachineEventFor({
              stepId: currentStep.stepId,
              stepName: currentStep.stepName,
              track: currentStep.track,
            })
          }
        >
          <AlertTriangle size={16} color={colors.danger} />
          <Text style={modalStyles.warningBannerText}>
            Machine reported down — tap to reassign
          </Text>
        </Pressable>
      )}

      {currentStepBlockedByIdle && currentStep && (
        <Pressable
          style={modalStyles.idleBanner}
          onPress={() =>
            setMachineEventFor({
              stepId: currentStep.stepId,
              stepName: currentStep.stepName,
              track: currentStep.track,
              initialEventType: 'IDLE_END',
            })
          }
        >
          <Coffee size={16} color={colors.warning} />
          <Text style={modalStyles.idleBannerText}>Machine idle — tap to end idle</Text>
        </Pressable>
      )}

      {steps.map((step, idx) => {
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent = step.stepId === currentStepId;
        const isLocked = !isDone && !isCurrent;
        const isBlockedByIdle = isCurrent && !!currentStepBlockedByIdle;
        // Completed on a *previous* day's checklist (see FillActualScreen) — a
        // frozen historical record, shown faded with no edit/remarks/machine-
        // event controls since there's no local row here to attach edits to.
        const isHistorical = !!step.isHistorical;
        const lateMinutes =
          isDone && step.plannedEndIso != null
            ? durationMinutes(step.actualStartIso!, step.actualEndIso!) -
              durationMinutes(step.plannedStartIso!, step.plannedEndIso!)
            : null;
        const isLate = lateMinutes != null && lateMinutes > 0;

        return (
          <View
            // A continuing step can appear twice — once as yesterday's faded
            // historical row, once as today's live one — both share stepId,
            // so isHistorical must be part of the key or React sees a clash.
            key={`${isHistorical ? 'hist' : 'cur'}-${step.stepId}`}
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
              </View>

              {(isStarted || isDone || isCurrent) && !isHistorical && (
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
                    accessibilityLabel="Machine events"
                    onPress={() =>
                      setMachineEventFor({ stepId: step.stepId, stepName: step.stepName, track: step.track })
                    }
                  >
                    <MoreHorizontal size={18} color={colors.textSecondary} />
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
                        minMinutes={idx > 0 ? steps[idx - 1].actualEnd : undefined}
                        minMinutesLabel="the previous step's end time"
                        machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                        maxMinutes={step.actualEnd}
                        maxMinutesLabel="this step's own finish time"
                        onConfirm={(mins, explicitDate) => onSetActualTime(step.stepId, 'actualStart', mins, explicitDate)}
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
                        minMinutes={step.actualStart}
                        minMinutesLabel="this step's start time"
                        machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forFinish}
                        maxMinutes={
                          idx < steps.length - 1 && steps[idx + 1].actualStart !== undefined
                            ? steps[idx + 1].actualStart
                            : undefined
                        }
                        maxMinutesLabel="the next step's start time"
                        onConfirm={(mins, explicitDate) => onSetActualTime(step.stepId, 'actualEnd', mins, explicitDate)}
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
                    minMinutes={idx > 0 ? steps[idx - 1].actualEnd : undefined}
                    minMinutesLabel="the previous step's end time"
                    machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                    onConfirm={(mins, explicitDate) => onSetActualTime(step.stepId, 'actualStart', mins, explicitDate)}
                    anchorIso={step.startAnchorIso}
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

            {isCurrent && !isStarted && !isBlockedByIdle && (() => {
              const prevStep = idx > 0 ? steps[idx - 1] : undefined;
              const { defaultMinutes, anchorIso } = resolveStartDefault(step, prevStep, machineFloorIndex);
              return (
                <StepTimeControl
                  mode="start"
                  stepName={step.stepName}
                  defaultMinutes={defaultMinutes}
                  onConfirm={(mins, explicitDate) => onSetActualTime(step.stepId, 'actualStart', mins, explicitDate)}
                  minMinutes={prevStep?.actualEnd}
                  minMinutesLabel="the previous step's end time"
                  machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forStart}
                  anchorIso={anchorIso}
                />
              );
            })()}

            {isCurrent && isStarted && !isDone && !isBlockedByIdle && (
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
                onConfirm={(mins, explicitDate) => onSetActualTime(step.stepId, 'actualEnd', mins, explicitDate)}
                minMinutes={step.actualStart}
                minMinutesLabel="this step's start time"
                machineConflictCheck={machineConflictChecksByStepId.get(step.stepId)?.forFinish}
                anchorIso={step.endAnchorIso}
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

      {remarksFor && (
        <RemarksModal
          visible
          stepName={remarksFor.stepName}
          initialValue={remarksFor.remarks}
          onClose={() => setRemarksFor(null)}
          onSave={(text) => onSaveRemarks(remarksFor.stepId, text)}
        />
      )}

      {machineEventFor && (
        <MachineEventsModal
          visible
          pileCode={group.pileCode}
          stepName={machineEventFor.stepName}
          defaultTrack={machineEventFor.track}
          initialEventType={machineEventFor.initialEventType}
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
