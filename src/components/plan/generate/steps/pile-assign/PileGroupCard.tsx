// src/components/plan/generate/steps/pile-assign/PileGroupCard.tsx
//
// Reusable "piles grouped under one machine" card — a rounded card with a
// track-tinted header (icon + machine label + a right-aligned count/status
// label) and numbered pile rows below. Shared by PileAssignStep's "Assigned
// Piles" modal, ResumeConfirmStep's planned-piles list, and
// ReorderPilesOverlay's sequence rows, so every "piles under one machine"
// list presents the same layout instead of each keeping its own copy.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import { TRACK_META } from '@/utils/helpers';

type Track = keyof typeof TRACK_META;

interface PileGroupCardProps {
  rigLabel: string;
  /** Plain right-aligned text, e.g. "4 piles" — ignored when headerRight is given. */
  countLabel?: string;
  /** Custom right-aligned header content, e.g. a row of MachineBadge pills —
   * takes precedence over countLabel when provided. */
  headerRight?: React.ReactNode;
  /** Which machine track tints the header — defaults to RIG (every existing
   * caller groups by rig). */
  track?: Track;
  children: React.ReactNode;
}

export function PileGroupCard({ rigLabel, countLabel, headerRight, track = 'RIG', children }: PileGroupCardProps) {
  const meta = TRACK_META[track];
  const TrackIcon = meta.icon;
  return (
    <View style={styles.card}>
      <View style={[styles.header, { backgroundColor: meta.soft }]}>
        <View style={styles.headerLeft}>
          <TrackIcon size={16} color={meta.color} />
          <Text style={[styles.headerTitle, { color: meta.color }]}>{rigLabel}</Text>
        </View>
        {headerRight ?? <Text style={[styles.headerCount, { color: meta.color }]}>{countLabel}</Text>}
      </View>
      {children}
    </View>
  );
}

interface PileGroupRowProps {
  index: number;
  title: string;
  /** e.g. "Ø700mm · 22m" — omitted entirely when the caller has no spec to show. */
  subtitle?: string;
  /** Tints the numbered index badge — defaults to RIG, same as PileGroupCard. */
  track?: Track;
  /** Skips the row's bottom divider — pass for the last row in the group. */
  isLast?: boolean;
  /** Content shown at the row's right edge, e.g. a crane MachineBadge or reorder controls. */
  right?: React.ReactNode;
  /** Extra full-width content under the main row, e.g. a status pill. */
  below?: React.ReactNode;
  rowRef?: (el: View | null) => void;
}

export function PileGroupRow({ index, title, subtitle, track = 'RIG', isLast, right, below, rowRef }: PileGroupRowProps) {
  const meta = TRACK_META[track];
  return (
    <View ref={rowRef} style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.rowMain}>
        <View style={[styles.rowIndex, { backgroundColor: meta.soft }]}>
          <Text style={[styles.rowIndexText, { color: meta.color }]}>{String(index).padStart(2, '0')}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowCode} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={styles.rowSpec}>{subtitle}</Text>}
        </View>
        {right && <View style={styles.rowBadges}>{right}</View>}
      </View>
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerTitle: { ...typography.body, fontWeight: '700' },
  headerCount: { ...typography.caption, fontWeight: '700' },
  row: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowIndex: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIndexText: { ...typography.caption, fontWeight: '700' },
  rowBody: { flex: 1, minWidth: 0 },
  rowCode: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  rowSpec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  rowBadges: { flexDirection: 'row', gap: spacing.xs },
});
