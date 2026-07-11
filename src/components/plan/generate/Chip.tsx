// src/components/plan/generate/Chip.tsx

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export default function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },
});