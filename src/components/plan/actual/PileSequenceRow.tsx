// src/components/plan/actual/PileSequenceRow.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import Badge from '@components/shared/Badge';
import MachineBadge from '@components/shared/MachineBadge';
import { colors, spacing, radius, typography } from '@theme/theme';
import { formatTime } from '@utils/formatTime';
import { ActualEntry } from '@app-types/plan';
import { getPileProgress, getPileMachines, PILE_CARD_STATUS_META } from './pileProgress';

interface Props {
  index: number;
  pileCode: string;
  steps: ActualEntry[];
  /** 'upNext' = this machine's front-of-queue pile (filled green badge);
   * 'rail' = every other pile (hollow badge outlined in the machine's own
   * track color). Unrelated to per-pile status — a pile can be "up next"
   * and still Not started, or mid-queue and already In progress. */
  circleVariant: 'upNext' | 'rail';
  railColor: string;
  onPress: () => void;
}

export default function PileSequenceRow({ index, pileCode, steps, circleVariant, railColor, onPress }: Props) {
  const { total, doneCount, pct, status, inProgressStep, nextStep } = getPileProgress(steps);
  const { worked } = getPileMachines(steps);
  const meta = PILE_CARD_STATUS_META[status];
  const isUpNext = circleVariant === 'upNext';
  const currentStepPosition = inProgressStep ? doneCount + 1 : undefined;
  const subtitleStep = inProgressStep ?? nextStep;

  return (
    <Pressable style={styles.cardWrap} onPress={onPress}>
      <GlassCard style={styles.card} innerStyle={styles.pad}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.seqBadge,
                isUpNext
                  ? { backgroundColor: colors.success, borderColor: colors.success }
                  : { borderColor: railColor, backgroundColor: 'transparent' },
              ]}
            >
              <Text style={[styles.seqBadgeText, { color: isUpNext ? colors.white : railColor }]}>{index}</Text>
            </View>
            <Text style={styles.pileTitle}>{pileCode}</Text>
          </View>
          <View style={styles.topRowRight}>
            <Badge text={meta.label} textColor={meta.color} bgColor={meta.soft} uppercase={false} />
            <ChevronRight size={20} color={colors.textSecondary} />
          </View>
        </View>

        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {subtitleStep ? `${subtitleStep.stepName} · ` : ''}
            {doneCount}/{total} steps
          </Text>
          <Text style={[styles.pctText, { color: meta.color }]}>{pct}%</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
        </View>

        <View style={[styles.infoGrid, { backgroundColor: meta.soft }]}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>
              {inProgressStep
                ? `Current Step${currentStepPosition ? ` (${currentStepPosition}/${total})` : ''}`
                : nextStep
                ? 'Next Step'
                : 'Status'}
            </Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {(inProgressStep ?? nextStep)?.stepName ?? 'All steps completed'}
            </Text>
          </View>
          {/* Current Machine while a step is actually running, or the
              machine planned to run the upcoming step once it hasn't
              started yet — either way, whichever step column 1 is showing. */}
          {(inProgressStep ?? nextStep) && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>{inProgressStep ? 'Current Machine' : 'Planned Machine'}</Text>
                <MachineBadge
                  track={(inProgressStep ?? nextStep)!.track}
                  label={(inProgressStep ?? nextStep)!.assignedMachineNo ?? '-'}
                />
                {inProgressStep?.actualStartIso && (
                  <Text style={styles.sinceText}>Since {formatTime(inProgressStep.actualStartIso)}</Text>
                )}
              </View>
            </>
          )}
        </View>

        {worked.length > 0 && (
          <View style={styles.machinesSection}>
            <Text style={styles.machinesSectionLabel}>Machines worked ({worked.length})</Text>
            <View style={styles.machinesRow}>
              {worked.map((m) => (
                <MachineBadge key={`worked-${m.id}`} track={m.track} label={m.no} />
              ))}
            </View>
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

const SEQ_BADGE_SIZE = 24;

const styles = StyleSheet.create({
  cardWrap: {
    paddingBottom: spacing.md,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
  },
  pad: { padding: spacing.md, gap: spacing.sm },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  seqBadge: {
    width: SEQ_BADGE_SIZE,
    height: SEQ_BADGE_SIZE,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqBadgeText: {
    ...typography.caption,
    fontWeight: '800',
  },
  pileTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  subtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  subtitleText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  pctText: {
    ...typography.caption,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  infoDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  infoLabel: {
    ...typography.smallTxt,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sinceText: {
    ...typography.smallTxt,
    color: colors.textSecondary,
  },
  machinesSection: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  machinesSectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  machinesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
