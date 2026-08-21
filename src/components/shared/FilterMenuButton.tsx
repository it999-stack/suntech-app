// src/components/shared/FilterMenuButton.tsx

import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Dimensions } from 'react-native';
import { Funnel, Check } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

export type FilterMenuOption<T extends string = string> = {
  label: string;
  value: T;
  count?: number;
  /** Leading status dot color — omit for a plain label (e.g. a reset/"All" entry). */
  color?: string;
};

interface FilterMenuButtonProps<T extends string = string> {
  options: FilterMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  iconSize?: number;
}

const MENU_WIDTH = 230;

export default function FilterMenuButton<T extends string = string>({
  options,
  value,
  onChange,
  iconSize = 20,
}: FilterMenuButtonProps<T>) {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  // The first option is treated as the reset/"All" state — the trigger
  // tints itself whenever the current value has moved off of it, so there's
  // always a visual cue that a filter is active (and tapping that same
  // first row clears it).
  const isFiltered = options.length > 0 && value !== options[0].value;

  function openMenu() {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      const left = Math.min(x + width - MENU_WIDTH, screenWidth - MENU_WIDTH - spacing.md);
      setAnchor({ top: y + height + 8, left: Math.max(left, spacing.md) });
      setOpen(true);
    });
  }

  function choose(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          style={[styles.trigger, isFiltered && styles.triggerActive]}
          onPress={openMenu}
          hitSlop={spacing.sm}
        >
          <Funnel size={iconSize} color={isFiltered ? colors.accent : colors.textSecondary} />
          {isFiltered && <View style={styles.triggerDot} />}
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {anchor ? (
            <View style={[styles.menu, { position: 'absolute', top: anchor.top, left: anchor.left }]}>
              <Text style={styles.menuHeader}>Filter by status</Text>
              {options.map((opt, idx) => {
                const selected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.menuRow,
                      selected && styles.menuRowSelected,
                      idx < options.length - 1 && styles.menuRowDivider,
                    ]}
                    onPress={() => choose(opt.value)}
                  >
                    <View style={styles.menuRowLeft}>
                      {opt.color ? <View style={[styles.dot, { backgroundColor: opt.color }]} /> : null}
                      <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]}>
                        {opt.label}
                      </Text>
                    </View>
                    <View style={styles.menuRowRight}>
                      {opt.count !== undefined ? (
                        <Text style={[styles.menuCount, selected && styles.menuCountSelected]}>{opt.count}</Text>
                      ) : null}
                      <View style={styles.checkSlot}>
                        {selected ? <Check size={14} color={colors.accent} strokeWidth={2.5} /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  triggerDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentPink,
    borderWidth: 1,
    borderColor: colors.white,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.15)',
  },
  menu: {
    width: MENU_WIDTH,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
    ...shadow.soft,
  },
  menuHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  menuRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  menuRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkSlot: {
    width: 16,
    alignItems: 'center',
  },
  menuLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuLabelSelected: {
    color: colors.accent,
  },
  menuCount: {
    ...typography.body,
    color: colors.textSecondary,
  },
  menuCountSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
});