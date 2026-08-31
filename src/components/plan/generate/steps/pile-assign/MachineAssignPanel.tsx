// src/components/plan/generate/steps/pile-assign/MachineAssignPanel.tsx
//
// Rig + Crane picker panel (with Apply button) — the body previously inlined
// inside BulkAssignBar's modal. Extracted so both the bulk pile-assign flow
// and a single-pile reassignment flow (Preview step) share the exact same
// picker instead of duplicating it.

import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '@/theme/theme';
import Button from '@components/shared/Button';
import MachineSelect from './MachineSelect';
import type { SimpleMachine } from './types';

interface MachineAssignPanelProps {
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  rigId: string | null;
  craneId: string | null;
  onSelectRig: (id: string) => void;
  onSelectCrane: (id: string | null) => void;
  onApply: () => void;
  applyLabel: string;
  /** Shows a spinner in place of the label and disables the button — e.g. while
   * a caller-owned recompute triggered by Apply is still in flight. */
  isApplying?: boolean;
}

export default function MachineAssignPanel({
  rigs, cranes, rigId, craneId, onSelectRig, onSelectCrane, onApply, applyLabel, isApplying = false,
}: MachineAssignPanelProps) {
  return (
    <>
      <MachineSelect label="Rig" kind="rig" options={rigs} valueId={rigId} onSelect={onSelectRig} />
      <MachineSelect
        label="Crane (optional)"
        kind="crane"
        options={cranes}
        valueId={craneId}
        onSelect={onSelectCrane}
        onClear={() => onSelectCrane(null)}
      />
      <Button
        label={applyLabel}
        loading={isApplying}
        disabled={!rigId || isApplying}
        onPress={onApply}
        style={styles.applyButton}
      />
    </>
  );
}

const styles = StyleSheet.create({
  applyButton: { marginTop: spacing.sm },
});
