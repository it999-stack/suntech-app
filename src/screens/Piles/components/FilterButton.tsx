// src/screens/Piles/components/FilterButton.tsx
//
// The filter affordance for PilesScreen. Sits inline beside the search input
// rather than in a screen header — PilesScreen is a tab root with no back
// destination and no title bar, so there is no header for it to live in.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Funnel } from 'lucide-react-native';
import { colors, spacing, radius } from '@theme/theme';

interface FilterButtonProps {
  onPress: () => void;
  /** Any filter applied — tints the button and shows the dot. */
  active: boolean;
}

export default function FilterButton({ onPress, active }: FilterButtonProps) {
  return (
    <Pressable
      style={[styles.btn, active && styles.btnActive]}
      onPress={onPress}
      hitSlop={spacing.sm}
      accessibilityLabel="Filter piles"
    >
      <Funnel size={18} color={active ? colors.accent : colors.textSecondary} />
      {active && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    // Square, and matched to SearchInput's own vertical padding + border so
    // the two line up on a single row without either dictating the height.
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentPink,
    borderWidth: 1,
    borderColor: colors.white,
  },
});
