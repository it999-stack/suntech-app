// src/components/shared/TileSelect.tsx
//
// One selectable icon+label tile, meant to sit inside a TileGroup grid.
// No checkmark on selection — the selected state is conveyed purely by a
// solid border/icon color plus a soft background, both passed in by the
// caller (e.g. TRACK_META in helpers.ts for the machine rig/crane/
// compressor color scheme). Unselected tiles get a neutral dashed look.

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface TileSelectProps {
  icon: LucideIcon;
  label: string;
  selected: boolean;
  /** Solid color used for the selected border and icon. */
  color: string;
  /** Soft background color used when selected. */
  soft: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function TileSelect({ icon: Icon, label, selected, color, soft, onPress, disabled }: TileSelectProps) {
  return (
    <Pressable
      style={[
        styles.tile,
        selected ? { borderColor: color, backgroundColor: soft } : styles.tileInactive,
        disabled && styles.tileDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Icon size={24} color={selected ? color : colors.textSecondary} />
      <Text style={[styles.label, { color: selected ? color : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tileInactive: {
    borderColor: 'rgba(28,28,46,0.15)',
    backgroundColor: 'rgba(28,28,46,0.05)',
    borderStyle: 'solid',
  },
  tileDisabled: {
    opacity: 0.4,
  },
  label: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
