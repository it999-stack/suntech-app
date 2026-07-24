// src/components/plan/generate/preview/StepTimelineRow.tsx
//
// A single step row used inside the pile accordion body.
// Displays track badge, step name, planned time range, and duration.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { formatTime, formatDuration, formatDurationMinutes } from '@/utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { isContinuingStep } from '@utils/helpers';

interface StepTimelineRowProps {
  step: PlanStepWithMeta;
  isLast: boolean;
  /** True once this step's actual end time has been recorded. */
  isCompleted?: boolean;
}

export default function StepTimelineRow({ step, isLast, isCompleted }: StepTimelineRowProps) {
  return (
    <View style={[styles.stepRow, isLast && styles.stepRowLast]}>
      <View style={styles.stepTrackBadge}>
        <Text
          style={[
            styles.stepTrackText,
            step.track === 'RIG'
              ? styles.trackRig
              : step.track === 'CRANE'
                ? styles.trackCrane
                : styles.trackCompressor,
          ]}
        >
          {step.track}
        </Text>
      </View>
      <View style={styles.stepInfo}>
        <Text style={styles.stepName}>{step.stepName}</Text>
        {isCompleted ? (
          <View style={styles.completedRow}>
            <CheckCircle2 size={12} color={colors.success} />
            <Text style={styles.completedText}>Completed</Text>
          </View>
        ) : (
          <Text style={styles.stepTimes}>
            {step.plannedStart ? formatTime(step.plannedStart) : '—'}
            {' → '}
            {isContinuingStep(step) ? 'To be continued' : step.plannedEnd ? formatTime(step.plannedEnd) : '—'}
          </Text>
        )}
      </View>
      <Text style={styles.stepDuration}>
        {isContinuingStep(step)
          ? formatDurationMinutes((step.durationMinutes ?? 0) + (step.bufferMinutes ?? 0))
          : step.plannedStart && step.plannedEnd
            ? formatDuration(step.plannedStart, step.plannedEnd)
            : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  stepRowLast: { borderBottomWidth: 0 },
  stepTrackBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(28,28,46,0.06)',
    minWidth: 44,
    alignItems: 'center',
  },
  stepTrackText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  // Note: this file's rig/crane colors (violet/blue) are a local, pre-existing
  // pair that doesn't match theme.ts's rig=orange/crane=blue — not changed here,
  // compressor just picks a third hue distinct from both of this file's colors.
  trackRig: { color: '#7c3aed' },
  trackCrane: { color: '#0369a1' },
  trackCompressor: { color: '#B45309' },
  stepInfo: { flex: 1 },
  stepName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepTimes: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  completedText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '700',
  },
  stepDuration: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    minWidth: 44,
    textAlign: 'right',
  },
});