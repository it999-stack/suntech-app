// src/components/shared/MachineBadge.tsx
//
// Shared icon+text pill for "which machine" — colored border/soft background
// per track (RIG/CRANE/COMPRESSOR), or a muted dashed fallback (e.g. "Rig
// only"). Extracted from three byte-for-byte duplicate implementations
// (ResumeConfirmStep, pile-assign/pileTableColumns, PilesAccordion).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { TRACK_META } from '@/utils/helpers';

interface MachineBadgeProps {
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  label: string;
  /** Defaults to true; PilesAccordion's longer descriptive labels render text-only. */
  showIcon?: boolean;
  /** Dashed grey "unassigned" fallback (e.g. "Rig only") — keeps the track's icon shape. */
  muted?: boolean;
}

export default function MachineBadge({ track, label, showIcon = true, muted = false }: MachineBadgeProps) {
  const meta = TRACK_META[track];
  const Icon = meta.icon;
  const color = muted ? colors.textSecondary : meta.color;

  return (
    <View
      style={[
        styles.badge,
        muted ? styles.mutedBadge : { backgroundColor: meta.soft, borderColor: meta.color },
      ]}
    >
      {showIcon && <Icon size={12} color={color} strokeWidth={2} />}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { ...typography.caption, fontWeight: '700' },
  mutedBadge: {
    backgroundColor: 'rgba(28,28,46,0.05)',
    borderColor: 'rgba(28,28,46,0.15)',
    borderStyle: 'dashed',
  },
});
