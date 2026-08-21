// src/components/shared/Pager.tsx
//
// Footer pager with ellipsis truncation: "‹ 1 … 15 … 30 ›". Unlike a
// simple sliding window (see SwipeableTabBar.tsx's PaginationDots), this
// always anchors on the first and last page and only collapses the pages
// in between, so it stays usable even with dozens of pages.

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface PagerProps {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// 0 siblings keeps the collapsed form as tight as possible on a phone-width
// screen — e.g. "1 2 3 … 14" rather than "1 2 3 4 5 … 14" — so there's less
// to tap through and less chance of the row crowding whatever floats over it
// (e.g. GeneratePlanScreen's NextStepFab).
const SIBLING_COUNT = 0;

type PageEntry = number | 'ellipsis';

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function buildPageList(page: number, totalPages: number, siblingCount = SIBLING_COUNT): PageEntry[] {
  const totalSlots = siblingCount * 2 + 5; // first, last, current, 2 siblings, 2 ellipses
  if (totalPages <= totalSlots) return range(1, totalPages);

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, totalPages);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    return [...range(1, 3 + siblingCount * 2), 'ellipsis', totalPages];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    return [1, 'ellipsis', ...range(totalPages - (2 + siblingCount * 2), totalPages)];
  }
  return [1, 'ellipsis', ...range(left, right), 'ellipsis', totalPages];
}

export default function Pager({ page, totalPages, onPageChange }: PagerProps) {
  const entries = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.navBtn, page <= 1 && styles.navBtnDisabled]}
        disabled={page <= 1}
        onPress={() => onPageChange(page - 1)}
        hitSlop={spacing.xs}
      >
        <ChevronLeft size={16} color={colors.textSecondary} />
      </Pressable>

      {entries.map((entry, index) =>
        entry === 'ellipsis' ? (
          <Text key={`ellipsis-${index}`} style={styles.ellipsis}>
            …
          </Text>
        ) : (
          <Pressable
            key={entry}
            style={[styles.pageBtn, entry === page && styles.pageBtnActive]}
            onPress={() => onPageChange(entry)}
            hitSlop={spacing.xs}
          >
            <Text style={[styles.pageText, entry === page && styles.pageTextActive]}>{entry}</Text>
          </Pressable>
        ),
      )}

      <Pressable
        style={[styles.navBtn, page >= totalPages && styles.navBtnDisabled]}
        disabled={page >= totalPages}
        onPress={() => onPageChange(page + 1)}
        hitSlop={spacing.xs}
      >
        <ChevronRight size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },
  pageBtn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pageText: { ...typography.caption, color: colors.textSecondary },
  pageTextActive: { color: colors.textInverse, fontWeight: '700' },
  ellipsis: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: 2 },
});
