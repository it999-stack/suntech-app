// src/components/plan/actual/DeleteTimeButton.tsx
//
// Small trash-icon affordance for clearing an already-logged actual
// start/end time, sibling to EditTimeButton. Unlike EditTimeButton it needs
// no time picker — it just confirms via ConfirmDialog then fires a callback.

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react-native';
import Button from '@components/shared/Button';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import { notify } from '@utils/notify';
import { colors } from '@theme/theme';

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
  // See EditTimeButton's identical hasOpenedPicker — every completed step
  // renders its own DeleteTimeButton (x2), each capable of opening a
  // ConfirmDialog (which sets up its own AppModal/Reanimated state on
  // mount). Mounting it lazily on first open avoids paying that cost for
  // every closed instance up front.
  const [hasOpenedConfirm, setHasOpenedConfirm] = useState(false);

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
      <Button
        icon={Trash2}
        variant="secondary"
        size="sm"
        iconColor={colors.danger}
        disabled={busy}
        hitSlop={8}
        accessibilityLabel={`Clear ${label}`}
        onPress={() => {
          setHasOpenedConfirm(true);
          setConfirmOpen(true);
        }}
      />

      {hasOpenedConfirm && (
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
      )}
    </>
  );
}

