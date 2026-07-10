// src/components/plan/generate/preview/SummaryRow.tsx
//
// Secondary card row used in the preview step. Shows an icon, title, detail
// text, and a trailing eye button that navigates back to a wizard step.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Eye } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@/theme/theme';

interface SummaryRowProps {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onView: () => void;
  tone?: 'default' | 'warning';
}

export default function SummaryRow({ icon, title, detail, onView, tone = 'default' }: SummaryRowProps) {
  return (
    <GlassCard style={styles.rowCard} innerStyle={styles.rowCardInner}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowDetail, tone === 'warning' && styles.rowDetailWarning]}>
          {detail}
        </Text>
      </View>
      <Pressable
        style={styles.eyeBtn}
        onPress={onView}
        hitSlop={8}
        accessibilityLabel={`View ${title.toLowerCase()} step`}
      >
        <Eye size={16} color={colors.textSecondary} />
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  rowCard: { marginBottom: spacing.sm },
  rowCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowIcon: { width: 24, alignItems: 'center' },
  rowInfo: { flex: 1 },
  rowTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowDetailWarning: { color: colors.warning },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
});