// src/components/plan/actual/PileStepsModal.tsx
//
// Pile-specific modal built on top of AppModal. Shows a timeline of steps
// with start/finish controls for the current active step.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import StepTimeControl from '@components/plan/actual/StepTimeControl';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

interface Props {
  visible: boolean;
  onClose: () => void;
  pileCode: string;
  rig?: string;
  crane?: string;
  steps: ActualEntry[]; // already sorted by plannedStart
  /** Called when the user logs a start or finish time (minutes since midnight). */
  onSetActualTime?: (stepId: string, field: 'actualStart' | 'actualEnd', minutes: number) => void;
}

export default function PileStepsModal({ visible, onClose, pileCode, rig, crane, steps, onSetActualTime }: Props) {
  const noop = () => {};
  const handleSet = onSetActualTime ?? noop;

  // The current step is the first one that hasn't been finished yet.
  const currentRigStepId = steps.find((s) => s.track === 'RIG' && s.actualEnd === undefined)?.stepId;
  const currentCraneStepId = steps.find((s) => s.track === 'CRANE' && s.actualEnd === undefined)?.stepId;
  const allDone = !currentRigStepId && !currentCraneStepId;

  const subtitle = [rig && `Rig ${rig}`, crane && `Crane ${crane}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={subtitle || undefined}>
      {steps.map((step, idx) => {
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent =
          (step.track === 'RIG' && step.stepId === currentRigStepId) ||
          (step.track === 'CRANE' && step.stepId === currentCraneStepId);
        const isLocked = !isDone && !isCurrent;

        return (
          <View key={step.stepId} style={styles.stepRow}>
            <View style={styles.markerCol}>
              {isDone ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : (
                <Circle size={20} color={isCurrent ? colors.accent : colors.textSecondary} />
              )}
              {idx < steps.length - 1 && <View style={styles.markerLine} />}
            </View>

            <View style={[styles.stepContent, isLocked && styles.stepContentLocked]}>
              <View style={styles.stepHeaderRow}>
                <Text style={styles.stepName}>{step.stepName}</Text>
                <View
                  style={[
                    styles.trackBadge,
                    { backgroundColor: step.track === 'RIG' ? colors.accentSoft : 'rgba(255,149,0,0.12)' },
                  ]}
                >
                  <Text
                    style={[
                      styles.trackTag,
                      { color: step.track === 'RIG' ? colors.accent : colors.warning },
                    ]}
                  >
                    {step.track}
                  </Text>
                </View>
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatMinutes(step.plannedStart)}</Text>
                <ArrowRight size={12} color={colors.textSecondary} style={styles.timeIcon} />
                <Text style={styles.timeText}>{formatMinutes(step.plannedEnd)}</Text>
              </View>

              {isDone && (
                <View style={styles.timeRow}>
                  <Text style={styles.loggedText}>{formatMinutes(step.actualStart!)}</Text>
                  <ArrowRight size={12} color={colors.success} style={styles.timeIcon} />
                  <Text style={styles.loggedText}>{formatMinutes(step.actualEnd!)}</Text>
                </View>
              )}

              {isCurrent && !isStarted && (
                <StepTimeControl
                  mode="start"
                  stepName={step.stepName}
                  defaultMinutes={step.plannedStart}
                  onConfirm={(mins) => handleSet(step.stepId, 'actualStart', mins)}
                />
              )}

              {isCurrent && isStarted && !isDone && (
                <>
                  <Text style={styles.startedText}>Started {formatMinutes(step.actualStart!)}</Text>
                  <StepTimeControl
                    mode="finish"
                    stepName={step.stepName}
                    defaultMinutes={step.plannedEnd}
                    onConfirm={(mins) => handleSet(step.stepId, 'actualEnd', mins)}
                  />
                </>
              )}

              {isLocked && <Text style={styles.lockedText}>Waiting on previous step</Text>}
            </View>
          </View>
        );
      })}

      {allDone && (
        <View style={styles.allDoneWrap}>
          <CheckCircle2 size={22} color={colors.success} />
          <Text style={styles.allDoneText}>All steps for {pileCode} are complete</Text>
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', marginBottom: spacing.md },
  markerCol: {
    alignItems: 'center',
    width: 24,
  },
  markerLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.1)',
    marginVertical: 3,
  },
  stepContent: {
    flex: 1,
    paddingLeft: spacing.sm,
  },
  stepContentLocked: {
    opacity: 0.45,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepName: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  trackBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  trackTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
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
    marginTop: 0,
  },
  plannedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
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
  allDoneWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  allDoneText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});