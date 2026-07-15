// src/components/shared/Divider.tsx

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing } from '@theme/theme';

export interface DividerProps {
  /** Vertical space above/below the line. Defaults to spacing.xs on both sides. */
  marginVertical?: number;
  /** Horizontal inset from both edges, e.g. to align with card padding. */
  inset?: number;
  /** Override line color; defaults to colors.divider (or the fallback below). */
  color?: string;
  style?: ViewStyle;
}

// Falls back to the literal value already used in ProfileScreen if the
// theme doesn't (yet) define a dedicated divider color token.
const DEFAULT_DIVIDER_COLOR = colors.border ?? 'rgba(28,28,46,0.06)';

export default function Divider({ marginVertical, inset, color, style }: DividerProps) {
  return (
    <View
      style={[
        styles.divider,
        {
          backgroundColor: color ?? DEFAULT_DIVIDER_COLOR,
          marginVertical: marginVertical ?? spacing.xs,
          marginHorizontal: inset ?? 0,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
  },
});