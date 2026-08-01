// src/components/plan/generate/steps/pile-assign/BulkAssignBar.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, X, Wrench } from 'lucide-react-native';
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
}

export default function BulkAssignBar({
  selectedCount, onClear, panelOpen, onTogglePanel,
  rigs, cranes, rigId, craneId, onSelectRig, onSelectCrane,
  defaulted, onApply,
}: BulkAssignBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.label}>{selectedCount} {selectedCount === 1 ? 'pile' : 'piles'} selected</Text>
      </View>

      <View style={styles.right}>
        <Pressable style={styles.clearBtn} onPress={onClear} hitSlop={spacing.sm}>
          <X size={15} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.assignButton} onPress={onTogglePanel}>
          <Wrench size={14} color={colors.white} />
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
        <MachineSelect label="Rig" options={rigs} valueId={rigId} onSelect={onSelectRig} />
        <MachineSelect label="Crane" options={cranes} valueId={craneId} onSelect={onSelectCrane} />
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.caption, color: colors.textPrimary },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  assignButtonText: { ...typography.caption, fontWeight: '700', color: colors.white },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  applyButtonDisabled: { opacity: 0.4 },
  applyButtonText: { ...typography.caption, borderRadius: radius.xl, paddingHorizontal: spacing.md, fontWeight: '700', color: colors.white },
});