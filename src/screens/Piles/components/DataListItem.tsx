// src/screens/Piles/components/DataListItem.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ruler, SeparatorVertical, MapPin, Calendar, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import Badge from '@components/shared/Badge';
import { formatShortDate } from '@utils/formatTime';
import type { PileWithStatus } from '@repositories/pilesRepository';
import { STATUS_META } from './types';

interface DataListItemProps {
  pile: PileWithStatus;
  onPress: () => void;
}

function statusDateLabel(pile: PileWithStatus): string | null {
  if (!pile.statusDate) return null;
  const date = formatShortDate(pile.statusDate);
  if (pile.status === 'COMPLETED') return `Completed on ${date}`;
  if (pile.status === 'IN_PROGRESS') return `Started on ${date}`;
  return `Planned for ${date}`;
}

export default function DataListItem({ pile, onPress }: DataListItemProps) {
  const meta = STATUS_META[pile.status];
  const dateLabel = statusDateLabel(pile);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.identityRow}>
          <View style={[styles.avatar, { backgroundColor: meta.softColor }]}>
            <Text style={[styles.avatarText, { color: meta.color }]} numberOfLines={1}>
              {pile.pileIdCode}
            </Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>Pile ID</Text>
            <Text style={styles.code}>{pile.pileIdCode}</Text>
          </View>
        </View>
        <Badge text={meta.label} textColor={meta.color} bgColor={meta.softColor} icon={meta.icon} fontSize={11} uppercase={false} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ruler size={18} color={colors.textSecondary} />
          <View>
            <Text style={styles.metaLabel}>Diameter</Text>
            <Text style={styles.metaValue}>{pile.dia} mm</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.metaItem}>
          <SeparatorVertical size={18} color={colors.textSecondary} />
          <View>
            <Text style={styles.metaLabel}>Depth</Text>
            <Text style={styles.metaValue}>{pile.depth} m</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.metaItem}>
          <MapPin size={18} color={colors.textSecondary} />
          <View>
            <Text style={styles.metaLabel}>Area</Text>
            <Text style={styles.metaValue}>{pile.area ?? '—'}</Text>
          </View>
        </View>
      </View>

      {dateLabel && (
        <View style={styles.dateRow}>
          <View style={styles.metaItem}>
            <Calendar size={12} color={colors.textSecondary} />
            <Text style={styles.dateText}>{dateLabel}</Text>
          </View>
          <ChevronRight size={16} color={colors.textSecondary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.soft,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  avatar: {
    minWidth: 44,
    paddingHorizontal: spacing.xs,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.caption, fontWeight: '700', fontSize: 11 },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  code: { ...typography.cardTitle, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  divider: { width: 1, height: 20, backgroundColor: colors.glassBorder, marginHorizontal: spacing.sm },
  metaLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 1 },
  metaValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.06)',
  },
  dateText: { ...typography.caption, color: colors.textSecondary },
});
