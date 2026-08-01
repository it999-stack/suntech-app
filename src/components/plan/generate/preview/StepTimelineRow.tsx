// src/components/plan/generate/preview/StepTimelineRow.tsx
//
// A single step row used inside the pile accordion body.
// Displays track badge, step name, planned time range, and duration.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { formatTime, formatDurationMinutes } from '@/utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { isContinuingStep, stepWorkStart } from '@utils/helpers';
import TrackChoiceTiles, { type TrackChoice } from './TrackChoiceTiles';

interface StepTimelineRowProps {
  step: PlanStepWithMeta;
  isLast: boolean;
  /** True once this step's actual end time has been recorded. */
  isCompleted?: boolean;
  rigMachineNo: string;
  craneMachineNo: string;
  /** Only provided for CRANE-track steps in an editable (not-yet-confirmed) plan preview —
   * lets the tiles reflect a pending selection and respond to taps. Omitted everywhere else
   * (RIG-track steps, which have no alternative to offer, and read-only screens), where the
   * tiles just display the step's actual assigned machine. */
  trackChoice?: {
    selected: TrackChoice;
    onSelect: (track: TrackChoice) => void;
  };
}

export default function StepTimelineRow({
  step,
  isLast,
  isCompleted,
  rigMachineNo,
  craneMachineNo,
  trackChoice,
}: StepTimelineRowProps) {
  // Eligibility for the Crane tile is the step's nominal (business) track, not the
  // currently-displayed one — once overridden, step.track reads as 'RIG', but the
  // Crane tile must stay offered so it can be toggled back.
  const businessTrack = step.businessTrack ?? step.track;

  return (
    <View style={[styles.stepRow, isLast && styles.stepRowLast]}>
      {businessTrack === 'COMPRESSOR' ? (
        <View style={styles.stepTrackBadge}>
          <Text style={[styles.stepTrackText, styles.trackCompressor]}>{step.track}</Text>
        </View>
      ) : (
        <TrackChoiceTiles
          rigMachineNo={rigMachineNo}
          craneMachineNo={businessTrack === 'CRANE' ? craneMachineNo : undefined}
          selected={trackChoice?.selected ?? (step.track === 'RIG' ? 'RIG' : 'CRANE')}
          onSelect={trackChoice?.onSelect}
        />
      )}
      <View style={styles.stepInfo}>
        <Text style={styles.stepName}>{step.stepName}</Text>
        {isCompleted ? (
          <View style={styles.completedRow}>
            <CheckCircle2 size={12} color={colors.success} />
            <Text style={styles.completedText}>Completed</Text>
          </View>
        ) : (
          <Text style={styles.stepTimes}>
            {step.plannedStart ? formatTime(stepWorkStart(step)) : '—'}
            {' → '}
            {isContinuingStep(step) ? 'To be continued' : step.plannedEnd ? formatTime(step.plannedEnd) : '—'}
          </Text>
        )}
      </View>
      <Text style={styles.stepDuration}>
        {formatDurationMinutes(step.durationMinutes ?? 0)}
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
  // COMPRESSOR has no machine-tile UI yet (no compressor assignment exists in the
  // wizard) — falls back to the old plain badge, this hue distinct from rig/crane.
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