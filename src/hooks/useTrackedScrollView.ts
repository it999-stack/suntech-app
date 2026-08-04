// src/hooks/useTrackedScrollView.ts
//
// For whoever owns a ScrollView and wants its live scroll offset available
// outside of render (e.g. to compute a scroll-to-position target for
// useScrollToField). Tracks the offset in a ref, not state, so scrolling
// itself never triggers a re-render.

import { useRef } from 'react';
import type { ScrollView, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useTrackedScrollView() {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }

  return { scrollViewRef, scrollYRef, onScroll, scrollEventThrottle: 16 as const };
}
