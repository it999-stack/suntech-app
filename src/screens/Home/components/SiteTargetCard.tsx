// src/screens/Home/components/SiteTargetCard.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Target, Database, CircleCheck, Clock, Circle } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { SiteTargetStats } from '../hooks/useSiteStats';
import Divider from '@/components/shared/Divider';

const STAT_TILES = [
  { key: 'total', label: 'Total Piles', Icon: Database, color: colors.accentBlue },
  { key: 'completed', label: 'Completed', Icon: CircleCheck, color: colors.success },
  { key: 'inProgress', label: 'In Progress', Icon: Clock, color: colors.warning },
  { key: 'notStarted', label: 'Not Started', Icon: Circle, color: colors.textSecondary },
] as const;

type Period = 'overall' | 'weekly' | 'monthly' | 'daily';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'daily', label: 'Daily' },
];

function PeriodToggle({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <View style={styles.toggleTrack}>
      {PERIODS.map(({ key, label }) => {
        const active = key === value;
        return (
          <Pressable key={key} style={[styles.toggleSegment, active && styles.toggleSegmentActive]} onPress={() => onChange(key)}>
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SiteTargetCard({ stats }: { stats: SiteTargetStats }) {
  const [period, setPeriod] = useState<Period>('weekly');

  const completed = period === 'overall' ? stats.overall.completed : stats[period].completed;
  const target = period === 'overall' ? stats.overall.total : stats[period].target;
  const hasTarget = target !== null && target > 0;
  const pct = hasTarget ? Math.round((completed / target) * 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Target size={20} color={colors.accentBlue} />
          <Text style={styles.title}>Site Target</Text>
        </View>
        <PeriodToggle value={period} onChange={setPeriod} />
      </View>

      {hasTarget ? (
        <>
          <Text style={styles.count}>
            {completed} / {target} <Text style={styles.countSuffix}>piles completed</Text>
          </Text>
          <View style={styles.barRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.pct}>{pct}%</Text>
          </View>
        </>
      ) : (
        <Text style={styles.count}>
          {completed} <Text style={styles.countSuffix}>piles completed · No {period} target set</Text>
        </Text>
      )}

      {period === 'overall' && (
        <>
          <Divider style={{ marginVertical: spacing.sm }} />

          <View style={styles.tiles}>
            {STAT_TILES.map(({ key, label, Icon, color }, index) => (
              <React.Fragment key={key}>
                {index > 0 && <Divider vertical marginVertical={0} />}
                <View style={styles.tile}>
                <Icon size={22} color={color} />
                  <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
                  <Text style={styles.tileValue}>{stats.overall[key]}</Text>
                  <View style={[styles.underline, { backgroundColor: color }]} />
                </View>
              </React.Fragment>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.cardTitle, color: colors.textPrimary },
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: colors.glassFill,
    borderRadius: radius.pill,
    padding: 2,
  },
  toggleSegment: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  toggleSegmentActive: { backgroundColor: colors.accent },
  toggleText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive: { color: colors.textInverse },
  count: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  countSuffix: { ...typography.caption, fontWeight: '400', color: colors.textSecondary },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.glassBorder, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.success },
  pct: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  tiles: { flexDirection: 'row' },
  tile: { flex: 1, alignItems: 'center', gap: 2 },
  tileLabel: { ...typography.smallTxt, color: colors.textSecondary },
  tileValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  underline: { width: 28, height: 3, borderRadius: radius.pill, marginTop: 2 },
});
