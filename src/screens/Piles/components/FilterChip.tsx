// src/screens/Piles/components/FilterChip.tsx

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export default function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <Pressable style={styles.chip} onPress={onRemove} hitSlop={spacing.xs}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <X size={12} color={colors.textInverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  label: { ...typography.caption, color: colors.textInverse, fontWeight: '600' },
});
