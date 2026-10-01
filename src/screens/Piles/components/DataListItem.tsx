// src/screens/Piles/components/DataListItem.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ruler, MapPin, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import Badge from '@components/shared/Badge';
import type { PileWithStatus } from '@repositories/pilesRepository';
import { STATUS_META } from './types';

interface DataListItemProps {
  pile: PileWithStatus;
  onPress: () => void;
}

export default function DataListItem({ pile, onPress }: DataListItemProps) {
  const meta = STATUS_META[pile.status];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: meta.softColor }]}>
          <Text style={[styles.avatarText, { color: meta.color }]} numberOfLines={1}>
            {pile.pileIdCode}
          </Text>
        </View>
        <Badge text={meta.label} textColor={colors.textSecondary} bgColor={colors.glassBorder} icon={meta.icon} fontSize={10} uppercase={false} />
      </View>

      <View style={styles.body}>
        <View style={styles.metaColumn}>
          <View style={styles.metaItem}>
            <Ruler size={18} color={colors.textSecondary} />
            <View style={styles.metaText}>
              <Text style={styles.metaValue} numberOfLines={1}>{pile.dia} mm × {pile.depth} m</Text>
              <Text style={styles.metaLabel}>Dimension</Text>
            </View>
          </View>
          <View style={styles.metaItem}>
            <MapPin size={18} color={colors.textSecondary} />
            <Text style={[styles.metaValue, styles.metaText]} numberOfLines={1}>{pile.locationName ?? '—'}</Text>
          </View>
        </View>
        <ChevronRight size={18} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48.5%', // two per row; pairs with space-between in DataList
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
    ...shadow.soft,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  avatar: {
    minWidth: 44,
    paddingHorizontal: spacing.xs,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.caption, fontWeight: '700', fontSize: 12 },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaColumn: { flex: 1, gap: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { flex: 1 },
  metaLabel: { ...typography.caption, color: colors.textSecondary },
  metaValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
