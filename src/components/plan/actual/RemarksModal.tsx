// src/components/plan/actual/RemarksModal.tsx

import React, { useState, useEffect } from 'react';
import { TextInput, StyleSheet, Keyboard, View } from 'react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography } from '@theme/theme';

interface Props {
  visible: boolean;
  stepName: string;
  initialValue?: string;
  onClose: () => void;
  onSave: (text: string) => void | Promise<void>;
}

export default function RemarksModal({ visible, stepName, initialValue, onClose, onSave }: Props) {
  const [text, setText] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);

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
        <Button
          label="Add Remarks"
          disabled={!text.trim() || saving}
          loading={saving}
          style={styles.addBtn}
          onPress={async () => {
            Keyboard.dismiss();
            setSaving(true);
            try {
              await onSave(text.trim());
              onClose();
            } catch (err) {
              notify.error(err instanceof Error ? err.message : 'Could not save this remark. Please try again.', {
                title: 'Failed to save',
              });
            } finally {
              setSaving(false);
            }
          }}
        />
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
  addBtn: { marginTop: spacing.md },
});