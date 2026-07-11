// src/components/piles/PileFilterBar.tsx

import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

export const PILE_FILTERS = [
  { key: 'all',         label: 'All'         },
  { key: 'pending',     label: 'Pending'     },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed'   },
] as const;

export type PileFilterKey = (typeof PILE_FILTERS)[number]['key'];

interface Props {
  active: PileFilterKey;
  onChange: (key: PileFilterKey) => void;
}

export default function PileFilterBar({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PILE_FILTERS.map((f) => {
        const isActive = active === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(f.key)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
});
