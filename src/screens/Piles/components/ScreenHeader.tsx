// src/screens/Piles/components/ScreenHeader.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Funnel } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface ScreenHeaderProps {
  title: string;
  onFilterPress: () => void;
  filterActive: boolean;
}

// PilesScreen is a tab-root (PilesStackNavigator has only this one route),
// so there's no back destination — no back arrow here, unlike the mockups.
export default function ScreenHeader({ title, onFilterPress, filterActive }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        style={[styles.filterBtn, filterActive && styles.filterBtnActive]}
        onPress={onFilterPress}
        hitSlop={spacing.sm}
      >
        <Funnel size={18} color={filterActive ? colors.accent : colors.textSecondary} />
        {filterActive && <View style={styles.filterDot} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h1, color: colors.textPrimary },
  filterBtn: {
    padding: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  filterDot: {
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
