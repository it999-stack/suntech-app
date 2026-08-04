// src/components/plan/generate/steps/pile-assign/MachineSelect.tsx
//
// Inline square-tile picker for a single rig/crane field. Renders every
// option as a tappable tile in normal document flow — no dropdown, no
// absolute positioning, nothing that can get clipped or hidden by a
// parent modal's rounded/overflow:hidden sheet.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Drill, Forklift, Wind, type LucideIcon } from 'lucide-react-native';
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

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.emptyText}>None active.</Text>
      ) : (
        <View style={styles.tileRow}>
          {options.map((o) => {
            const active = o.id === valueId;
            return (
              <Pressable
                key={o.id}
                style={[styles.tile, active ? styles.tileActive : styles.tileInactive]}
                onPress={() => onSelect(o.id)}
              >
                <Icon size={26} color={active ? colors.white : colors.textSecondary} />
                <Text style={[styles.tileText, active ? styles.tileTextActive : styles.tileTextInactive]} numberOfLines={1}>
                  {o.machineNo}
                </Text>
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
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileInactive: {
    borderColor: colors.border,
    backgroundColor: colors.glassFill,
    opacity: 0.55,
  },
  tileActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  tileText: { ...typography.body, fontSize: 13, fontWeight: '700' },
  tileTextInactive: { color: colors.textSecondary },
  tileTextActive: { color: colors.white },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
