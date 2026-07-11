// src/components/shared/Switch.tsx
//
// Fully custom switch (not RN's native Switch) so it looks identical on
// iOS and Android: a pill track that fades between a dull grey (off) and
// white (on), with a plain solid thumb that slides left/right. No border/
// ring around the thumb — it's a single flat circle.
//
// Usage:
//   <Switch value={isActive} onValueChange={setIsActive} />

import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { colors } from '@/theme/theme';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 18;
const PADDING = (TRACK_HEIGHT - THUMB_SIZE) / 2; // 3
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - PADDING * 2; // distance thumb slides

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function Switch({ value, onValueChange, disabled }: SwitchProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [PADDING, PADDING + THUMB_TRAVEL],
  });

  // Off = dull grey track, On = white track.
  const trackBackgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.machine.idle, colors.white],
  });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: trackBackgroundColor },
          disabled && styles.trackDisabled,
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            { transform: [{ translateX }] },
            disabled && styles.thumbDisabled,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  trackDisabled: {
    opacity: 0.5,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.accent,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbDisabled: {
    backgroundColor: colors.machine.idle,
  },
});