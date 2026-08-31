// src/components/shared/Button.tsx
//
// Shared button. `primary`/`secondary` are the two structural variants
// (solid fill vs glass/bordered outline); `warning`/`danger`/`success` are
// solid-fill tone variants for status-carrying actions (e.g. "Report
// breakdown", "Mark resumed") — same shape as primary, different color.
// `warning` gets dark text for contrast on its amber fill; every other
// solid variant gets light text. `size` controls padding/font/icon size —
// "md" matches the button's original (only) size, so existing callers are
// unaffected.
//
// Omitting `label` renders icon-only: a fixed square/circle instead of the
// pill-with-text layout, for small inline icon affordances (e.g. an edit or
// delete glyph) that don't want a text label. `iconColor` overrides the
// variant-derived color for cases where the icon is tinted independently of
// the container (e.g. a neutral bordered square with a red trash icon).
//
// See RoundedButton for the absolute circular FAB variant (e.g.
// GeneratePlanScreen's "next step" control) — that one is always a large,
// absolutely-positioned circle; this component's icon-only mode is for
// small, inline, non-positioned icon buttons instead.

import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, radius, shadow } from '@theme/theme';

type ButtonVariant = 'primary' | 'secondary' | 'warning' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';
type IconShape = 'rounded' | 'circle';
type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

interface ButtonProps {
  label?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
  /** Overrides the variant-derived icon color. Icon-only mode only. */
  iconColor?: string;
  /** Icon-only mode only — 'rounded' (radius.md) or a full 'circle' (radius.pill). Labeled buttons always stay pill-shaped. */
  shape?: IconShape;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
}

const SIZES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; gap: number; fontSize: number; iconSize: number }> = {
  sm: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md, gap: spacing.xs, fontSize: 13, iconSize: 14 },
  md: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, gap: spacing.sm, fontSize: 16, iconSize: 18 },
  lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, gap: spacing.sm, fontSize: 18, iconSize: 20 },
};

const ICON_ONLY_SIZES: Record<ButtonSize, { boxSize: number; iconSize: number }> = {
  sm: { boxSize: 28, iconSize: 14 },
  md: { boxSize: 32, iconSize: 18 },
  lg: { boxSize: 40, iconSize: 22 },
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconColor,
  shape = 'rounded',
  loading = false,
  disabled = false,
  style,
  hitSlop,
  accessibilityLabel,
}: ButtonProps) {
  const isSecondary = variant === 'secondary';
  const textColor = isSecondary || variant === 'warning' ? colors.textPrimary : colors.textInverse;
  const resolvedIconColor = iconColor ?? textColor;
  const isDisabled = disabled || loading;
  const iconOnly = !label;

  const sizeStyle = iconOnly
    ? (() => {
        const { boxSize } = ICON_ONLY_SIZES[size];
        return { width: boxSize, height: boxSize, borderRadius: shape === 'circle' ? radius.pill : radius.md };
      })()
    : (() => {
        const { paddingVertical, paddingHorizontal, gap } = SIZES[size];
        return { paddingVertical, paddingHorizontal, gap };
      })();
  const iconSize = iconOnly ? ICON_ONLY_SIZES[size].iconSize : SIZES[size].iconSize;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        sizeStyle,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : iconOnly ? (
        Icon && <Icon size={iconSize} color={resolvedIconColor} />
      ) : (
        <>
          {Icon && <Icon size={iconSize} color={textColor} />}
          <Text style={[styles.label, { fontSize: SIZES[size].fontSize, color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  primary: {
    backgroundColor: colors.accent,
    ...shadow.soft,
  },
  secondary: {
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warning: {
    backgroundColor: colors.warning,
    ...shadow.soft,
  },
  danger: {
    backgroundColor: colors.danger,
    ...shadow.soft,
  },
  success: {
    backgroundColor: colors.success,
    ...shadow.soft,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  label: {
    fontWeight: '600',
  },
});
