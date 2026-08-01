// src/components/shared/GradientTile.tsx
//
// Reusable gradient-background action tile: a decorative bordered/glowing
// blob behind title+subtitle (top) and an icon badge (bottom). Callers choose
// the background wash via `gradientColors` (e.g. colors.backdropGradient to
// match the screen behind it, or colors.creamGradient for a lighter look) —
// everything else about the tile's shape/content stays identical.

import React from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, shadow, typography } from '@theme/theme';

interface GradientTileProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  gradientColors: [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
  iconAlign?: 'left' | 'right';
}

function BlobAccent() {
  return (
    <LinearGradient
      colors={['#FFFFFF', '#FDE3D3', '#F3B7A6']}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.blob}
    />
  );
}

export default function GradientTile({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
  gradientColors,
  style,
  iconAlign = 'left'
}: GradientTileProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.shadowWrap, style, pressed && styles.pressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.outer}
      >
        <View style={styles.inner}>
          <BlobAccent />
          <View style={styles.textWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: iconBg },
              iconAlign === 'right' && styles.iconWrapRight,
            ]}
          >{icon}</View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.xl,
    ...shadow.glass,
  },
  pressed: { opacity: 0.8 },
  outer: {
    height: 140,
    borderRadius: radius.xl,
  },
  inner: {
    flex: 1,
    padding: spacing.lg,
    overflow: 'hidden',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.5)',
    borderRadius: radius.xl,
  },
  blob: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 999,
    right: -30,
    bottom: -20,
  },
  textWrap: {},
  title: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  iconWrapRight: {
    alignSelf: 'flex-end',
  },
});
