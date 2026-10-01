// src/components/plan/generate/steps/team-assign/MachineTeamCard.tsx
//
// One card per machine (or the Shift Incharge card): a title, then a Day and a
// Night section stacked top to bottom, each holding that shift's TeamRoleRows.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import { TRACK_META } from '@/utils/helpers';

export const SHIFT_TONE = {
  1: { bg: '#FFF6E9', title: '#8A5A12' },
  2: { bg: '#EEF3FC', title: '#1E3A8A' },
} as const;

interface ShiftColumnProps {
  slot: 1 | 2;
  title: string;
  children: React.ReactNode;
}

export function ShiftColumn({ slot, title, children }: ShiftColumnProps) {
  const tone = SHIFT_TONE[slot];
  return (
    <View style={[styles.column, { backgroundColor: tone.bg }]}>
      <Text style={[styles.columnTitle, { color: tone.title }]} numberOfLines={1}>{title}</Text>
      <View style={styles.columnBody}>{children}</View>
    </View>
  );
}

interface MachineTeamCardProps {
  title: string;
  /** Shows the machine-type icon (rig / crane) before the title; omit for non-machine cards. */
  track?: 'RIG' | 'CRANE';
  /** Exactly two ShiftColumns: Day, then Night. */
  children: React.ReactNode;
}

export default function MachineTeamCard({ title, track, children }: MachineTeamCardProps) {
  const meta = track ? TRACK_META[track] : null;
  const Icon = meta?.icon;
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        {meta && Icon && (
          <View style={[styles.iconWrap, { backgroundColor: meta.soft }]}>
            <Icon size={18} color={meta.color} />
          </View>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.columns}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.textPrimary, flexShrink: 1 },
  columns: { gap: spacing.sm },
  column: { borderRadius: radius.lg, padding: spacing.xs, gap: spacing.xs },
  columnTitle: { ...typography.caption, fontWeight: '700', paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  columnBody: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: radius.md, paddingHorizontal: spacing.xs },
});
