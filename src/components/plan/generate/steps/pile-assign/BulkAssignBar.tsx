// src/components/plan/generate/steps/pile-assign/BulkAssignBar.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, X, SquareCheckBig, Eraser } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@/theme/theme';
import MachineSelect from './MachineSelect';
import type { SimpleMachine } from './types';

interface BulkAssignBarProps {
  selectedCount: number;
  onClear: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  rigId: string | null;
  craneId: string | null;
  onSelectRig: (id: string) => void;
  onSelectCrane: (id: string) => void;
  defaulted: boolean;
  onApply: () => void;
  onUnassign: () => void;
  unassignDisabled: boolean;
}

export default function BulkAssignBar({
  selectedCount, onClear, panelOpen, onTogglePanel,
  rigs, cranes, rigId, craneId, onSelectRig, onSelectCrane,
  defaulted, onApply, onUnassign, unassignDisabled,
}: BulkAssignBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.label}>{selectedCount} {selectedCount === 1 ? 'pile' : 'piles'} selected</Text>
      </View>

      <View style={styles.right}>
        <Pressable style={styles.clearBtn} onPress={onClear} hitSlop={spacing.sm}>
          <X size={17} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          style={[styles.unassignButton, unassignDisabled && styles.unassignButtonDisabled]}
          onPress={onUnassign}
          disabled={unassignDisabled}
        >
          <Eraser size={17} color={colors.white} />
          <Text style={styles.unassignButtonText}>Unassign</Text>
        </Pressable>
        <Pressable style={styles.assignButton} onPress={onTogglePanel}>
          <SquareCheckBig size={17} color={colors.white} />
          <Text style={styles.assignButtonText}>Assign</Text>
        </Pressable>
      </View>

      <AppModal
        visible={panelOpen}
        onClose={onTogglePanel}
        title="Assign machines"
        subtitle={`${selectedCount} ${selectedCount === 1 ? 'pile' : 'piles'} selected`}
        position="center"
      >
        {defaulted && (
          <Text style={styles.hint}>Defaulted to your last combination — change if needed.</Text>
        )}
        <MachineSelect label="Rig" kind="rig" options={rigs} valueId={rigId} onSelect={onSelectRig} />
        <MachineSelect label="Crane" kind="crane" options={cranes} valueId={craneId} onSelect={onSelectCrane} />
        <Pressable
          style={[styles.applyButton, (!rigId || !craneId) && styles.applyButtonDisabled]}
          onPress={onApply}
          disabled={!rigId || !craneId}
        >
          <Text style={styles.applyButtonText}>Apply to {selectedCount}</Text>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.caption, color: colors.textPrimary },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearBtn: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  assignButtonText: { ...typography.caption, fontWeight: '700', color: colors.white },
  unassignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  unassignButtonDisabled: { opacity: 0.4 },
  unassignButtonText: { ...typography.caption, fontWeight: '700', color: colors.white },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  applyButtonDisabled: { opacity: 0.4 },
  applyButtonText: { ...typography.buttonLabel, borderRadius: radius.xl, paddingHorizontal: spacing.md, fontWeight: '700', color: colors.white },
});