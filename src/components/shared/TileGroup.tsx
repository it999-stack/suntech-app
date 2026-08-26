// src/components/shared/TileGroup.tsx
//
// Wrapping grid of TileSelect tiles, N per row (default 3). Rows wrap and
// each row's tiles stretch to match its tallest tile (plain flexbox stretch
// on the wrapped line — no clamp/truncation on the label, so a longer name
// grows the row instead of getting cut off), independent of any other
// TileGroup on screen.

import React from 'react';
import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, spacing, typography } from '@theme/theme';
import TileSelect, { type TileStatusBadge } from './TileSelect';

export interface TileGroupOption {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  soft: string;
  disabled?: boolean;
  statusBadge?: TileStatusBadge;
}

interface TileGroupProps {
  label?: string;
  options: TileGroupOption[];
  /** Single-select mode (existing behaviour). */
  valueId?: string | null;
  onSelect?: (id: string) => void;
  /** Multi-select mode — takes priority over valueId/onSelect when provided. */
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  emptyText?: string;
  /** Tiles per row. Defaults to 3. */
  columns?: number;
}

export default function TileGroup({
  label,
  options,
  valueId = null,
  onSelect,
  selectedIds,
  onToggle,
  emptyText = 'None active.',
  columns = 3,
}: TileGroupProps) {
  const cellWidth = `${100 / columns}%` as DimensionValue;

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      {options.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.grid}>
          {options.map((o) => (
            <View key={o.id} style={[styles.cell, { width: cellWidth }]}>
              <TileSelect
                icon={o.icon}
                label={o.label}
                selected={selectedIds ? selectedIds.includes(o.id) : o.id === valueId}
                color={o.color}
                soft={o.soft}
                disabled={o.disabled}
                statusBadge={o.statusBadge}
                onPress={() => (onToggle ? onToggle(o.id) : onSelect?.(o.id))}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs / 2,
  },
  cell: {
    paddingHorizontal: spacing.xs / 2,
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
