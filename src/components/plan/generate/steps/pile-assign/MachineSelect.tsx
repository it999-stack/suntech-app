// src/components/plan/generate/steps/pile-assign/MachineSelect.tsx
//
// Inline full-width row picker for a single rig/crane field. Renders every
// option as a tappable row in normal document flow — no dropdown, no
// absolute positioning, nothing that can get clipped or hidden by a
// parent modal's rounded/overflow:hidden sheet. Rows (not fixed-size tiles)
// so the full machine number is always visible, however long it is.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, Drill, Forklift, Wind, X, type LucideIcon } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { SimpleMachine } from './types';

export type MachineSelectKind = 'rig' | 'crane' | 'compressor';

interface MachineSelectProps {
  label: string;
  kind: MachineSelectKind;
  options: SimpleMachine[];
  valueId: string | null;
  onSelect: (id: string) => void;
  /** Shows an unassign ("X") button on the active row instead of the usual
   * check mark — same pattern as PersonnelPickerList's onUnassign. Only
   * meaningful for an optional field (e.g. Crane), never passed for a
   * mandatory Rig picker. */
  onClear?: () => void;
}

const MACHINE_ICON: Record<MachineSelectKind, LucideIcon> = {
  rig: Drill,
  crane: Forklift,
  compressor: Wind,
};

export default function MachineSelect({ label, kind, options, valueId, onSelect, onClear }: MachineSelectProps) {
  const Icon = MACHINE_ICON[kind];
  const kindColor = colors.machines[kind].color;
  const kindSoft = colors.machines[kind].soft;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.emptyText}>None active.</Text>
      ) : (
        <View style={styles.list}>
          {options.map((o) => {
            const active = o.id === valueId;
            return (
              <Pressable
                key={o.id}
                style={[
                  styles.row,
                  active ? [styles.rowActive, { borderColor: kindColor, backgroundColor: kindSoft }] : styles.rowInactive,
                ]}
                onPress={() => onSelect(o.id)}
              >
                <Icon size={22} color={active ? kindColor : colors.textSecondary} />
                <Text
                  style={[styles.rowText, active ? { color: kindColor } : styles.rowTextInactive]}
                  numberOfLines={2}
                >
                  {o.machineNo}
                </Text>
                {active && (
                  onClear ? (
                    <Pressable hitSlop={10} style={styles.unassignBtn} onPress={onClear}>
                      <X size={16} color={colors.danger} />
                    </Pressable>
                  ) : (
                    <Check size={18} color={kindColor} />
                  )
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  list: { flexDirection: 'column', gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  rowInactive: {
    borderColor: 'rgba(28,28,46,0.15)',
    backgroundColor: 'rgba(28,28,46,0.05)',
    borderStyle: 'dashed',
  },
  rowActive: {},
  rowText: { ...typography.body, fontSize: 13, fontWeight: '700', flex: 1 },
  rowTextInactive: { color: colors.textSecondary },
  unassignBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
