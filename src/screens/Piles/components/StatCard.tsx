// src/screens/Piles/components/StatCard.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

interface StatCardProps {
  label: string;
  value: number | null;
  color: string;
  softColor: string;
  icon: LucideIcon;
  onPress?: () => void;
  active?: boolean;
}

export default function StatCard({ label, value, color, softColor, icon: Icon, onPress, active }: StatCardProps) {
  return (
    <Pressable style={[styles.card, active && { borderColor: color }]} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: softColor }]}>
        <Icon size={16} color={color} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value ?? '—'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: colors.transparent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: 0,
    ...shadow.soft,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  label: { ...typography.caption, fontSize: 11, color: colors.textSecondary, paddingTop: spacing.sm },
  value: { ...typography.cardTitle, fontSize: 18, color: colors.textPrimary },
});
