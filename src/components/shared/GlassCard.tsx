import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, shadow } from '@theme/theme';

interface Props {
  children: React.ReactNode;
  /** Applied to the outer shadow wrapper — use for margin, width, flex, etc. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the inner content view — use for padding overrides. */
  innerStyle?: StyleProp<ViewStyle>;
  borderless?: boolean;
}

/**
 * Shared "liquid glass" card surface.
 *
 * Stretches to fill its parent width by default (`alignSelf: 'stretch'`).
 * Pass `style` for outer layout (margin, flex) and `innerStyle` for padding.
 */
export default function GlassCard({ children, style, innerStyle, borderless = false }: Props) {
  return (
    <View style={[styles.shadowWrap, style]}>
      <BlurView intensity={40} tint="light" style={[styles.blur, borderless && styles.borderless]}>
        <View style={[styles.inner, innerStyle]}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    alignSelf: 'stretch',
    borderRadius: radius.xl,
    ...shadow.glass,
  },
  blur: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  borderless: { borderWidth: 0 },
  inner: {
    backgroundColor: colors.glassFill,
    padding: 16,
  },
});
