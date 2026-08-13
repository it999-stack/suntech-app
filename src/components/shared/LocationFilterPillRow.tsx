// src/components/shared/LocationFilterPillRow.tsx
//
// Horizontal single-select filter row: "All (n)" plus one pill per location.
// Purely presentational, styled to match PilesScreen.tsx's existing
// dimension-filter Pill exactly, so it's droppable into PilesScreen.tsx
// later (swapping its dimension row for a location row) with no visual change.

import React from 'react';
import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface LocationFilterOption {
  id: string;
  name: string;
}

interface LocationFilterPillRowProps {
  locations: LocationFilterOption[];
  countByLocationId: Record<string, number>;
  totalCount: number;
  /** 'all' or a location id. */
  activeLocationId: string;
  onLocationChange: (locationId: string) => void;
}

export default function LocationFilterPillRow({
  locations,
  countByLocationId,
  totalCount,
  activeLocationId,
  onLocationChange,
}: LocationFilterPillRowProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
      <Pill label={`All (${totalCount})`} active={activeLocationId === 'all'} onPress={() => onLocationChange('all')} />
      {locations.map((location) => (
        <Pill
          key={location.id}
          label={`${location.name} (${countByLocationId[location.id] ?? 0})`}
          active={activeLocationId === location.id}
          onPress={() => onLocationChange(location.id)}
        />
      ))}
    </ScrollView>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pill: {
    minWidth: 84,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pillTextActive: { color: colors.textInverse },
});
