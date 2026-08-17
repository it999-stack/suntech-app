// src/components/plan/actual/PileSequenceRow.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight, AlertTriangle, Coffee, Drill, Forklift } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';
import { getPileProgress } from './pileProgress';

// Manually-drawn dash segments instead of `borderStyle: 'dashed'` — a
// directional border (borderLeftWidth only) on a zero-width box renders as a
// solid line on this app's Android/Fabric setup instead of dashed (the
// dashed borders that do work elsewhere in the app, e.g. PilesAccordion.tsx,
// all use a real borderWidth on a box with actual area). This sidesteps that
// rendering quirk entirely.
const DASH_COUNT = 8;
const DASH_INDICES = Array.from({ length: DASH_COUNT }, (_, i) => i);

interface Props {
  index: number;
  pileCode: string;
  rig?: string;
  crane?: string;
  steps: ActualEntry[];
  hasBreakdownWarning?: boolean;
  isBlockedByIdle?: boolean;
  circleVariant: 'upNext' | 'rail';
  railColor: string;
  isLast: boolean;
  onPress: () => void;
}

export default function PileSequenceRow({
  index,
  pileCode,
  rig,
  crane,
  steps,
  hasBreakdownWarning,
  isBlockedByIdle,
  circleVariant,
  railColor,
  isLast,
  onPress,
}: Props) {
  const { total, doneCount, allDone, statusLabel, statusColor, pct } = getPileProgress(steps);
  const isUpNext = circleVariant === 'upNext';

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.circle,
            isUpNext
              ? { backgroundColor: colors.success, borderColor: colors.success }
              : { borderColor: railColor, backgroundColor: 'transparent' },
          ]}
        >
          <Text style={[styles.circleText, { color: isUpNext ? colors.white : railColor }]}>{index}</Text>
        </View>
        {!isLast && (
          <View style={styles.connector}>
            {DASH_INDICES.map((i) => (
              <View key={i} style={[styles.dash, { backgroundColor: railColor }]} />
            ))}
          </View>
        )}
      </View>

      <Pressable style={styles.cardWrap} onPress={onPress}>
        <GlassCard style={styles.card} innerStyle={styles.pad}>
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.pileTitle}>{pileCode}</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </View>

          {(rig || crane) && (
            <View style={styles.machineBadgeRow}>
              {rig && (
                <View style={[styles.machineBadge, { backgroundColor: colors.machines.rig.soft }]}>
                  <Drill size={12} color={colors.machines.rig.color} />
                  <Text style={[styles.machineBadgeText, { color: colors.machines.rig.color }]}>{rig}</Text>
                </View>
              )}
              {crane && (
                <View style={[styles.machineBadge, { backgroundColor: colors.machines.crane.soft }]}>
                  <Forklift size={12} color={colors.machines.crane.color} />
                  <Text style={[styles.machineBadgeText, { color: colors.machines.crane.color }]}>{crane}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct}%`, backgroundColor: allDone ? colors.success : colors.accent },
              ]}
            />
          </View>

          <View style={styles.bottomRow}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={styles.countText}>{doneCount}/{total} steps</Text>
          </View>

          {hasBreakdownWarning && (
            <View style={styles.warningBanner}>
              <AlertTriangle size={14} color={colors.danger} />
              <Text style={styles.warningText}>Machine reported down — tap to reassign</Text>
            </View>
          )}

          {isBlockedByIdle && (
            <View style={styles.idleBanner}>
              <Coffee size={14} color={colors.warning} />
              <Text style={styles.idleText}>Machine idle — tap to end idle</Text>
            </View>
          )}
        </GlassCard>
      </Pressable>
    </View>
  );
}

const CIRCLE_SIZE = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rail: {
    width: CIRCLE_SIZE,
    alignItems: 'center',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  circleText: {
    ...typography.caption,
    fontWeight: '800',
  },
  connector: {
    flex: 1,
    width: 2,
    marginTop: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dash: {
    width: 2,
    height: 4,
    borderRadius: 1,
  },
  cardWrap: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
  },
  pad: { padding: spacing.md },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleWrap: { flex: 1 },
  pileTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  machineBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  machineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  machineBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.08)',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
  },
  countText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: spacing.sm,
  },
  warningText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.danger,
    flex: 1,
  },
  idleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: spacing.md,
  },
  idleText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.warning,
    flex: 1,
  },
});
