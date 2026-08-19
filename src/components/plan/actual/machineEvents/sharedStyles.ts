// src/components/plan/actual/machineEvents/sharedStyles.ts
//
// Text styles reused across the history list, track toggle, event-type
// label, and notes field in both MachineDownModal and MachineIdleModal.

import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@theme/theme';

export const fieldTextStyles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  fieldLabelSpaced: { marginTop: spacing.md },
});
