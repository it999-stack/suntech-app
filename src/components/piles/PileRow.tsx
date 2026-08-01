// src/components/piles/PileRow.tsx
//
// Simple, non-expandable row for the flat piles list: pile code on the left
// (green left border once completed), dia/depth + area stacked on the right.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, typography } from '@theme/theme';

export type PileRowStatus = 'pending' | 'in_progress' | 'completed';

export type PileRowData = {
  id: string;
  code: string;
  dia: number;
  depth: number;
  areaName: string | null;
  status: PileRowStatus;
};

interface Props {
  pile: PileRowData;
  onPress: () => void;
}

export default function PileRow({ pile, onPress }: Props) {
  const isCompleted = pile.status === 'completed';

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <GlassCard
          style={styles.card}
          innerStyle={[
            styles.inner,
            isCompleted && styles.innerCompleted,
            pressed && styles.innerPressed,
          ]}
        >
          <Text style={styles.code}>{pile.code}</Text>
          <View style={styles.right}>
            <Text style={styles.dims}>Ø{pile.dia}mm · {pile.depth}m</Text>
            <Text style={styles.area}>{pile.areaName ?? '—'}</Text>
          </View>
        </GlassCard>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  innerCompleted: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  innerPressed: {
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
  code: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  dims: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  area: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
