// src/components/plan/generate/steps/pile-assign/MachineSelect.tsx
//
// Inline full-width row picker for a single rig/crane field. Renders every
// option as a tappable row in normal document flow — no dropdown, no
// absolute positioning, nothing that can get clipped or hidden by a
// parent modal's rounded/overflow:hidden sheet. Rows (not fixed-size tiles)
// so the full machine number is always visible, however long it is.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, Drill, Forklift, Wind, type LucideIcon } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { SimpleMachine } from './types';

export type MachineSelectKind = 'rig' | 'crane' | 'compressor';

interface MachineSelectProps {
  label: string;
  kind: MachineSelectKind;
  options: SimpleMachine[];
  valueId: string | null;
  onSelect: (id: string) => void;
}

const MACHINE_ICON: Record<MachineSelectKind, LucideIcon> = {
  rig: Drill,
  crane: Forklift,
  compressor: Wind,
};

export default function MachineSelect({ label, kind, options, valueId, onSelect }: MachineSelectProps) {
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
                {active && <Check size={18} color={kindColor} />}
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
    borderColor: colors.border,
    backgroundColor: colors.glassFill,
    opacity: 0.55,
  },
  // borderColor/backgroundColor are set inline per row from colors.machines[kind]
  // (rig/crane/compressor each have their own identity color, matching the
  // same badges used in PilesAccordion.tsx and pileTableColumns.tsx).
  rowActive: {},
  rowText: { ...typography.body, fontSize: 13, fontWeight: '700', flex: 1 },
  rowTextInactive: { color: colors.textSecondary },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
