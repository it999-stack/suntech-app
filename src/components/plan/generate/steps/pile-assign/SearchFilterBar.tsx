// src/components/plan/generate/steps/pile-assign/SearchFilterBar.tsx
//
// Search bar with an ellipsis filter menu to its right (All/Pending/Assigned),
// matching the FilterMenuButton pattern used elsewhere instead of a chip row.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import SearchBar from '@components/piles/SearchBar';
import FilterMenuButton, { type FilterMenuOption } from '@components/shared/FilterMenuButton';
import { spacing } from '@/theme/theme';
import type { PileFilter } from './types';

interface SearchFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: PileFilter;
  onFilterChange: (filter: PileFilter) => void;
  allCount: number;
  pendingCount: number;
  assignedCount: number;
}

export default function SearchFilterBar({
  search, onSearchChange, filter, onFilterChange, allCount, pendingCount, assignedCount,
}: SearchFilterBarProps) {
  const options: FilterMenuOption<PileFilter>[] = [
    { label: 'All', value: 'all', count: allCount },
    { label: 'Pending', value: 'pending', count: pendingCount },
    { label: 'Assigned', value: 'assigned', count: assignedCount },
  ];

  return (
    <View style={styles.row}>
      <View style={styles.searchFlex}>
        <SearchBar
          value={search}
          onChangeText={onSearchChange}
          placeholder="Filter piles by code"
        />
      </View>
      <FilterMenuButton options={options} value={filter} onChange={onFilterChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchFlex: {
    flex: 1,
  },
});