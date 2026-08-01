// src/components/piles/PileStepsModal.tsx
//
// Bottom sheet showing a single pile's completed steps (today's checklist),
// computed lazily by the caller only when a row is tapped.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@theme/theme';
import { formatTimeRange } from '@utils/formatTime';

export type CompletedStepRow = {
  id: string;
  name: string;
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  actualStart: string;
  actualEnd: string;
};

function trackBadgeColors(track: CompletedStepRow['track']): { bg: string; fg: string } {
  if (track === 'RIG') return { bg: colors.accentSoft, fg: colors.accent };
  if (track === 'CRANE') return { bg: 'rgba(255,149,0,0.12)', fg: colors.warning };
  return { bg: colors.machines.compressor.soft, fg: colors.machines.compressor.color };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  pileCode: string;
  steps: CompletedStepRow[];
}

export default function PileStepsModal({ visible, onClose, pileCode, steps }: Props) {
  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} position='center' subtitle="Completed steps">
      {steps.length === 0 ? (
        <Text style={styles.emptyText}>No completed steps yet for this pile.</Text>
      ) : (
        steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const track = trackBadgeColors(step.track);
          return (
            <View key={step.id} style={[styles.stepRow, !isLast && styles.stepRowDivider]}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepName}>{step.name}</Text>
                <View style={[styles.trackBadge, { backgroundColor: track.bg }]}>
                  <Text style={[styles.trackText, { color: track.fg }]}>{step.track}</Text>
                </View>
              </View>
              <Text style={styles.stepTime}>{formatTimeRange(step.actualStart, step.actualEnd)}</Text>
            </View>
          );
        })
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.lg,
  },
  stepRow: {
    paddingVertical: spacing.sm,
  },
  stepRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  stepHeader: {
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
  trackText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  stepTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
