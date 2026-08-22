// src/screens/Piles/components/FilterBar.tsx

import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Funnel } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import FilterChip from './FilterChip';

export interface FilterChipData {
  key: string;
  label: string;
}

interface FilterBarProps {
  chips: FilterChipData[];
  activeCount: number;
  onOpenFilters: () => void;
  onRemoveChip: (key: string) => void;
  onClear: () => void;
}

export default function FilterBar({ chips, activeCount, onOpenFilters, onRemoveChip, onClear }: FilterBarProps) {
  if (activeCount === 0) return null;

  return (
    <View style={styles.row}>
      <FilterButton count={activeCount} onPress={onOpenFilters} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {chips.map((chip) => (
          <FilterChip key={chip.key} label={chip.label} onRemove={() => onRemoveChip(chip.key)} />
        ))}
      </ScrollView>
      <ClearButton onPress={onClear} />
    </View>
  );
}

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable style={styles.filterButton} onPress={onPress}>
      <Funnel size={13} color={colors.accent} />
      <Text style={styles.filterButtonText}>{count} Filter{count === 1 ? '' : 's'}</Text>
    </Pressable>
  );
}

function ClearButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.clearBtn} onPress={onPress} hitSlop={spacing.sm}>
      <Text style={styles.clearText}>Clear All</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  filterButtonText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexGrow: 1 },
  clearBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  clearText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
});
