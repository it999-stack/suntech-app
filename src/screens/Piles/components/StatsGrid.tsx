// src/screens/Piles/components/StatsGrid.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Database } from 'lucide-react-native';
import { colors, spacing } from '@theme/theme';
import type { PileStatus, PileStatusStats } from '@repositories/pilesRepository';
import StatCard from './StatCard';
import { STATUS_META } from './types';

/** 'ALL' is the Total Piles tile — clears the status filter rather than selecting one. */
export type StatFilter = PileStatus | 'ALL';

interface StatsGridProps {
  stats: PileStatusStats | null;
  activeFilter: StatFilter;
  onSelectFilter: (filter: StatFilter) => void;
}

export default function StatsGrid({ stats, activeFilter, onSelectFilter }: StatsGridProps) {
  return (
    <View style={styles.grid}>
      <StatCard
        label="Total Piles"
        value={stats?.total ?? null}
        color={colors.accent}
        softColor={colors.accentSoft}
        icon={Database}
        active={activeFilter === 'ALL'}
        onPress={() => onSelectFilter('ALL')}
      />
      <StatCard
        label={STATUS_META.COMPLETED.label}
        value={stats?.completed ?? null}
        color={STATUS_META.COMPLETED.color}
        softColor={STATUS_META.COMPLETED.softColor}
        icon={STATUS_META.COMPLETED.icon}
        active={activeFilter === 'COMPLETED'}
        onPress={() => onSelectFilter('COMPLETED')}
      />
      <StatCard
        label={STATUS_META.IN_PROGRESS.label}
        value={stats?.inProgress ?? null}
        color={STATUS_META.IN_PROGRESS.color}
        softColor={STATUS_META.IN_PROGRESS.softColor}
        icon={STATUS_META.IN_PROGRESS.icon}
        active={activeFilter === 'IN_PROGRESS'}
        onPress={() => onSelectFilter('IN_PROGRESS')}
      />
      <StatCard
        label={STATUS_META.NOT_STARTED.label}
        value={stats?.notStarted ?? null}
        color={STATUS_META.NOT_STARTED.color}
        softColor={STATUS_META.NOT_STARTED.softColor}
        icon={STATUS_META.NOT_STARTED.icon}
        active={activeFilter === 'NOT_STARTED'}
        onPress={() => onSelectFilter('NOT_STARTED')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.xs },
});
