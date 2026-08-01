// src/components/shared/ProgressRing.tsx
//
// A circular "activity dial" — a ring of short radial ticks around a plain
// inner circle, with ticks colored up to `percent` and the rest dimmed.
// Pure Views + rotation transforms, no SVG/native dependency: each tick sits
// in its own full-size "spoke" wrapper, rotated around the spoke's center —
// the standard RN trick for radial layouts.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@theme/theme';

interface ProgressRingProps {
  /** 0-100. Values outside that range are clamped. */
  percent: number;
  /** Outer diameter, ticks included. */
  size?: number;
  tickCount?: number;
  activeColor?: string;
  inactiveColor?: string;
  children?: React.ReactNode;
}

export default function ProgressRing({
  percent,
  size = 190,
  tickCount = 48,
  activeColor = colors.accent,
  inactiveColor = 'rgba(20,20,31,0.12)',
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * tickCount);
  const tickLength = size * 0.09;
  const tickWidth = Math.max(2, size * 0.016);
  const innerSize = size * 0.74;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: tickCount }).map((_, i) => {
        const angle = (360 / tickCount) * i;
        return (
          <View
            key={i}
            style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]}
          >
            <View
              style={[
                styles.tick,
                {
                  width: tickWidth,
                  height: tickLength,
                  borderRadius: tickWidth / 2,
                  marginLeft: -tickWidth / 2,
                  backgroundColor: i < filledCount ? activeColor : inactiveColor,
                },
              ]}
            />
          </View>
        );
      })}
      <View style={[styles.innerCircle, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tick: {
    position: 'absolute',
    top: 0,
    left: '50%',
  },
  innerCircle: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
