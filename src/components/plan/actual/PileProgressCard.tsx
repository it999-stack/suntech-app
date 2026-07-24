// src/components/plan/actual/PileProgressCard.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight, AlertTriangle } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

interface Props {
  pileCode: string;
  rig?: string;
  crane?: string;
  steps: ActualEntry[];
  /** True when a not-yet-done step's assigned machine has been reported down. */
  hasBreakdownWarning?: boolean;
  onPress: () => void;
}

export default function PileProgressCard({ pileCode, rig, crane, steps, hasBreakdownWarning, onPress }: Props) {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.actualEnd !== undefined).length;
  const currentIndex = steps.findIndex((s) => s.actualEnd === undefined);
  const allDone = currentIndex === -1;
  const current = !allDone ? steps[currentIndex] : null;
  const currentStarted = current?.actualStart !== undefined;

  const statusLabel = allDone
    ? 'All steps complete'
    : currentStarted
    ? `${current!.stepName} · In progress`
    : `${current!.stepName} · Not started`;

  const statusColor = allDone ? colors.success : currentStarted ? colors.accent : colors.textSecondary;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.card} innerStyle={styles.pad}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.pileTitle}>{pileCode}</Text>
            {(rig || crane) && (
              <Text style={styles.pileMeta}>
                {rig ? `Rig ${rig}` : ''}{rig && crane ? ' · ' : ''}{crane ? `Crane ${crane}` : ''}
              </Text>
            )}
          </View>
          <ChevronRight size={20} color={colors.textSecondary} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: allDone ? colors.success : colors.accent }]} />
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
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  pad: { padding: spacing.md },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  pileTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  pileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
});