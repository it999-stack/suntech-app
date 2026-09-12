// src/components/shared/BusyOverlay.tsx
//
// Dims a section of a card and locks it while its data is being recomputed,
// with a centered spinner on top. Used by the preview step's Machine Timeline
// and Piles cards, which are the only two things a plan recompute changes —
// see PreviewStep's isRecomputing prop.
//
// Keeps the previous content mounted underneath rather than swapping it for a
// spinner: both callers wrap tall bodies (a timeline, a pager of pile pages),
// and unmounting them would collapse the card and shift everything below it
// mid-interaction. The stale numbers stay readable, just visibly inert.

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/theme/theme';

interface BusyOverlayProps {
  busy: boolean;
  children: React.ReactNode;
}

export default function BusyOverlay({ busy, children }: BusyOverlayProps) {
  return (
    <View style={styles.wrap}>
      {/* pointerEvents on the content itself (not just the overlay) so nothing
          underneath stays tappable through a gap — a PagerView swipe would
          otherwise still register. */}
      <View pointerEvents={busy ? 'none' : 'auto'} style={busy ? styles.dimmed : undefined}>
        {children}
      </View>
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
  dimmed: { opacity: 0.35 },
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
