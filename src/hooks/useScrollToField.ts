// src/hooks/useScrollToField.ts
//
// Generic "scroll the page to this field" helper for any step rendered
// inside a ScrollView tracked by useTrackedScrollView. Register a row's
// native view under an arbitrary string key, then scroll to it by that
// same key later (e.g. when a validation check finds it's the first thing
// still missing a value). Has no knowledge of what the field actually is —
// reusable across any step, not tied to any one form's shape.

import { useRef } from 'react';
import type { View, ScrollView } from 'react-native';

export function useScrollToField(
  scrollViewRef: React.RefObject<ScrollView | null>,
  scrollYRef: React.RefObject<number>,
) {
  const fieldRefs = useRef<Record<string, View | null>>({});

  function registerField(key: string) {
    return (el: View | null) => {
      fieldRefs.current[key] = el;
    };
  }

  function scrollToField(key: string, padding = 24): void {
    const node = fieldRefs.current[key] as any;
    const scrollView = scrollViewRef.current as any;
    if (!node || !scrollView) return;

    scrollView.measure((_sx: number, _sy: number, _sw: number, _sh: number, _sPageX: number, scrollPageY: number) => {
      node.measure((_x: number, _y: number, _w: number, _h: number, _pageX: number, pageY: number) => {
        const targetY = scrollYRef.current + (pageY - scrollPageY) - padding;
        scrollView.scrollTo({ y: Math.max(targetY, 0), animated: true });
      });
    });
  }

  return { registerField, scrollToField };
}
