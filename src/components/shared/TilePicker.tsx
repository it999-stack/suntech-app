// src/components/shared/TilePicker.tsx
//
// Sectioned tile picker — N labeled TileGroup sections (e.g. "Rigs" /
// "Cranes") sharing one single-selection. Adds no selection logic of its
// own: each section is just a TileGroup pointed at the same
// valueId/onSelect pair, so only one tile can ever read as selected at a
// time (option ids are assumed unique across every section). Sections with
// no options are hidden rather than shown empty, since a picker section
// that's structurally always empty for a given caller (e.g. "Cranes" when
// only Rigs are ever eligible) would otherwise sit there as dead clutter.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@theme/theme';
import TileGroup, { type TileGroupOption } from './TileGroup';

export interface TileSection {
  key: string;
  label: string;
  options: TileGroupOption[];
}

interface TilePickerProps {
  /** Optional heading shown once above every section (e.g. "Replacement"). */
  label?: string;
  sections: TileSection[];
  /** Single-select mode (existing behaviour). */
  valueId?: string | null;
  onSelect?: (id: string) => void;
  /** Multi-select mode — takes priority over valueId/onSelect when provided. */
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  /** Tiles per row, forwarded to every section's TileGroup. Defaults to 3. */
  columns?: number;
}

export default function TilePicker({
  label,
  sections,
  valueId,
  onSelect,
  selectedIds,
  onToggle,
  columns = 3,
}: TilePickerProps) {
  const visibleSections = sections.filter((s) => s.options.length > 0);

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      {visibleSections.map((section) => (
        <TileGroup
          key={section.key}
          label={section.label}
          options={section.options}
          valueId={valueId}
          onSelect={onSelect}
          selectedIds={selectedIds}
          onToggle={onToggle}
          columns={columns}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
});
