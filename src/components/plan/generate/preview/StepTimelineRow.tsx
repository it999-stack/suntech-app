// src/components/plan/generate/preview/StepTimelineRow.tsx
//
// A single step row used inside the pile accordion body.
// Displays track badge, step name, planned time range, and duration.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatTime, formatDuration } from '@/utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { colors, spacing, radius, typography } from '@/theme/theme';

interface StepTimelineRowProps {
  step: PlanStepWithMeta;
  isLast: boolean;
}

export default function StepTimelineRow({ step, isLast }: StepTimelineRowProps) {
  return (
    <View style={[styles.stepRow, isLast && styles.stepRowLast]}>
      <View style={styles.stepTrackBadge}>
        <Text
          style={[
            styles.stepTrackText,
            step.track === 'RIG' ? styles.trackRig : styles.trackCrane,
          ]}
        >
          {step.track}
        </Text>
      </View>
      <View style={styles.stepInfo}>
        <Text style={styles.stepName}>{step.stepName}</Text>
        <Text style={styles.stepTimes}>
          {step.plannedStart ? formatTime(step.plannedStart) : '—'}
          {' → '}
          {step.plannedEnd ? formatTime(step.plannedEnd) : '—'}
        </Text>
      </View>
      <Text style={styles.stepDuration}>
        {step.plannedStart && step.plannedEnd
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
  trackRig: { color: '#7c3aed' },
  trackCrane: { color: '#0369a1' },
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
  stepDuration: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    minWidth: 44,
    textAlign: 'right',
  },
});