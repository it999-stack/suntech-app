// src/components/shared/SideDrawer.tsx
//
// Generic panel that slides in from the left, dismissible via backdrop tap.
// Mirrors AppModal.tsx's role as a shared shell, but for side-drawer content.
// Stays mounted regardless of `visible` (toggle the prop, don't conditionally
// render this component) so the slide-in/out animation always plays.

import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { colors, shadow } from '@theme/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(340, SCREEN_WIDTH * 0.85);

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function SideDrawer({ visible, onClose, children }: SideDrawerProps) {
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(visible ? 0 : -DRAWER_WIDTH, { duration: 260 });
    backdropOpacity.value = withTiming(visible ? 1 : 0, { duration: 260 });
  }, [visible, translateX, backdropOpacity]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.panel, { width: DRAWER_WIDTH }, panelStyle]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,20,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.white,
    ...shadow.soft,
  },
});
