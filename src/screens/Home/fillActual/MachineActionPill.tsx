// src/screens/Home/fillActual/MachineActionPill.tsx
//
// One quick-action chip in the machine card's "Log machine event" row
// (Breakdown / Start idle / End idle) — sized to its content, three color
// treatments.

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

type ActionPillVariant = 'danger' | 'outline' | 'primary';

export default function MachineActionPill({
  icon: Icon,
  label,
  variant,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  variant: ActionPillVariant;
  disabled?: boolean;
  onPress: () => void;
}) {
  const variantStyle =
    variant === 'danger' ? styles.actionPillDanger : variant === 'primary' ? styles.actionPillPrimary : styles.actionPillOutline;
  const textStyle =
    variant === 'danger'
      ? styles.actionPillDangerText
      : variant === 'primary'
        ? styles.actionPillPrimaryText
        : styles.actionPillOutlineText;
  const iconColor = variant === 'danger' ? colors.danger : variant === 'primary' ? colors.textInverse : colors.textSecondary;

  return (
    <Pressable
      style={[styles.actionPill, variantStyle, disabled && styles.actionPillDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <Icon size={15} color={iconColor} />
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionPillDisabled: {
    opacity: 0.4,
  },
  actionPillDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  actionPillDangerText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.danger,
  },
  actionPillOutline: {
    backgroundColor: colors.glassFillStrong,
    borderColor: colors.border,
  },
  actionPillOutlineText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  actionPillPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionPillPrimaryText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textInverse,
  },
});
