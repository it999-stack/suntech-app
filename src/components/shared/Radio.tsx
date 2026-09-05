// src/components/shared/Radio.tsx
//
// The app's radio mark. Presentational only — the ring and the dot, nothing
// else. Callers own the press target and the label, because the surrounding
// row differs everywhere it's used (a labelled row in FiltersSheet, a large
// choice card in ResumeTimeConfirmModal).
//
// Pair with Checkbox.tsx: same default size and same unchecked border, so the
// two read as one family.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@theme/theme';

/** Matches Checkbox's default so a mixed list of radios and checkboxes aligns. */
export const RADIO_SIZE = 18;

/** Dot-to-ring ratio. Tuned on the 18px default; scales with `size`. */
const DOT_RATIO = 0.6;

interface RadioProps {
  checked: boolean;
  /** Ring and dot when checked. Defaults to the accent. */
  color?: string;
  /** Outer diameter. Defaults to RADIO_SIZE; the dot scales with it. */
  size?: number;
}

export default function Radio({ checked, color = colors.accent, size = RADIO_SIZE }: RadioProps) {
  const dot = Math.round(size * DOT_RATIO);
  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2 },
        checked && { borderColor: color },
      ]}
    >
      {checked && (
        <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 1.5,
    // Same rationale as Checkbox — colors.border is too faint to read here.
    borderColor: 'rgba(28,28,46,0.3)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
