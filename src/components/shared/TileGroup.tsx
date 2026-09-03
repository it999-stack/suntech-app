// src/components/shared/TileGroup.tsx
//
// Wrapping grid of TileSelect tiles, up to N per row (default 3) — a floor,
// not a fixed count: each tile's width is content-based (flexBasis: 'auto',
// via flexGrow/flexShrink below, deliberately NOT the `flex: 1` shorthand,
// which would force flexBasis: 0 and defeat this), clamped to at least
// 100/columns% wide. A row of short labels still packs N per row same as
// before; a tile whose label needs more room to stay on one line claims
// that width for itself, so fewer tiles land on that row — no manual
// per-row column-count logic needed, plain flexbox wrap does it. Rows wrap
// and each row's tiles stretch to match its tallest tile (plain flexbox
// stretch on the wrapped line — no clamp/truncation on the label either, so
// a longer name grows the row instead of getting cut off), independent of
// any other TileGroup on screen.

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
  /** Tiles per row when every label is short enough to need no more —
   * see the file-header comment for how a long label can still bring this
   * down for its own row. Defaults to 3. */
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
  const minCellWidth = `${100 / columns}%` as DimensionValue;

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      {options.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.grid}>
          {options.map((o) => (
            <View key={o.id} style={[styles.cell, { minWidth: minCellWidth }]}>
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
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: spacing.xs / 2,
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
