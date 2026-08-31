// src/components/shared/InfoRow.tsx
//
// Generic full-width row: a leading visual (avatar/icon), a title + caption
// pair, and an optional trailing element — tappable when `onPress` is given.
// Extracted from CoreTeamCard's TeamPersonRow so machine rows
// (PilesCard) and personnel rows (CoreTeamCard) share one shell
// instead of two near-duplicate implementations.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { hexToRgba } from '@/utils/helpers';

export interface InfoRowProps {
  /** Caller-built leading visual — e.g. <Avatar name=.../> or <Avatar icon={...}/>. */
  leading: React.ReactNode;
  /** Already-resolved primary text (e.g. "None assigned" resolved by the caller). */
  title: string;
  /** Italic/secondary styling for an empty/unassigned state. */
  titleMuted?: boolean;
  /** Already-resolved secondary text (designation, role label, a time string, etc.). */
  caption: string;
  tone?: 'neutral' | 'day' | 'night';
  /** A badge pill, a PencilLine icon, or nothing. */
  trailing?: React.ReactNode;
  /** When set, this row is themed off a single color (e.g. a machine's track
   * color) instead of `tone`: solid for the border, faded 12% for the
   * background — the same treatment everywhere a row needs to read as
   * "belonging to" a specific color, so callers never hand-roll the border/
   * background pair themselves. */
  accentColor?: string;
  onPress?: () => void;
}

export default function InfoRow({
  leading,
  title,
  titleMuted,
  caption,
  tone = 'neutral',
  trailing,
  accentColor,
  onPress,
}: InfoRowProps) {
  return (
    <Pressable
      style={[
        styles.row,
        tone === 'day' ? styles.rowDay : tone === 'night' ? styles.rowNight : styles.rowNeutral,
        accentColor ? { borderColor: accentColor, backgroundColor: hexToRgba(accentColor, 0.12) } : null,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      {leading}
      <View style={styles.info}>
        <Text style={[styles.title, titleMuted && styles.titleMuted]}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  rowNeutral: {
    backgroundColor: 'rgba(28,28,46,0.03)',
    borderColor: colors.border,
  },
  rowDay: {
    backgroundColor: 'rgba(249,115,22,0.05)',
    borderColor: 'rgba(249,115,22,0.15)',
  },
  rowNight: {
    backgroundColor: 'rgba(79,70,229,0.05)',
    borderColor: 'rgba(79,70,229,0.15)',
  },
  info: { flex: 1 },
  title: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  titleMuted: { color: colors.textSecondary, fontStyle: 'italic', fontWeight: '400' },
  caption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
