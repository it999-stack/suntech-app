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
//
// Stays mounted across opens (the caller keeps rendering it once a machine
// has ever been picked, caching that last machine/piles instead of clearing
// them immediately — see usePreviewReorder's editingMachine/
// isMachineOverlayOpen). `visible` toggling then drives a real fade+scale on
// BOTH open and close (via the internal `rendered` flag, which only flips
// after the close tween finishes), instead of just popping the entrance
// animation and vanishing instantly on close like an unmount would.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
  LinearTransition,
} from 'react-native-reanimated';
import { ChevronUp, ChevronDown, Lock, X, Plus, Trash2 } from 'lucide-react-native';
import Button from '@components/shared/Button';
import MachineBadge from '@components/shared/MachineBadge';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import type { MachineInfo } from '@/types/timeline';
import { PileGroupCard, PileGroupRow } from '@components/plan/generate/steps/pile-assign/PileGroupCard';

export interface ReorderPile {
  id: string;
  label: string;
  /** Already has logged progress — the scheduler always places resuming
   *  piles ahead of fresh ones regardless of position, so moving it here
   *  would have no real effect. Pinned in place: its own arrows are
   *  disabled, and neighbors can't swap past it either. */
  locked?: boolean;
  /** This pile's machine on the *other* track — e.g. when sequencing a rig,
   *  its paired crane's machineNo. Every distinct value across the list is
   *  shown as a badge in the card header instead of on each row, since the
   *  row's right edge is already the reorder controls. */
  otherMachineLabel?: string;
}

interface ReorderPilesOverlayProps {
  visible: boolean;
  onClose: () => void;
  machine: MachineInfo;
  piles: ReorderPile[];
  onReorder: (newOrderIds: string[]) => void | Promise<void>;
  /** True while a confirmed reorder is being applied to the real plan — guards
   *  the Confirm button against double-taps while that recompute is in flight. */
  isUpdating?: boolean;
  /** When provided, shows a "+" button in the header for adding another pile
   *  to this machine's sequence. Omitted by default; existing callers unaffected. */
  onAddPile?: () => void;
  /** When provided, shows a trash icon on each unlocked row for removing that
   *  pile from the plan. Omitted by default; existing callers unaffected. */
  onRemove?: (id: string) => void;
  /** Overrides the footer button's label. Default: 'Confirm Sequence'. */
  confirmLabel?: string;
  /** Overrides the subtitle under the machine name. Default: 'Use the arrows to reorder, then confirm'. */
  subtitleText?: string;
}

export default function ReorderPilesOverlay({
  visible,
  onClose,
  machine,
  piles,
  onReorder,
  isUpdating = false,
  onAddPile,
  onRemove,
  confirmLabel = 'Confirm Sequence',
  subtitleText = 'Use the arrows to reorder, then confirm',
}: ReorderPilesOverlayProps) {
  const progress = useSharedValue(0);

  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = withTiming(1, { duration: 220 });
    } else if (rendered) {
      progress.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // Local draft ordering — only applied to the real plan when Confirm is
  // tapped.
  const [localPiles, setLocalPiles] = useState(piles);
  useEffect(() => {
    if (visible) setLocalPiles(piles);
  }, [visible]);

  if (!rendered) return null;

  const otherMachineLabels = [...new Set(
    localPiles.map((p) => p.otherMachineLabel).filter((v): v is string => !!v),
  )];
  const otherTrack = machine.type === 'RIG' ? 'CRANE' : 'RIG';

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= localPiles.length) return;
    if (localPiles[index].locked || localPiles[target].locked) return;
    const reordered = [...localPiles];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLocalPiles(reordered);
  }

  async function confirm() {
    try {
      await onReorder(localPiles.map((p) => p.id));
      onClose();
    } catch {
      // Save failed — stay open so the user can retry without losing their
      // edits. The parent already surfaced the error via Alert.
    }
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
              </View>
              <Text style={styles.subtitle}>{subtitleText}</Text>
            </View>
            {onAddPile && (
              <Pressable onPress={onAddPile} hitSlop={12} style={styles.closeBtn}>
                <Plus size={18} color={colors.accent} />
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {localPiles.length === 0 ? (
            <Text style={styles.empty}>No piles assigned to this machine.</Text>
          ) : (
            <View style={styles.listCard}>
              <PileGroupCard
                rigLabel={machine.machineNo}
                track={machine.type}
                headerRight={
                  otherMachineLabels.length > 0 ? (
                    <View style={styles.headerBadgeRow}>
                      {otherMachineLabels.map((label) => (
                        <MachineBadge key={label} track={otherTrack} label={label} />
                      ))}
                    </View>
                  ) : undefined
                }
              >
              <FlatList
                style={styles.list}
                contentContainerStyle={styles.listWrap}
                data={localPiles}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => {
                  const canMoveUp = index > 0 && !localPiles[index - 1].locked;
                  const canMoveDown = index < localPiles.length - 1 && !localPiles[index + 1].locked;
                  return (
                    <Animated.View layout={LinearTransition.duration(180)}>
                      <PileGroupRow
                        index={index + 1}
                        title={item.label}
                        track={machine.type}
                        isLast={index === localPiles.length - 1}
                        right={
                          item.locked ? (
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
                              {onRemove && (
                                <Pressable
                                  onPress={() => {
                                    setLocalPiles((prev) => prev.filter((p) => p.id !== item.id));
                                    onRemove(item.id);
                                  }}
                                  hitSlop={8}
                                  style={({ pressed }) => [styles.moveBtn, pressed && styles.moveBtnPressed]}
                                >
                                  <Trash2 size={16} color={colors.danger} />
                                </Pressable>
                              )}
                            </View>
                          )
                        }
                      />
                    </Animated.View>
                  );
                }}
              />
              </PileGroupCard>
            </View>
          )}

          {localPiles.length > 0 ? (
            <View style={styles.footer}>
              <Button label={confirmLabel} loading={isUpdating} disabled={isUpdating} onPress={confirm} />
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 20,
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
    gap: spacing.xs,
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
    paddingBottom: spacing.xs,
  },
  // PileGroupCard supplies its own border/radius/background — this wrapper
  // only insets it from the modal's edges, matching headerRow's padding.
  listCard: {
    marginHorizontal: spacing.lg,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
});
