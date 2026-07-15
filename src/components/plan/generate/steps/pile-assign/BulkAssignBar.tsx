// src/components/plan/generate/steps/pile-assign/BulkAssignBar.tsx
//
// Appears once at least one pile is selected. Stays a compact single row —
// "Assign machines" opens a modal with rig/crane chip pickers, so the pile
// list below never gets pushed out of view.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
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
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.selectedText}>{selectedCount} selected</Text>
        <View style={styles.actions}>
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable style={styles.assignButton} onPress={onTogglePanel}>
            <Text style={styles.assignButtonText}>Assign machines</Text>
          </Pressable>
        </View>
      </View>

      <AppModal
        visible={panelOpen}
        onClose={onTogglePanel}
        title="Assign machines"
        subtitle={`${selectedCount} ${selectedCount === 1 ? 'pile' : 'piles'} selected`}
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
          <Check size={14} color="#fff" />
          <Text style={styles.applyButtonText}>Apply to {selectedCount}</Text>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.lg ?? 16, padding: spacing.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedText: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg ?? spacing.md },
  clearText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  assignButton: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  assignButtonText: { ...typography.caption, fontWeight: '700', color: '#fff' },

  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },

  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  applyButtonDisabled: { opacity: 0.4 },
  applyButtonText: { ...typography.caption, fontWeight: '700', color: '#fff' },
});