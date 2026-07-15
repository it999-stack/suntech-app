// src/components/shared/FilterBar.tsx
//
// Generic horizontal chip filter bar — same visual style as the original
// PileFilterBar, but works with any set of options (with or without counts)
// so it can be reused across screens instead of each screen re-styling its
// own filter chips.

import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

export interface FilterOption<K extends string> {
  key: K;
  label: string;
  /** If provided, renders as "Label N" (e.g. "Pending 5"). Omit to just show the label. */
  count?: number;
}

interface FilterBarProps<K extends string> {
  options: readonly FilterOption<K>[];
  active: K;
  onChange: (key: K) => void;
}

export default function FilterBar<K extends string>({ options, active, onChange }: FilterBarProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((opt) => {
        const isActive = active === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {opt.count !== undefined ? `${opt.label} ${opt.count}` : opt.label}
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