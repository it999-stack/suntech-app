// src/components/plan/actual/DeleteTimeButton.tsx
//
// Small trash-icon affordance for clearing an already-logged actual
// start/end time, sibling to EditTimeButton. Unlike EditTimeButton it needs
// no time picker — it just confirms via Alert then fires a callback.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { colors, radius } from '@theme/theme';

interface Props {
  /** e.g. "start time" / "finish time" — used in the confirmation copy. */
  label: string;
  /** Extra sentence appended when clearing this field cascades to another (e.g. clearing start also clears finish). */
  cascadeWarning?: string;
  onConfirm: () => void | Promise<void>;
}

export default function DeleteTimeButton({ label, cascadeWarning, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);

  function handlePress() {
    Alert.alert(
      'Clear time?',
      `This will remove the logged ${label}.${cascadeWarning ? ` ${cascadeWarning}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (err) {
              Alert.alert(
                'Failed to clear',
                err instanceof Error ? err.message : `Could not clear the ${label}. Please try again.`,
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Pressable
      style={styles.btn}
      disabled={busy}
      onPress={handlePress}
      hitSlop={8}
      accessibilityLabel={`Clear ${label}`}
    >
      <Trash2 size={14} color={colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
