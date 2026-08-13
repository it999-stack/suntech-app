// src/components/shared/SwipeableTabBar.tsx
//
// Generic pill-select bar + swipeable paged content. Tapping a pill or
// swiping the content changes the active item — both stay in sync through
// the same controlled `value`/`onChange`. Domain-agnostic: callers supply
// `items` and a `renderPage` function.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PagerView from 'react-native-pager-view';
import { colors, spacing, radius } from '@theme/theme';
import Divider from '@components/shared/Divider';

const MAX_VISIBLE_DOTS = 5;

/**
 * iOS-style paginator: shows up to MAX_VISIBLE_DOTS dots, always centered on
 * the active index. Dots fade out toward the edges of the visible window,
 * signalling "more items exist this way" without a literal progress bar.
 */
function PaginationDots({ total, activeIndex }: { total: number; activeIndex: number }) {
  if (total <= 1) return null;

  const windowSize = Math.min(total, MAX_VISIBLE_DOTS);
  const half = Math.floor(windowSize / 2);
  // Clamp window so it centers on activeIndex but never runs off either end.
  const start = Math.min(Math.max(activeIndex - half, 0), Math.max(total - windowSize, 0));
  const visible = Array.from({ length: windowSize }, (_, i) => start + i);

  return (
    <View style={styles.dotsRow}>
      {visible.map((itemIndex) => {
        const distance = Math.abs(itemIndex - activeIndex);
        // 0 -> full size/opacity, further away -> smaller + fainter
        const scale = distance === 0 ? 1 : distance === 1 ? 0.75 : 0.55;
        const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.25;
        return (
          <View
            key={itemIndex}
            style={[
              styles.dot,
              {
                width: 6 * scale,
                height: 6 * scale,
                opacity,
                backgroundColor: distance === 0 ? colors.textPrimary : colors.textSecondary,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export interface SwipeableTabItem<T extends string = string> {
  value: T;
  label: string;
  /** Accent color for this pill/page; defaults to colors.accent. */
  color?: string;
  renderIcon?: (color: string, active: boolean) => React.ReactNode;
}

export interface SwipeableTabBarProps<T extends string = string> {
  items: SwipeableTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  renderPage: (item: SwipeableTabItem<T>, index: number) => React.ReactNode;
  /**
   * Visual hint that the pill row scrolls horizontally when it overflows.
   * 'fade'  — edge gradient + last pill peeks half-cut (default)
   * 'dots'  — thin progress track below the row, tracks scroll position
   * 'none'  — no affordance (use if the row never overflows)
   */
  scrollHint?: 'fade' | 'dots' | 'none';
  /** Background color the fade should dissolve into. Required when scrollHint='fade'
   * if the bar sits on a non-default background (e.g. inside a gradient screen). */
  fadeToColor?: string;
  /** Optional fixed element rendered to the right of the pill row (e.g. an icon
   * button) — same layout PilesScreen.tsx uses for its search icon beside filter
   * pills. Omitted by default; existing callers are unaffected. */
  trailingAccessory?: React.ReactNode;
  /**
   * Pill sizing preset.
   * 'default' — this component's own padding/font (existing behavior).
   * 'piles'   — matches PilesScreen.tsx's filter `Pill` (minWidth 84, tighter
   *             padding, 1px border, 13/500 text). Opt-in; other callers unaffected.
   */
  pillVariant?: 'default' | 'piles';
}

const FALLBACK_PAGE_HEIGHT = 120;
const FADE_WIDTH = 28;

export default function SwipeableTabBar<T extends string = string>({
  items,
  value,
  onChange,
  renderPage,
  scrollHint = 'fade',
  fadeToColor = colors.backdropEnd,
  trailingAccessory,
  pillVariant = 'default',
}: SwipeableTabBarProps<T>) {
  const pagerRef = useRef<PagerView>(null);
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({});

  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value));

  const handlePillPress = (index: number) => {
    onChange(items[index].value);
    pagerRef.current?.setPage(index);
  };

  // Keeps the active pill in view whenever the selection changes — including
  // via a page swipe, which moves the pager but (unlike a pill tap) never
  // touches this ScrollView on its own, so the pill row would otherwise sit
  // frozen while the page underneath moves on.
  const pillScrollRef = useRef<ScrollView>(null);
  const pillLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const [rowWidth, setRowWidth] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);

  const handlePillLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    pillLayouts.current[index] = { x, width };
    setLayoutTick((t) => t + 1);
  };

  useEffect(() => {
    const layout = pillLayouts.current[activeIndex];
    if (!layout || !rowWidth) return;
    const targetX = layout.x + layout.width / 2 - rowWidth / 2;
    pillScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
    // layoutTick re-runs this once a pill's real position is measured (it isn't
    // known yet on the very first render), not just when activeIndex changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, rowWidth, layoutTick]);

  if (items.length === 0) return null;

  return (
    <View>
      <View style={styles.topRow}>
        <View
          style={[styles.pillRowWrap, styles.pillRowFlex]}
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          <ScrollView
            ref={pillScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.pillRow,
              // extra trailing space so the last pill can sit half-cut at the edge
              scrollHint !== 'none' && { paddingRight: spacing.lg },
            ]}
          >
            {items.map((item, index) => {
              const color = item.color ?? colors.accent;
              const active = index === activeIndex;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => handlePillPress(index)}
                  onLayout={handlePillLayout(index)}
                  style={[
                    styles.pill,
                    pillVariant === 'piles' && styles.pillPilesVariant,
                    {
                      backgroundColor: active ? `${color}22` : colors.glassFill,
                      borderColor: active ? `${color}55` : 'transparent',
                    },
                  ]}
                >
                  {item.renderIcon?.(color, active)}
                  <Text
                    style={[
                      styles.pillText,
                      pillVariant === 'piles' && styles.pillTextPilesVariant,
                      { color: active ? color : colors.textSecondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {scrollHint === 'fade' && (
            <LinearGradient
              colors={['transparent', fadeToColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeEdge}
              pointerEvents="none"
            />
          )}
        </View>

        {trailingAccessory}
      </View>

      {scrollHint === 'dots' && (
        <>
          <PaginationDots total={items.length} activeIndex={activeIndex} />
          <Divider />
        </>
      )}

      <PagerView
        ref={pagerRef}
        style={{ height: pageHeights[activeIndex] ?? FALLBACK_PAGE_HEIGHT }}
        initialPage={activeIndex}
        onPageSelected={(e) => onChange(items[e.nativeEvent.position].value)}
      >
        {items.map((item, index) => (
          <View key={item.value}>
            <View onLayout={(e) => {
              const height = e.nativeEvent.layout.height;
              setPageHeights((prev) => (prev[index] === height ? prev : { ...prev, [index]: height }));
            }}>
              {renderPage(item, index)}
            </View>
          </View>
        ))}
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pillRowWrap: {
    position: 'relative',
  },
  pillRowFlex: {
    flex: 1,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillPilesVariant: {
    minWidth: 84,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    justifyContent: 'center',
  },
  pillTextPilesVariant: { fontSize: 13, fontWeight: '500' },

  // 'fade' variant
  fadeEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: spacing.sm, // matches pillRow's paddingBottom so it doesn't overlap the row below
    width: FADE_WIDTH,
  },

  // 'dots' variant — centered, edge-fading paginator (max 5 dots)
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: -spacing.xs, // pull up under pillRow's own bottom padding
    marginBottom: spacing.sm,
  },
  dot: {
    borderRadius: 999,
  },
});