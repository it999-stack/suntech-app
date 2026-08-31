// src/components/plan/generate/steps/pile-assign/BulkAssignBar.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SquareCheckBig, Eraser } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@/theme/theme';
import MachineAssignPanel from './MachineAssignPanel';
import type { SimpleMachine } from './types';

// Solid form of colors.accentSoft's base rgb — same indigo, full opacity, for
// the Assign button. Mirrors the ACCENT_SOLID convention already used
// elsewhere in the plan flow (ResumeConfirmStep.tsx, LocationSelectStep.tsx,
// PileAssignStep.tsx's own info card).
const ACCENT_SOLID = '#5B5FEF';

// The "View assigned piles" button used to live here, scoped to the checkbox
// selection — it's moved up to PileAssignStep's info card (now shows every
// assigned pile in the plan, not just the selection). See PileAssignStep.tsx's
// allAssignedPiles/viewAssignedOpen.

interface BulkAssignBarProps {
  selectedCount: number;
  /** Comma-joined preview of the selected piles' codes (already capped/"+N more"'d by the caller). */
  selectedCodesLabel: string;
  onClear: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  rigId: string | null;
  craneId: string | null;
  onSelectRig: (id: string) => void;
  onSelectCrane: (id: string | null) => void;
  onApply: () => void;
  onUnassign: () => void;
  unassignDisabled: boolean;
}

export default function BulkAssignBar({
  selectedCount, selectedCodesLabel, onClear, panelOpen, onTogglePanel,
  rigs, cranes, rigId, craneId, onSelectRig, onSelectCrane,
  onApply, onUnassign, unassignDisabled,
}: BulkAssignBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{selectedCount}</Text>
        </View>
        <View style={styles.leftTextWrap}>
          <View style={styles.leftTitleRow}>
            <Text style={styles.label}>{selectedCount === 1 ? 'pile' : 'piles'} selected</Text>
            <Pressable onPress={onClear} hitSlop={spacing.sm} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>×</Text>
            </Pressable>
          </View>
          {selectedCodesLabel ? (
            <Text style={styles.codesLabel} numberOfLines={1}>{selectedCodesLabel}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.right}>
        <Pressable
          style={[styles.unassignButton, unassignDisabled && styles.unassignButtonDisabled]}
          onPress={onUnassign}
          disabled={unassignDisabled}
        >
          <Eraser size={16} color={colors.danger} />
          <Text style={styles.unassignButtonText}>Unassign</Text>
        </Pressable>
        <Pressable style={styles.assignButton} onPress={onTogglePanel}>
          <SquareCheckBig size={16} color={ACCENT_SOLID} />
          <Text style={styles.assignButtonText}>Assign</Text>
        </Pressable>
      </View>

      <AppModal
        visible={panelOpen}
        onClose={onTogglePanel}
        title="Assign machines"
        subtitle={`${selectedCount} ${selectedCount === 1 ? 'pile' : 'piles'} selected`}
        position="bottom"
      >
        <MachineAssignPanel
          rigs={rigs}
          cranes={cranes}
          rigId={rigId}
          craneId={craneId}
          onSelectRig={onSelectRig}
          onSelectCrane={onSelectCrane}
          onApply={onApply}
          applyLabel={`Apply to ${selectedCount}`}
        />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT_SOLID,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { ...typography.caption, fontWeight: '800', color: colors.white },
  leftTextWrap: { flex: 1, minWidth: 0 },
  leftTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  codesLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { fontSize: 13, lineHeight: 15, color: colors.textSecondary, fontWeight: '700' },
  divider: { width: 1, height: 32, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: ACCENT_SOLID,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  assignButtonText: { ...typography.caption, fontWeight: '700', color: ACCENT_SOLID },
  unassignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  unassignButtonDisabled: { opacity: 0.4 },
  unassignButtonText: { ...typography.caption, fontWeight: '700', color: colors.danger },
});
