// src/components/shared/Avatar.tsx
//
// Generic initials-avatar circle. Any screen showing "a person" (assigned or
// not) should reach for this instead of hand-rolling another avatar View+Text
// pair — see AssigneeChip / CoreTeamAccordion for the two current consumers.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@theme/theme';
import { initials } from '@/utils/helpers';

interface AvatarProps {
  /** Person's name, or null for an unassigned placeholder ("—"). */
  name: string | null;
  size?: number;
  /** 'filled' = solid accent background, white initials (primary roles).
   *  'outline' = bordered, muted initials (secondary roles).
   *  Ignored when `name` is null — unassigned always renders the same neutral look. */
  variant?: 'filled' | 'outline';
}

export default function Avatar({ name, size = 40, variant = 'filled' }: AvatarProps) {
  const assigned = !!name;
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        assigned ? (variant === 'filled' ? styles.filled : styles.outline) : styles.empty,
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize },
          assigned ? (variant === 'filled' ? styles.textFilled : styles.textOutline) : styles.textEmpty,
        ]}
      >
        {assigned ? initials(name!) : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.accent },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  empty: { backgroundColor: 'rgba(28,28,46,0.12)' },
  text: { fontWeight: '700' },
  textFilled: { color: colors.white },
  textOutline: { color: colors.textSecondary },
  textEmpty: { color: colors.white },
});
