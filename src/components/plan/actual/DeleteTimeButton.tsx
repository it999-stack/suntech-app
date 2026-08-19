// src/components/plan/actual/DeleteTimeButton.tsx
//
// Small trash-icon affordance for clearing an already-logged actual
// start/end time, sibling to EditTimeButton. Unlike EditTimeButton it needs
// no time picker — it just confirms via ConfirmDialog then fires a callback.

import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import { notify } from '@utils/notify';
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleConfirmClear() {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : `Could not clear the ${label}. Please try again.`, {
        title: 'Failed to clear',
      });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Pressable
        style={styles.btn}
        disabled={busy}
        onPress={() => setConfirmOpen(true)}
        hitSlop={8}
        accessibilityLabel={`Clear ${label}`}
      >
        <Trash2 size={14} color={colors.danger} />
      </Pressable>

      <ConfirmDialog
        visible={confirmOpen}
        title="Clear time?"
        message={`This will remove the logged ${label}.${cascadeWarning ? ` ${cascadeWarning}` : ''}`}
        confirmLabel="Clear"
        destructive
        confirmDisabled={busy}
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
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
