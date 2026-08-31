// src/components/shared/RoundedButton.tsx

import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, shadow } from '@theme/theme';

type RoundedButtonVariant = 'primary' | 'secondary';
type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

interface RoundedButtonProps {
  icon: IconComponent;
  onPress: () => void;
  disabled?: boolean;
  /** Swaps the icon for a spinner and implies disabled — e.g. while a tap's
   * consequence is still being computed, so the button itself confirms the
   * tap registered instead of the screen just going quiet. */
  loading?: boolean;
  size?: number;
  iconSize?: number;
  variant?: RoundedButtonVariant;
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function RoundedButton({
  icon: Icon,
  onPress,
  disabled = false,
  loading = false,
  size = 56,
  iconSize = 26,
  variant = 'primary',
  floating = true,
  style,
}: RoundedButtonProps) {
  const insets = useSafeAreaInsets();
  const iconColor = variant === 'secondary' ? colors.accent : colors.white;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        { width: size, height: size, borderRadius: size / 2 },
        floating && [styles.floating, { bottom: spacing.lg + insets.bottom }],
        style,
        disabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={iconColor} /> : <Icon size={iconSize} color={iconColor} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    ...shadow.soft,
  },
  secondary: {
    backgroundColor: colors.white,
    ...shadow.soft,
  },
  floating: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
