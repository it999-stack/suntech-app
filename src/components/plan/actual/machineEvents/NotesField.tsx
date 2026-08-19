// src/components/plan/actual/machineEvents/NotesField.tsx
//
// The "Notes" textarea shown in both MachineDownModal and MachineIdleModal.

import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { fieldTextStyles } from './sharedStyles';

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  /** Marks the label with a "*" — the caller still owns actual validation
   * (isValid/canSave), this is just the visual cue. */
  required?: boolean;
}

export default function NotesField({ value, onChange, placeholder = 'What happened?', required = false }: Props) {
  return (
    <>
      <Text style={[fieldTextStyles.fieldLabel, fieldTextStyles.fieldLabelSpaced]}>
        Notes{required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
      <TextInput
        style={styles.textarea}
        multiline
        numberOfLines={3}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChange}
        textAlignVertical="top"
      />
    </>
  );
}

const styles = StyleSheet.create({
  requiredMark: {
    color: colors.danger,
  },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 100,
    marginTop: spacing.sm,
    ...shadow.soft,
  },
});
