// src/screens/Home/components/RecentPlanActivity.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CircleCheck, ChevronRight, ArrowRight } from 'lucide-react-native';
import { colors, spacing, radius, shadow, typography } from '@theme/theme';
import { formatRelativeDayLabel } from '@utils/formatTime';
import type { RecentPlan } from '../hooks/useRecentPlans';

interface RecentPlanActivityProps {
  plans: RecentPlan[];
  onViewAll: () => void;
}

/** Latest generated plans; each row and "View All" open the plan history. */
export default function RecentPlanActivity({ plans, onViewAll }: RecentPlanActivityProps) {
  if (plans.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.heading}>Recent Plan Activity</Text>
        <Pressable style={styles.viewAll} onPress={onViewAll} hitSlop={8}>
          <Text style={styles.viewAllText}>View All</Text>
          <ArrowRight size={14} color={colors.accentBlue} />
        </Pressable>
      </View>
      {plans.map((plan) => (
        <Pressable key={plan.id} style={styles.row} onPress={onViewAll}>
          <View style={styles.iconCircle}>
            <CircleCheck size={20} color={colors.success} />
          </View>
          <View style={styles.text}>
            <Text style={styles.rowTitle}>Plan generated</Text>
            <Text style={styles.rowSubtitle}>
              {formatRelativeDayLabel(plan.date, {
                neighbor: 'yesterday',
                locale: 'en-IN',
                dateFormatOptions: { day: 'numeric', month: 'short', year: 'numeric' },
              })}
            </Text>
          </View>
          <Text style={styles.count}>{plan.pileCount} piles</Text>
          <ChevronRight size={16} color={colors.textPrimary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.soft,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...typography.h2, color: colors.textPrimary },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { ...typography.caption, fontWeight: '600', color: colors.accentBlue },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  rowTitle: { ...typography.cardTitle, color: colors.textPrimary },
  rowSubtitle: { ...typography.caption, color: colors.textSecondary },
  count: { ...typography.caption, color: colors.textSecondary },
});
