// src/screens/Site/Tabs/MachineStatsGrid.tsx
//
// Same tappable-stat-tile pattern as Piles' StatsGrid (reuses its StatCard
// directly) — one "All" tile plus one per machine status. Tapping a tile
// filters MachinesScreen's grouped list below; tapping the active tile
// again isn't needed since 'ALL' is always available as its own tile.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LayoutGrid, CheckCircle2, Coffee, AlertTriangle } from 'lucide-react-native';
import { colors, spacing } from '@theme/theme';
import StatCard from '@screens/Piles/components/StatCard';
import { STATUS_META, type MachineStatus } from '@utils/helpers';

export type MachineStatFilter = MachineStatus | 'ALL';

export interface MachineStats {
  total: number;
  active: number;
  idle: number;
  breakdown: number;
}

interface Props {
  stats: MachineStats;
  activeFilter: MachineStatFilter;
  onSelectFilter: (filter: MachineStatFilter) => void;
}

export default function MachineStatsGrid({ stats, activeFilter, onSelectFilter }: Props) {
  return (
    <View style={styles.grid}>
      <StatCard
        label="All"
        value={stats.total}
        color={colors.accent}
        softColor={colors.accentSoft}
        icon={LayoutGrid}
        active={activeFilter === 'ALL'}
        onPress={() => onSelectFilter('ALL')}
      />
      <StatCard
        label={STATUS_META.ACTIVE.label}
        value={stats.active}
        color={STATUS_META.ACTIVE.color}
        softColor={STATUS_META.ACTIVE.soft}
        icon={CheckCircle2}
        active={activeFilter === 'ACTIVE'}
        onPress={() => onSelectFilter('ACTIVE')}
      />
      <StatCard
        label={STATUS_META.IDLE.label}
        value={stats.idle}
        color={STATUS_META.IDLE.color}
        softColor={STATUS_META.IDLE.soft}
        icon={Coffee}
        active={activeFilter === 'IDLE'}
        onPress={() => onSelectFilter('IDLE')}
      />
      <StatCard
        label={STATUS_META.BREAKDOWN.label}
        value={stats.breakdown}
        color={STATUS_META.BREAKDOWN.color}
        softColor={STATUS_META.BREAKDOWN.soft}
        icon={AlertTriangle}
        active={activeFilter === 'BREAKDOWN'}
        onPress={() => onSelectFilter('BREAKDOWN')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.xs },
});
