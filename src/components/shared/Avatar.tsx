// src/components/shared/Avatar.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@theme/theme';
import { initials } from '@/utils/helpers';

interface AvatarProps {
  name: string | null;
  size?: number;
  variant?: 'filled' | 'outline';
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
}

export default function Avatar({
  name,
  size = 40,
  variant = 'filled',
  backgroundColor,
  textColor,
  borderColor,
}: AvatarProps) {
  const assigned = !!name;
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        assigned
          ? variant === 'filled'
            ? [
                styles.filled,
                backgroundColor && {
                  backgroundColor,
                },
                borderColor && {
                  borderWidth: 1.5,
                  borderColor,
                },
              ]
            : styles.outline
          : styles.empty,
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize },
          assigned
            ? variant === 'filled'
              ? [
                  styles.textFilled,
                  textColor && {
                    color: textColor,
                  },
                ]
              : styles.textOutline
            : styles.textEmpty,
        ]}
      >
        {assigned ? initials(name) : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  filled: {
    backgroundColor: colors.accent,
  },

  outline: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },

  empty: {
    backgroundColor: 'rgba(28,28,46,0.12)',
  },

  text: {
    fontWeight: '700',
  },

  textFilled: {
    color: colors.white,
  },

  textOutline: {
    color: colors.textSecondary,
  },

  textEmpty: {
    color: colors.white,
  },
});