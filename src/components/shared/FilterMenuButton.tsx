// src/components/shared/FilterMenuButton.tsx
//
// Generic ellipsis (kebab) trigger that opens a small dropdown of mutually
// exclusive options, each optionally annotated with a count. Deliberately
// has no piles-specific knowledge — pass any options/value/onChange and it
// works anywhere a "choose one of N, with counts" menu is needed.

import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Dimensions } from 'react-native';
import { MoreVertical, Check } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

export type FilterMenuOption<T extends string = string> = {
  label: string;
  value: T;
  count?: number;
};

interface FilterMenuButtonProps<T extends string = string> {
  options: FilterMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const MENU_WIDTH = 220;

export default function FilterMenuButton<T extends string = string>({
  options,
  value,
  onChange,
}: FilterMenuButtonProps<T>) {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

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
        <Pressable style={styles.trigger} onPress={openMenu} hitSlop={8}>
          <MoreVertical size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {anchor ? (
            <View style={[styles.menu, { position: 'absolute', top: anchor.top, left: anchor.left }]}>
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.menuRow, selected && styles.menuRowSelected]}
                    onPress={() => choose(opt.value)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={styles.checkSlot}>
                        {selected ? <Check size={16} color={colors.accent} /> : null}
                      </View>
                      <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]}>
                        {opt.label}
                      </Text>
                    </View>
                    {opt.count !== undefined ? <Text style={styles.menuCount}>{opt.count}</Text> : null}
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
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.15)',
  },
  menu: {
    width: MENU_WIDTH,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    ...shadow.soft,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  menuRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkSlot: {
    width: 16,
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
});