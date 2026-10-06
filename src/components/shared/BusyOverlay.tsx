// src/components/shared/BusyOverlay.tsx
//
// Dims a section of a card and locks it while its data is being recomputed,
// with a centered spinner on top. Used by the Machine Timeline and Piles
// cards (preview step recomputes, and PlanDetailScreen's load/refresh).
//
// Keeps the previous content mounted underneath rather than swapping it for a
// spinner: both callers wrap tall bodies (a timeline, a pager of pile pages),
// and unmounting them would collapse the card and shift everything below it
// mid-interaction. The stale numbers stay readable, just visibly inert.

import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { colors } from '@/theme/theme';

const DIMMED_OPACITY = 0.35;
const REVEAL_MS = 250;

interface BusyOverlayProps {
  busy: boolean;
  children: React.ReactNode;
}

export default function BusyOverlay({ busy, children }: BusyOverlayProps) {
  // Fades content back in when busy clears, instead of swapping it in on a
  // single frame — on first load the content arrives in the same commit that
  // clears busy, which otherwise reads as everything "popping" in at once.
  const opacity = useRef(new Animated.Value(busy ? DIMMED_OPACITY : 1)).current;

  useEffect(() => {
    if (busy) {
      opacity.setValue(DIMMED_OPACITY);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: REVEAL_MS, useNativeDriver: true }).start();
  }, [busy, opacity]);

  return (
    // minHeight while busy: with no content yet (first load) the overlay would
    // otherwise be ~0px tall and the spinner clipped by the card's overflow.
    <View style={[styles.wrap, busy && styles.busyMinHeight]}>
      {/* pointerEvents on the content itself (not just the overlay) so nothing
          underneath stays tappable through a gap — a PagerView swipe would
          otherwise still register. */}
      <Animated.View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity }}>
        {children}
      </Animated.View>
      {busy && (
        // box-only: this view swallows touches without letting them reach the
        // dimmed content, while its own children stay non-interactive.
        <View style={styles.overlay} pointerEvents="box-only">
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  busyMinHeight: { minHeight: 120 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
