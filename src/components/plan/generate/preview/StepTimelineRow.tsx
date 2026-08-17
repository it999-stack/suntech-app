// src/components/plan/generate/preview/StepTimelineRow.tsx
//
// A single step row used inside the pile accordion body.
// Displays track badge, step name, planned time range, and duration.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { formatTimeWithDay, formatDurationMinutes } from '@/utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { isContinuingStep, stepWorkStart } from '@utils/helpers';
import TrackChoiceTiles, { type TrackChoice } from './TrackChoiceTiles';

interface StepTimelineRowProps {
  step: PlanStepWithMeta;
  isLast: boolean;
  /** True once this step's actual end time has been recorded. */
  isCompleted?: boolean;
  /** False for a step that's part of this plan's selected steps but didn't
   * get a scheduled time (cut off by the plan-window limit) — rendered
   * faded, with "–" instead of a time range. Defaults to true. */
  isPlanned?: boolean;
  /** Real historical actual start/end for a completed step, when known (either
   * today's actualSteps, e.g. PlanDetailScreen, or a previous day's completed
   * step carried into a resuming pile's list) — shown next to "Completed"
   * instead of the bare label. */
  completedStartIso?: string;
  completedEndIso?: string;
  rigMachineNo: string;
  craneMachineNo?: string;
  /** Only provided for CRANE-track steps in an editable (not-yet-confirmed) plan preview —
   * lets the tiles reflect a pending selection and respond to taps. Omitted everywhere else
   * (RIG-track steps, which have no alternative to offer, and read-only screens), where the
   * tiles just display the step's actual assigned machine. */
  trackChoice?: {
    selected: TrackChoice;
    onSelect: (track: TrackChoice) => void;
  };
}

function StepTimelineRow({
  step,
  isLast,
  isCompleted,
  isPlanned = true,
  completedStartIso,
  completedEndIso,
  rigMachineNo,
  craneMachineNo,
  trackChoice,
}: StepTimelineRowProps) {
  // Eligibility for the Crane tile is the step's nominal (business) track, not the
  // currently-displayed one — once overridden, step.track reads as 'RIG', but the
  // Crane tile must stay offered so it can be toggled back.
  const businessTrack = step.businessTrack ?? step.track;

  return (
    <View style={[styles.stepRow, isLast && styles.stepRowLast, !isPlanned && styles.stepRowUnplanned]}>
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
        {!isPlanned ? (
          <Text style={styles.stepTimes}>–</Text>
        ) : isCompleted ? (
          <View style={styles.completedWrap}>
            <View style={styles.completedRow}>
              <CheckCircle2 size={12} color={colors.success} />
              <Text style={styles.completedText}>Completed</Text>
            </View>
            {completedStartIso && completedEndIso && (
              <Text style={styles.completedTimes}>
                {formatTimeWithDay(completedStartIso)} → {formatTimeWithDay(completedEndIso)}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.stepTimes}>
            {step.plannedStart ? formatTimeWithDay(stepWorkStart(step)) : '—'}
            {' → '}
            {isContinuingStep(step) ? 'To be continued' : step.plannedEnd ? formatTimeWithDay(step.plannedEnd) : '—'}
          </Text>
        )}
      </View>
      {isPlanned && (
        <Text style={styles.stepDuration}>
          {formatDurationMinutes(step.durationMinutes ?? 0)}
        </Text>
      )}
    </View>
  );
}

export default React.memo(StepTimelineRow);

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
  stepRowUnplanned: { opacity: 0.4 },
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
  completedWrap: { marginTop: 1 },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  completedText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '700',
  },
  // Muted, same weight as the regular stepTimes text — on its own line below
  // the "Completed" label so a long (date-inclusive) range wraps cleanly
  // instead of fighting the checkmark icon for vertical alignment.
  completedTimes: {
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