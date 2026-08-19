// src/components/plan/generate/steps/pile-assign/MachineAssignPanel.tsx
//
// Rig + Crane picker panel (with Apply button) — the body previously inlined
// inside BulkAssignBar's modal. Extracted so both the bulk pile-assign flow
// and a single-pile reassignment flow (Preview step) share the exact same
// picker instead of duplicating it.

import React from 'react';
import { ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
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
      <Pressable
        style={[styles.applyButton, (!rigId || isApplying) && styles.applyButtonDisabled]}
        onPress={onApply}
        disabled={!rigId || isApplying}
      >
        {isApplying ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.applyButtonText}>{applyLabel}</Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  applyButtonDisabled: { opacity: 0.4 },
  applyButtonText: { ...typography.buttonLabel, borderRadius: radius.xl, paddingHorizontal: spacing.md, fontWeight: '700', color: colors.white },
});
