// src/components/shared/ConfirmDialog.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@theme/theme';

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
          <Pressable
            style={[styles.btn, styles.cancelBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={runCancel}
          >
            {pending === 'cancel' ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            )}
          </Pressable>
          <Pressable
            style={[
              styles.btn,
              destructive ? styles.dangerBtn : styles.confirmBtn,
              (confirmDisabled || busy) && styles.btnDisabled,
            ]}
            disabled={confirmDisabled || busy}
            onPress={runConfirm}
          >
            {pending === 'confirm' ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  message: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.sm + 4, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  cancelBtn: { backgroundColor: 'rgba(28,28,46,0.06)' },
  cancelText: { ...typography.buttonLabel, color: colors.textSecondary },
  confirmBtn: { backgroundColor: colors.accent },
  dangerBtn: { backgroundColor: colors.danger },
  confirmText: { ...typography.buttonLabel, color: colors.textInverse },
});
