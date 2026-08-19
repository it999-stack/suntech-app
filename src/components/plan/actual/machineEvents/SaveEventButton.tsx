// src/components/plan/actual/machineEvents/SaveEventButton.tsx
//
// The save button shown in MachineDownModal and MachineIdleModal. Dark
// text only on the amber "warning" fill (Start Idle / Report Breakdown's
// sibling); every other saturated fill (accent/danger/success) gets white
// text for contrast.

import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

type SaveEventButtonVariant = 'accent' | 'warning' | 'danger' | 'success';

interface Props {
  saving: boolean;
  canSave: boolean;
  onPress: () => void;
  label?: string;
  variant?: SaveEventButtonVariant;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
}

const VARIANT_BG: Record<SaveEventButtonVariant, string> = {
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

export default function SaveEventButton({
  saving,
  canSave,
  onPress,
  label = 'Save event',
  variant = 'accent',
  icon: Icon,
}: Props) {
  const textColor = variant === 'warning' ? colors.textPrimary : colors.white;

  return (
    <Pressable
      style={[styles.saveBtn, { backgroundColor: VARIANT_BG[variant] }, !canSave && styles.saveBtnDisabled]}
      disabled={!canSave}
      onPress={onPress}
    >
      {saving ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {Icon && <Icon size={16} color={textColor} />}
          <Text style={[styles.saveBtnText, { color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { ...typography.body, fontWeight: '700' },
});
