// src/components/plan/actual/machineEvents/useSaveMachineEvent.ts
//
// Owns the save-in-flight state and the shared save/error-handling flow for
// both MachineDownModal and MachineIdleModal — each just supplies its own
// validity check and how to build the LogMachineEventInput payload.

import { useState } from 'react';
import { Keyboard } from 'react-native';
import type { LogMachineEventInput } from '@state/PlanContext';
import { notify } from '@utils/notify';

export function useSaveMachineEvent(args: {
  isValid: boolean;
  buildInput: () => LogMachineEventInput;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
  onSaved: () => void;
}): { saving: boolean; canSave: boolean; handleSave: () => Promise<void> } {
  const { isValid, buildInput, onLogMachineEvent, onSaved } = args;
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    Keyboard.dismiss();
    setSaving(true);
    try {
      await onLogMachineEvent(buildInput());
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not log this event. Please try again.', {
        title: 'Failed to save',
      });
      setSaving(false);
    }
  }

  return { saving, canSave: isValid && !saving, handleSave };
}
