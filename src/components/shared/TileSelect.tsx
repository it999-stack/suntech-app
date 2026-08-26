// src/components/shared/TileSelect.tsx
//
// One selectable tile, meant to sit inside a TileGroup grid: the whole tile
// carries its machine type's soft tint (always, selected or not), with an
// icon on the left and the name (+ trailing rank suffix, if any) stacked to
// its right. No checkmark on selection — the selected state is conveyed
// purely by a solid colored border (both colors passed in by the caller,
// e.g. TRACK_META in helpers.ts for the rig/crane/compressor scheme).

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import Badge from './Badge';

/** A label's own name portion, under which it's short enough that a
 * trailing rank suffix ("1st", "2nd", …) can just sit inline on one line —
 * past this it moves to its own smaller line instead, so a long machine
 * name + suffix never gets cramped or wraps mid-word. */
const SHORT_NAME_THRESHOLD = 10;

/** Splits a label like "SANY 235 (1st)" or "SANY 108 - 1st" into its base
 * name and trailing rank suffix — either delimiter is recognized, always
 * normalized to the same "(suffix)" display. Returns no suffix for a plain
 * name with neither pattern (e.g. "R-1"). */
function splitTileLabel(label: string): { name: string; suffix?: string } {
  const match = label.match(/^(.*?)\s*(?:\(([^)]+)\)|-\s*([^-]+))\s*$/);
  if (!match) return { name: label.trim() };
  const suffix = (match[2] ?? match[3])?.trim();
  if (!suffix) return { name: label.trim() };
  return { name: match[1].trim(), suffix };
}

/** A small tappable status chip rendered in the tile's corner, independent
 * of the tile's own select tap target — e.g. a machine's real BREAKDOWN/IDLE
 * status, tappable to open a status-change picker, distinct from selecting
 * the tile itself. Stays tappable even when the tile is `disabled`. */
export interface TileStatusBadge {
  text: string;
  color: string;
  soft: string;
  onPress: () => void;
}

interface TileSelectProps {
  icon: LucideIcon;
  label: string;
  selected: boolean;
  color: string;
  soft: string;
  onPress: () => void;
  disabled?: boolean;
  statusBadge?: TileStatusBadge;
}

export default function TileSelect({
  icon: Icon,
  label,
  selected,
  color,
  soft,
  onPress,
  disabled,
  statusBadge,
}: TileSelectProps) {
  const { name, suffix } = splitTileLabel(label);
  const isLongName = name.length >= SHORT_NAME_THRESHOLD;
  const tint = { color: selected ? color : colors.textSecondary };

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
      <View style={[styles.iconWrap, { backgroundColor: soft }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={styles.textWrap}>
        {suffix && isLongName ? (
          <>
            <Text style={[styles.label, tint]} numberOfLines={1} ellipsizeMode="tail">
              {name.toUpperCase()}
            </Text>
            <Text style={styles.labelSuffix} numberOfLines={1}>
              ({suffix})
            </Text>
          </>
        ) : (
          <Text style={[styles.label, tint]} numberOfLines={1} ellipsizeMode="tail">
            {name.toUpperCase()}{suffix ? ` (${suffix})` : ''}
          </Text>
        )}
        {statusBadge && (
          <Pressable onPress={statusBadge.onPress} hitSlop={6} style={styles.statusBadgeWrap}>
            <Badge text={statusBadge.text} textColor={statusBadge.color} bgColor={statusBadge.soft} fontSize={9} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  tileInactive: {
    borderColor: 'rgba(28,28,46,0.15)',
    borderStyle: 'solid',
  },
  tileDisabled: {
    opacity: 0.4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  statusBadgeWrap: {
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  label: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  labelSuffix: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
});
