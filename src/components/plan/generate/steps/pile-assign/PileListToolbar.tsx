// src/components/plan/generate/steps/pile-assign/PileListToolbar.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, LayoutAnimation } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import FilterMenuButton, { type FilterMenuOption } from '@components/shared/FilterMenuButton';
import { ALL_LOCATIONS_ID, type PileFilter } from './types';

export interface LocationFilterOption { id: string; name: string; }

interface PileListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: PileFilter;
  onFilterChange: (filter: PileFilter) => void;
  allCount: number;
  pendingCount: number;
  assignedCount: number;
  completedCount: number;
  locations: LocationFilterOption[];
  pileCountByLocationId: Record<string, number>;
  activeLocationId: string;
  onLocationChange: (locationId: string) => void;
}

export default function PileListToolbar({
  search, onSearchChange, filter, onFilterChange, allCount, pendingCount, assignedCount, completedCount,
  locations, pileCountByLocationId, activeLocationId, onLocationChange,
}: PileListToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  // "All" first — FilterMenuButton treats the first option as the reset
  // value, tinting its trigger and clearing back to it from that same row.
  const filterOptions: FilterMenuOption<PileFilter>[] = [
    { label: 'All', value: 'all', count: allCount, color: colors.textSecondary },
    { label: 'Pending', value: 'pending', count: pendingCount, color: colors.warning },
    { label: 'Assigned', value: 'assigned', count: assignedCount, color: colors.success },
    { label: 'Completed', value: 'completed', count: completedCount, color: colors.accentBlue },
  ];

  function toggleSearch(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (searchOpen) { onSearchChange(''); setSearchOpen(false); }
    else setSearchOpen(true);
  }

  return (
    <View style={styles.row}>
      <View style={styles.flexSlot}>
        {searchOpen ? (
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Filter piles by code"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoFocus
            returnKeyType="search"
          />
        ) : locations.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            <Pill
              label={`All (${allCount})`}
              active={activeLocationId === ALL_LOCATIONS_ID}
              onPress={() => onLocationChange(ALL_LOCATIONS_ID)}
            />
            {locations.map((location) => (
              <Pill
                key={location.id}
                label={`${location.name} (${pileCountByLocationId[location.id] ?? 0})`}
                active={activeLocationId === location.id}
                onPress={() => onLocationChange(location.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <Pressable style={styles.iconBtn} onPress={toggleSearch} hitSlop={spacing.sm}>
        {searchOpen ? <X size={16} color={colors.textSecondary} /> : <Search size={16} color={colors.textSecondary} />}
      </Pressable>

      <FilterMenuButton options={filterOptions} value={filter} onChange={onFilterChange} iconSize={16} />
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, zIndex: 10, elevation: 4 },
  flexSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  input: {
    ...typography.caption,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    color: colors.textPrimary,
  },
  iconBtn: {
    padding: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
