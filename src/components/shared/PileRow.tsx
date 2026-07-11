// src/components/shared/PileRow.tsx
//
// Reusable pile row used in PileAssignStep (main list + search modal).
// Displays pile code, dimensions, Rig/Crane tags, and an optional
// checkbox or check-mark when the row is part of a batch-selection flow.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, Square, CheckSquare } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';

// ─── PileTag ──────────────────────────────────────────────────────────────────

interface PileTagProps {
  label: string;
  value: string | null;
}

export function PileTag({ label, value }: PileTagProps) {
  return (
    <View style={[tagStyles.tag, value ? tagStyles.tagFilled : tagStyles.tagEmpty]}>
      <Text style={[tagStyles.tagText, value ? tagStyles.tagTextFilled : tagStyles.tagTextEmpty]}>
        {value ?? label}
      </Text>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  tag: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  tagFilled: { backgroundColor: colors.accentSoft },
  tagEmpty: { backgroundColor: 'rgba(28,28,46,0.05)' },
  tagText: { ...typography.caption, fontWeight: '600' },
  tagTextFilled: { color: colors.accent },
  tagTextEmpty: { color: colors.textSecondary },
});

// ─── PileRow ──────────────────────────────────────────────────────────────────

export interface PileRowItem {
  id: string;
  code: string;
  dia: number;
  depth: number;
}

interface PileRowProps {
  pile: PileRowItem;
  rigLabel: string | null;
  craneLabel: string | null;
  /** Row is fully assigned (both rig + crane set). */
  complete?: boolean;
  /** Row belongs to the currently-selected rig+crane pair. */
  highlighted?: boolean;
  /** Row is in the pending batch-selection set. */
  selected?: boolean;
  /** When false the row is dimmed and non-interactive. */
  enabled?: boolean;
  /** Show a checkbox (Square/CheckSquare) on the left side. */
  showCheckbox?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function PileRow({
  pile,
  rigLabel,
  craneLabel,
  complete = false,
  highlighted = false,
  selected = false,
  enabled = true,
  showCheckbox = false,
  onPress,
  disabled,
}: PileRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled ?? !enabled}
      style={[
        rowStyles.row,
        complete && !selected && rowStyles.rowComplete,
        highlighted && rowStyles.rowHighlighted,
        selected && rowStyles.rowSelected,
        !enabled && rowStyles.rowDisabled,
      ]}
    >
      {showCheckbox && (
        selected
          ? <CheckSquare size={18} color={colors.accent} />
          : <Square size={18} color={colors.textSecondary} />
      )}
      <View style={rowStyles.info}>
        <Text style={rowStyles.code}>{pile.code}</Text>
        <Text style={rowStyles.meta}>Ø{pile.dia}mm · {pile.depth}m</Text>
      </View>
      <PileTag label="Rig" value={rigLabel} />
      <PileTag label="Crane" value={craneLabel} />
      {highlighted && <Check size={16} color={colors.accent} style={{ marginLeft: spacing.xs }} />}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  rowComplete: {
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.05)',
  },
  rowHighlighted: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  rowDisabled: { opacity: 0.6 },
  info: { flex: 1 },
  code: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
