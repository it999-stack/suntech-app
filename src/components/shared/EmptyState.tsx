// src/components/shared/EmptyState.tsx
//
// Reusable empty / no-results text. Centred italic caption.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme/theme';

interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});
