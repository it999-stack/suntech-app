// src/components/shared/PersonnelPickerList.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { User, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import { formatDesignation, type SimplePersonnel } from '@/utils/personnelRoles';
import Badge from './Badge';
import Button from './Button';

export type { SimplePersonnel };

const LIST_MAX_HEIGHT = 260;

function PersonnelRow({
  label,
  sublabel,
  active,
  disabled,
  inactive,
  onPress,
  onUnassign,
  rowRef,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  disabled?: boolean;
  inactive?: boolean;
  onPress: () => void;
  onUnassign?: () => void;
  rowRef?: (el: View | null) => void;
}) {
  return (
    <Pressable
      ref={rowRef}
      style={[styles.personRow, active && styles.personRowActive, disabled && styles.personRowDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <View style={styles.personIcon}>
        <User size={16} color={active ? colors.accent : colors.textSecondary} />
      </View>
      <View style={styles.personInfo}>
        <View style={styles.personNameRow}>
          <Text style={[styles.personName, active && styles.personNameActive]}>{label}</Text>
          {inactive ? <Badge text="Inactive" textColor={colors.danger} bgColor={colors.dangerSoft} /> : null}
        </View>
        {sublabel ? (
          <Text style={[styles.personDesig, disabled && styles.personDesigDisabled]}>{sublabel}</Text>
        ) : null}
      </View>
      {active && onUnassign ? (
        <Button
          icon={X}
          variant="secondary"
          size="sm"
          shape="circle"
          iconColor={colors.danger}
          hitSlop={10}
          style={styles.unassignBtn}
          onPress={onUnassign}
        />
      ) : null}
    </Pressable>
  );
}

interface PersonnelPickerListProps {
  personnel: SimplePersonnel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Show a "None / Skip" row that clears the selection. Defaults to true. */
  allowNone?: boolean;
  /** Shown when `personnel` is empty. */
  emptyLabel?: string;
  maxHeight?: number;
  /** Person ids to show in the list but greyed out and unpressable — e.g. already assigned to
   * this same role elsewhere — mapped to a "where" label (machine · shift). */
  disabledDetails?: Map<string, string>;
}

export default function PersonnelPickerList({
  personnel,
  selectedId,
  onSelect,
  allowNone = true,
  emptyLabel = 'No matching personnel synced for this site.',
  maxHeight = LIST_MAX_HEIGHT,
  disabledDetails,
}: PersonnelPickerListProps) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedRowRef = useRef<View | null>(null);

  // On open, if a person is already selected, bring their row into view —
  // it may be scrolled off past the visible maxHeight in a long list.
  useEffect(() => {
    if (!selectedId) return;
    requestAnimationFrame(() => {
      const scrollView = scrollRef.current as any;
      const node = selectedRowRef.current as any;
      if (!scrollView || !node) return;
      scrollView.measure((_sx: number, _sy: number, _sw: number, viewportHeight: number, _sPageX: number, scrollPageY: number) => {
        node.measure((_x: number, _y: number, _w: number, rowHeight: number, _pageX: number, pageY: number) => {
          const rowTop = pageY - scrollPageY;
          const centered = rowTop - viewportHeight / 2 + rowHeight / 2;
          scrollView.scrollTo({ y: Math.max(centered, 0), animated: false });
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!personnel.length) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.list, { maxHeight }]}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {personnel.map((item, idx) => (
        <React.Fragment key={item.id}>
          <PersonnelRow
            rowRef={item.id === selectedId ? (el) => { selectedRowRef.current = el; } : undefined}
            label={item.name}
            sublabel={disabledDetails?.get(item.id) ?? formatDesignation(item.designation)}
            active={selectedId === item.id}
            disabled={!item.isActive || disabledDetails?.has(item.id)}
            inactive={!item.isActive}
            onPress={() => onSelect(item.id)}
            onUnassign={allowNone ? () => onSelect(null) : undefined}
          />
          {idx < personnel.length - 1 ? <View style={{ height: spacing.xs }} /> : null}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingBottom: spacing.xs },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  personRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  personRowDisabled: {
    opacity: 0.4,
  },
  personIcon: { width: 24, alignItems: 'center' },
  personInfo: { flex: 1 },
  personNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  personName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  personNameActive: { color: colors.accent },
  personDesig: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  personDesigDisabled: {
    fontStyle: 'italic',
  },
  unassignBtn: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 0,
  },
});
