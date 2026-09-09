// src/components/plan/generate/preview/ReorderPilesModal.tsx
//
// Bottom-sheet for reordering a machine's pile sequence — built on the
// shared AppModal (single native <Modal> via ModalHost, backdrop, fade/slide
// animation, swipe-down-to-dismiss all provided for free). Used to be a
// bespoke full-screen overlay that avoided AppModal specifically because
// react-native-draggable-flatlist's drag gesture didn't work reliably inside
// RN's native <Modal> on Android — but that reason is moot now: sequencing
// was already switched to plain ▲/▼ buttons (no gesture handling at all),
// so there's nothing left for a native <Modal> to conflict with.
//
// Stays mounted across opens (the caller keeps rendering it once a machine
// has ever been picked, caching that last machine/piles instead of clearing
// them immediately — see usePreviewReorder's editingMachine/
// isMachineOverlayOpen). `visible` toggling drives AppModal's own open/close
// animation.

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { ChevronUp, ChevronDown, Lock, Plus, Trash2 } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import MachineBadge from '@components/shared/MachineBadge';
import EmptyState from '@components/shared/EmptyState';
import { colors, spacing, radius } from '@theme/theme';
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

interface ReorderPilesModalProps {
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

export default function ReorderPilesModal({
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
}: ReorderPilesModalProps) {
  // Local draft ordering — only applied to the real plan when Confirm is
  // tapped.
  const [localPiles, setLocalPiles] = useState(piles);
  useEffect(() => {
    if (visible) setLocalPiles(piles);
  }, [visible, piles]);

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
    <AppModal
      visible={visible}
      onClose={onClose}
      position="bottom"
      title={`${machine.machineNo}`}
      subtitle={subtitleText}
      scrollable={false}
      showCloseButton={false}
      // A confirmed save is in flight — don't let a stray swipe/backdrop
      // tap/back-press dismiss the sheet out from under it.
      closeDisabled={isUpdating}
      headerRight={
        onAddPile ? (
          <Pressable onPress={onAddPile} hitSlop={12} style={styles.addBtn}>
            <Plus size={18} color={colors.accent} />
          </Pressable>
        ) : undefined
      }
    >
      {localPiles.length === 0 ? (
        <EmptyState
          bordered={false}
          icon="layers"
          title="No piles assigned"
          message={`${machine.machineNo} isn't sequenced for any piles yet.`}
        />
      ) : (
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
      )}

      {localPiles.length > 0 && (
        <View style={styles.footer}>
          <Button label={confirmLabel} loading={isUpdating} disabled={isUpdating} onPress={confirm} />
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  addBtn: {
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
  footer: {
    paddingTop: spacing.md,
  },
});
