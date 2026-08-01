// src/components/plan/generate/preview/ReorderPilesOverlay.tsx
//
// Full-screen overlay for reordering a machine's pile sequence — visually
// similar to AppModal's centered variant (dimmed backdrop, centered card,
// fade+scale entrance), but deliberately NOT built on RN's native <Modal>
// (see below) and NOT using drag-and-drop (see below).
//
// Why no <Modal>: react-native-draggable-flatlist's drag gesture does not
// reliably work inside RN's <Modal> on Android — a separate native
// window/root breaks its internal gesture/coordinate tracking. Known,
// unresolved upstream issue (react-native-draggable-flatlist #267, #240).
//
// Why no drag-and-drop: even outside a Modal, react-native-draggable-flatlist
// (both the plain and Nestable variants) hit further issues in this app's
// environment — touch-responder conflicts, and a legacy `findNodeHandle` +
// `ref.measureLayout()` call (Nestable variant only) that's broken under
// React Native's New Architecture (Fabric), which this app runs on. Rather
// than keep chasing a fragile gesture library, sequencing is done with
// plain ▲/▼ buttons per row — no gesture handling involved, so this class
// of bug can't happen.
//
// Must be rendered as a direct sibling of the screen's <ScrollView> (not
// nested inside it) — RN's `position: 'absolute'` is relative to the
// immediate parent, not the screen, so nesting this inside scrollable
// content would size/scroll it with that content instead of covering the
// full screen.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  LinearTransition,
} from 'react-native-reanimated';
import { ChevronUp, ChevronDown, Lock, X } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import type { MachineInfo } from '@/types/timeline';

export interface ReorderPile {
  id: string;
  label: string;
  /** Already has logged progress — the scheduler always places resuming
   *  piles ahead of fresh ones regardless of position, so moving it here
   *  would have no real effect. Pinned in place: its own arrows are
   *  disabled, and neighbors can't swap past it either. */
  locked?: boolean;
}

interface ReorderPilesOverlayProps {
  visible: boolean;
  onClose: () => void;
  machine: MachineInfo;
  piles: ReorderPile[];
  onReorder: (newOrderIds: string[]) => void;
  /** True while a confirmed reorder is being applied to the real plan — guards
   *  the Confirm button against double-taps while that recompute is in flight. */
  isUpdating?: boolean;
}

export default function ReorderPilesOverlay({
  visible,
  onClose,
  machine,
  piles,
  onReorder,
  isUpdating = false,
}: ReorderPilesOverlayProps) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // Local draft ordering — only applied to the real plan when Confirm is
  // tapped. The overlay is unmounted/remounted by the parent on each open, so
  // this initializer already picks up a fresh value every time.
  const [localPiles, setLocalPiles] = useState(piles);

  if (!visible) return null;

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= localPiles.length) return;
    // A locked pile can't move, and an unlocked neighbor can't swap past
    // one either — locked piles stay pinned at their current slot.
    if (localPiles[index].locked || localPiles[target].locked) return;
    const reordered = [...localPiles];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLocalPiles(reordered); // local only — applied to the real plan on Confirm
  }

  function confirm() {
    onReorder(localPiles.map((p) => p.id));
    onClose();
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{machine.machineNo} · Sequence</Text>
                {isUpdating ? <ActivityIndicator size="small" color={colors.accent} /> : null}
              </View>
              <Text style={styles.subtitle}>Use the arrows to reorder, then confirm</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {localPiles.length === 0 ? (
            <Text style={styles.empty}>No piles assigned to this machine.</Text>
          ) : (
            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listWrap}
              data={localPiles}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => {
                // A neighbor blocked by a locked pile is just as unmovable
                // in that direction as one at the very edge of the list —
                // its arrow should look and behave disabled too, not just
                // no-op on press.
                const canMoveUp = index > 0 && !localPiles[index - 1].locked;
                const canMoveDown = index < localPiles.length - 1 && !localPiles[index + 1].locked;
                return (
                <Animated.View layout={LinearTransition.duration(180)}>
                  <View style={styles.row}>
                    <View style={styles.indexBadge}>
                      <Text style={styles.rowIndex}>{index + 1}</Text>
                    </View>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.locked ? (
                      <View style={styles.lockedBadge}>
                        <Lock size={14} color={colors.textSecondary} />
                      </View>
                    ) : (
                      <View style={styles.moveBtns}>
                        <Pressable
                          onPress={() => move(index, -1)}
                          disabled={!canMoveUp}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.moveBtn,
                            !canMoveUp && styles.moveBtnDisabled,
                            pressed && styles.moveBtnPressed,
                          ]}
                        >
                          <ChevronUp size={18} color={canMoveUp ? colors.accent : colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => move(index, 1)}
                          disabled={!canMoveDown}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.moveBtn,
                            !canMoveDown && styles.moveBtnDisabled,
                            pressed && styles.moveBtnPressed,
                          ]}
                        >
                          <ChevronDown
                            size={18}
                            color={canMoveDown ? colors.accent : colors.textSecondary}
                          />
                        </Pressable>
                      </View>
                    )}
                  </View>
                </Animated.View>
                );
              }}
            />
          )}

          {localPiles.length > 0 ? (
            <View style={styles.footer}>
              <Pressable
                onPress={confirm}
                disabled={isUpdating}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  isUpdating && styles.confirmBtnDisabled,
                  pressed && !isUpdating && styles.confirmBtnPressed,
                ]}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.confirmText}>Confirm Sequence</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the whole screen — sits as a plain sibling in the tree, not a
  // native Modal window.
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 20, // Android stacking, since there's no native Modal to force it above siblings
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,20,0.45)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingTop: spacing.sm,
    ...shadow.soft,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerTextWrap: { flex: 1, marginRight: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    maxHeight: 420,
  },
  listWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIndex: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.accent,
  },
  rowLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  moveBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  lockedBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveBtnDisabled: {
    opacity: 0.35,
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  moveBtnPressed: {
    opacity: 0.6,
  },
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  confirmBtn: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnPressed: {
    opacity: 0.85,
  },
  confirmText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
});
