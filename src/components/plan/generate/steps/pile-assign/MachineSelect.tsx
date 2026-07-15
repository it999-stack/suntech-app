// src/components/plan/generate/steps/pile-assign/MachineSelect.tsx
//
// Inline chip-style picker for a single rig/crane field. Renders every
// option as a tappable chip in normal document flow — no dropdown, no
// absolute positioning, nothing that can get clipped or hidden by a
// parent modal's rounded/overflow:hidden sheet.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { SimpleMachine } from './types';

interface MachineSelectProps {
  label: string;
  options: SimpleMachine[];
  valueId: string | null;
  onSelect: (id: string) => void;
}

export default function MachineSelect({ label, options, valueId, onSelect }: MachineSelectProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.emptyText}>None active.</Text>
      ) : (
        <View style={styles.chipRow}>
          {options.map((o) => {
            const active = o.id === valueId;
            return (
              <Pressable
                key={o.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onSelect(o.id)}
              >
                {active && <Check size={13} color={colors.white} style={styles.chipCheck} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.machineNo}</Text>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'rgba(28,28,46,0.15)',
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipCheck: { marginRight: -2 },
  chipText: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  chipTextActive: { color: colors.white },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});