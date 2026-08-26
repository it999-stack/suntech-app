// src/screens/Home/fillActual/MachineActionPill.tsx
//
// One quick-action button in the machine card's "Log machine event" row
// (Breakdown / Start idle / End idle) — equal-width outlined rectangles
// (danger=red, outline=accent blue, primary=filled accent blue for the one
// "resolving" action, End idle) rather than small content-sized pills.

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
  const iconColor = variant === 'danger' ? colors.danger : variant === 'primary' ? colors.textInverse : colors.accentBlue;

  return (
    <Pressable
      style={[styles.actionPill, variantStyle, disabled && styles.actionPillDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <Icon size={16} color={iconColor} />
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  actionPillDisabled: {
    opacity: 0.4,
  },
  actionPillDanger: {
    backgroundColor: colors.transparent,
    borderColor: colors.danger,
  },
  actionPillDangerText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.danger,
  },
  actionPillOutline: {
    backgroundColor: colors.transparent,
    borderColor: colors.accentBlue,
  },
  actionPillOutlineText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.accentBlue,
  },
  actionPillPrimary: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  actionPillPrimaryText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textInverse,
  },
});
