// src/components/shared/Badge.tsx
//
// Generic icon+text pill — caller supplies the icon (optional) and both
// colors, so it fits any status/track/category use case. For the fixed
// RIG/CRANE/COMPRESSOR machine palette, use MachineBadge instead.

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { spacing, radius, typography } from '@theme/theme';

interface BadgeProps {
  text: string;
  textColor: string;
  bgColor: string;
  icon?: LucideIcon;
  fontSize?: number;
  style?: ViewStyle;
}

export default function Badge({ text, textColor, bgColor, icon: Icon, fontSize = 10, style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      {Icon && <Icon color={textColor} size={fontSize} strokeWidth={2} />}
      <Text style={[styles.text, { color: textColor, fontSize }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
