// src/components/shared/IndexTable.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ViewStyle, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { Check, MoreVertical } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

export interface IndexTableColumn<T> {
  key: string;
  header: string;
  width?: number;
  render: (item: T) => React.ReactNode;
}

export interface IndexTableAction<T> {
  label: string;
  onPress: (item: T) => void;
  danger?: boolean;
  show?: (item: T) => boolean;
}

interface IndexTableProps<T extends { id: string }> {
  data: T[];
  columns: IndexTableColumn<T>[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  rowActions?: IndexTableAction<T>[];
  emptyText?: string;
  onScrollBegin?: () => void;
  style?: ViewStyle;
  isRowDisabled?: (item: T) => boolean;
  footer?: React.ReactElement | null;
  onSwipeNextPage?: () => void;
  onSwipePrevPage?: () => void;
}

const CHECKBOX_SIZE = 18;
const MENU_WIDTH = 32;
const SWIPE_DISTANCE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 500;

export default function IndexTable<T extends { id: string }>({
  data, columns, selectable, selectedIds, onToggleRow, onToggleAll, allSelected,
  rowActions, emptyText = 'No items found.', onScrollBegin, style, isRowDisabled, footer,
  onSwipeNextPage, onSwipePrevPage,
}: IndexTableProps<T>) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const translateX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  function handleViewportLayout(e: LayoutChangeEvent): void {
    setViewportWidth(e.nativeEvent.layout.width);
  }

  const canSwipeNext = !!onSwipeNextPage;
  const canSwipePrev = !!onSwipePrevPage;

  const swipeGesture = Gesture.Pan()
    .enabled(canSwipeNext || canSwipePrev)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const blocked = (e.translationX < 0 && !canSwipeNext) || (e.translationX > 0 && !canSwipePrev);
      translateX.value = blocked ? 0 : e.translationX;
    })
    .onEnd((e) => {
      const goingNext = e.translationX < 0;
      const canGo = goingNext ? canSwipeNext : canSwipePrev;
      const passed =
        canGo &&
        (Math.abs(e.translationX) > SWIPE_DISTANCE_THRESHOLD || Math.abs(e.velocityX) > SWIPE_VELOCITY_THRESHOLD);

      if (!passed) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }

      const exitX = goingNext ? -viewportWidth : viewportWidth;
      translateX.value = withTiming(exitX, { duration: 180 });
      contentOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (!finished) return;
        if (goingNext) runOnJS(onSwipeNextPage!)();
        else runOnJS(onSwipePrevPage!)();
        translateX.value = 0;
        contentOpacity.value = withTiming(1, { duration: 200 });
      });
    });

  const animatedListStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: contentOpacity.value,
  }));

  return (
    <View style={[styles.card, style]}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.listViewport, animatedListStyle]} onLayout={handleViewportLayout}>
          <FlatList
            style={styles.list}
            data={data}
            keyExtractor={(item) => item.id}
            nestedScrollEnabled
            stickyHeaderIndices={[0]}
            ListHeaderComponent={
              <Pressable style={styles.headerRow} onPress={selectable ? onToggleAll : undefined} disabled={!selectable}>
                {selectable && (
                  <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
                    {allSelected && <Check size={12} color={colors.white} />}
                  </View>
                )}
                {columns.map((col) => (
                  <Text key={col.key} style={[styles.headerLabel, col.width ? { width: col.width } : { flex: 1 }]}>
                    {col.header}
                  </Text>
                ))}
                {rowActions && <View style={{ width: MENU_WIDTH }} />}
              </Pressable>
            }
            renderItem={({ item }) => {
              const selected = selectedIds?.has(item.id) ?? false;
              const disabled = isRowDisabled?.(item) ?? false;
              const visibleActions = rowActions?.filter((a) => !a.show || a.show(item)) ?? [];
              return (
                <View style={[styles.row, selected && styles.rowSelected, disabled && styles.rowDisabled]}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={selectable && !disabled ? () => onToggleRow?.(item.id) : undefined}
                    disabled={!selectable || disabled}
                  >
                    {selectable && (
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <Check size={12} color={colors.white} />}
                      </View>
                    )}
                    {columns.map((col) => (
                      <View key={col.key} style={col.width ? { width: col.width } : { flex: 1 }}>
                        {col.render(item)}
                      </View>
                    ))}
                  </Pressable>

                  {visibleActions.length > 0 && (
                    <Pressable
                      style={styles.menuTrigger}
                      hitSlop={8}
                      onPress={() => setMenuOpenId((prev) => (prev === item.id ? null : item.id))}
                    >
                      <MoreVertical size={16} color={colors.textSecondary} />
                    </Pressable>
                  )}

                  {menuOpenId === item.id && visibleActions.length > 0 && (
                    <View style={styles.menu}>
                      {visibleActions.map((action, idx) => (
                        <Pressable
                          key={action.label}
                          style={[styles.menuItem, idx === visibleActions.length - 1 && styles.menuItemLast]}
                          onPress={() => { setMenuOpenId(null); action.onPress(item); }}
                        >
                          <Text style={[styles.menuItemText, action.danger && styles.menuItemTextDanger]}>
                            {action.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
            onScrollBeginDrag={() => { setMenuOpenId(null); onScrollBegin?.(); }}
          />
        </Animated.View>
      </GestureDetector>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, flex: 1, minHeight: 0 },
  listViewport: { flex: 1, overflow: 'hidden' },
  list: { flex: 1 },
  footer: {
    paddingTop: spacing.xs,
  },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.glassFillStrong, paddingTop: spacing.sm, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderBottomColor: 'rgba(28,28,46,0.08)', paddingBottom : spacing.sm,
  },
  headerLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },

  row: { position: 'relative', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(28,28,46,0.08)' },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowDisabled: { opacity: 0.5 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },

  checkbox: {
    width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderRadius: 5, borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },

  menuTrigger: { width: MENU_WIDTH, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute', top: 40, right: spacing.sm, zIndex: 30,
    backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(28,28,46,0.1)',
    minWidth: 170, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  menuItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: 'rgba(28,28,46,0.08)' },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { ...typography.body, fontSize: 13, color: colors.textPrimary },
  menuItemTextDanger: { color: colors.danger },

  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginVertical: spacing.lg },
});