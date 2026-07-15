// src/components/plan/actual/RemarksModal.tsx

import React, { useState, useEffect } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Keyboard, View } from 'react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@theme/theme';

interface Props {
  visible: boolean;
  stepName: string;
  initialValue?: string;
  onClose: () => void;
  onSave: (text: string) => void;
}

export default function RemarksModal({ visible, stepName, initialValue, onClose, onSave }: Props) {
  const [text, setText] = useState(initialValue ?? '');

  useEffect(() => {
    if (visible) setText(initialValue ?? '');
  }, [visible, initialValue]);

  if (!visible) return null;

  return (
    <AppModal visible={visible} onClose={onClose} title="Remarks" subtitle={stepName}>
      <View style={styles.content}>
        <TextInput
          style={styles.textarea}
          multiline
          numberOfLines={5}
          placeholder="Add a note for this step…"
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          textAlignVertical="top"
          autoFocus
        />
        <Pressable
          style={[styles.addBtn, !text.trim() && styles.addBtnDisabled]}
          disabled={!text.trim()}
          onPress={() => {
            Keyboard.dismiss();
            onSave(text.trim());
            onClose();
          }}
        >
          <Text style={styles.addBtnText}>Add Remarks</Text>
        </Pressable>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 120,
  },
  addBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});