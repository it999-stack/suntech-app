// src/components/shared/ConfirmDialog.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import { colors, spacing, typography } from '@theme/theme';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  // Tracks which button the user tapped, so that one shows a spinner while
  // its handler is in flight and both are disabled to prevent a double-tap.
  const [pending, setPending] = useState<'confirm' | 'cancel' | null>(null);

  useEffect(() => {
    if (!visible) setPending(null);
  }, [visible]);

  async function runCancel() {
    if (pending) return;
    setPending('cancel');
    try {
      await onCancel();
    } finally {
      setPending(null);
    }
  }

  async function runConfirm() {
    if (pending) return;
    setPending('confirm');
    try {
      await onConfirm();
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <AppModal visible={visible} onClose={runCancel} position="center" scrollable={false} avoidKeyboard={false}>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.row}>
          <Button
            label={cancelLabel}
            variant="secondary"
            loading={pending === 'cancel'}
            disabled={busy}
            onPress={runCancel}
            style={styles.btn}
          />
          <Button
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            loading={pending === 'confirm'}
            disabled={confirmDisabled || busy}
            onPress={runConfirm}
            style={styles.btn}
          />
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  message: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1 },
});
