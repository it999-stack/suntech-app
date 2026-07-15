// src/components/shared/SegmentedToggle.tsx
// Generic animated pill/segmented toggle. Works with 2, 3, 4+ options.
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

export type SegmentOption<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const [layouts, setLayouts] = useState<
    Record<number, { x: number; width: number }>
  >({});
  const hasMeasuredActive = useRef(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;

  const activeIndex = options.findIndex((o) => o.value === value);
  const activeLayout = layouts[activeIndex];

  useEffect(() => {
    if (!activeLayout) return;

    if (!hasMeasuredActive.current) {
      // First measurement: snap instantly, don't animate in from 0.
      translateX.setValue(activeLayout.x);
      indicatorWidth.setValue(activeLayout.width);
      hasMeasuredActive.current = true;
      return;
    }

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: activeLayout.x,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      }),
      Animated.spring(indicatorWidth, {
        toValue: activeLayout.width,
        useNativeDriver: false, // width can't use native driver
        speed: 20,
        bounciness: 6,
      }),
    ]).start();
  }, [activeIndex, activeLayout?.x, activeLayout?.width]);

  const handleLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => ({ ...prev, [index]: { x, width } }));
  };

  return (
    <View style={styles.toggle}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            width: indicatorWidth,
            transform: [{ translateX }],
          },
        ]}
      />
      {options.map((opt, index) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={styles.segment}
            onLayout={handleLayout(index)}
            onPress={() => onChange(opt.value)}
            hitSlop={4}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.glassFill,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  indicator: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: 0,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  segment: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.buttonLabel,
    color: colors.textSecondary,
  },
  textActive: {
    color: colors.accent,
  },
});
