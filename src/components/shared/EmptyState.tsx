// src/components/shared/EmptyState.tsx
//
// Reusable empty / no-results state with icon, title, optional description,
// and an optional action button (e.g. "Go to Profile").

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import GlassCard from '@/components/shared/GlassCard';
import Button from '@/components/shared/Button';
import { colors, spacing, typography, radius } from '@/theme/theme';

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  bordered?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = 'inbox',
  title,
  message,
  bordered = true,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const content = (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.actionBtn} />
      ) : null}
    </View>
  );

  if (!bordered) return content;

  return (
    <GlassCard style={styles.card}>
      {content}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.lg,
  },
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typography.caption,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  actionBtn: { marginTop: spacing.md },
});