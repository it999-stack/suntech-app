// src/components/shared/Checkbox.tsx
//
// The app's checkbox mark. Presentational only — it renders the box and the
// tick, nothing else. Callers own the press target and the label, because the
// surrounding row differs everywhere it's used (a labelled row in
// FiltersSheet, a table cell in IndexTable), and only the mark itself was ever
// duplicated.
//
// Pair with Radio.tsx, which shares this sizing and unchecked border so the
// two read as one family.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '@theme/theme';

/** Matches Radio's default so a mixed list of checkboxes and radios aligns. */
export const CHECKBOX_SIZE = 18;

interface CheckboxProps {
  checked: boolean;
  /** Fill and border when checked. Defaults to the accent. */
  color?: string;
  /** Edge length. Defaults to CHECKBOX_SIZE; the tick scales with it. */
  size?: number;
}

export default function Checkbox({ checked, color = colors.accent, size = CHECKBOX_SIZE }: CheckboxProps) {
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size },
        checked && { backgroundColor: color, borderColor: color },
      ]}
    >
      {checked && <Check size={Math.round(size * 0.67)} color={colors.white} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 5,
    borderWidth: 1.5,
    // Deliberately not colors.border — that token is far lighter (0.08 alpha)
    // and disappears against the glass fills these sit on.
    borderColor: 'rgba(28,28,46,0.3)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
