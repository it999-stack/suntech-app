// src/screens/Home/components/QuickAccessTile.tsx

import React from 'react';
import { View, Text, Pressable, ImageBackground, StyleSheet, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, shadow, typography } from '@theme/theme';

interface QuickAccessTileProps {
  image: ImageSourcePropType;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Navigation tile: illustrated backdrop, a frosted wash for legibility, icon, text and a chevron. */
export default function QuickAccessTile({ image, icon, title, subtitle, onPress, style }: QuickAccessTileProps) {
  return (
    <Pressable style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]} onPress={onPress}>
      <ImageBackground source={image} resizeMode="cover" style={styles.bg} imageStyle={styles.bgImage}>
        <View style={styles.wash}>
          <View style={styles.iconCircle}>{icon}</View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <View style={styles.chevron}>
            <ChevronRight size={16} color={colors.textPrimary} />
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl, ...shadow.soft },
  pressed: { opacity: 0.85 },
  bg: { height: 84, borderRadius: radius.xl, overflow: 'hidden' },
  bgImage: { borderRadius: radius.xl },
  wash: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { ...typography.cardTitle, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
