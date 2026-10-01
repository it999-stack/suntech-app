// src/components/shared/GlassCard.tsx

import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius as radiusTokens, shadow } from '@theme/theme';

interface Props {
  children: React.ReactNode;
  /** Applied to the outer shadow wrapper — use for margin, width, flex, etc. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the inner content view — use for padding overrides. */
  innerStyle?: StyleProp<ViewStyle>;
  borderless?: boolean;
  /** Corner radius for the whole card — defaults to radius.xl. */
  radius?: number;
}

/**
 * Shared "liquid glass" card surface.
 *
 * Stretches to fill its parent width by default (`alignSelf: 'stretch'`).
 * Pass `style` for outer layout (margin, flex) and `innerStyle` for padding.
 *
 * Blur intensity is intentionally lower than a typical frosted-glass value
 * (25 vs. the more common 40+) — the backdrop is now a pale cream/lavender
 * wash rather than a saturated gradient, so heavier blur just flattens the
 * card into the page instead of reading as "frosted over light".
 */
export default function GlassCard({ children, style, innerStyle, borderless = false, radius = radiusTokens.xl }: Props) {
  return (
    <View style={[styles.shadowWrap, { borderRadius: radius }, style]}>
      <BlurView intensity={25} tint="light" style={[styles.blur, { borderRadius: radius }, borderless && styles.borderless]}>
        <View style={[styles.inner, innerStyle]}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    ...shadow.glass,
  },
  blur: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  borderless: { borderWidth: 0 },
  inner: {
    backgroundColor: colors.white,
    padding: 16,
  },
});