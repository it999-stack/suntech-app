// src/components/shared/IndexTable.tsx
//
// Generic index table: optional checkbox column + configurable columns +
// optional per-row "..." action menu. Pass any data type with an `id`
// field, a columns array, and (optionally) rowActions — header and row
// widths come from the same column config, so they can never drift apart.
//
// Selection state lives in the parent (selectedIds/onToggleRow/onToggleAll)
// since it's often shared with other UI (e.g. a bulk-assign bar). Row-menu
// open state is internal — it's a pure UI concern nothing else needs.

import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ViewStyle } from 'react-native';
import { Check, MoreVertical } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

export interface IndexTableColumn<T> {
  key: string;
  header: string;
  /** Fixed width in px. Leave unset on exactly one column to let it fill remaining space. */
  width?: number;
  render: (item: T) => React.ReactNode;
}

export interface IndexTableAction<T> {
  label: string;
  onPress: (item: T) => void;
  danger?: boolean;
  /** Only show this action when true — e.g. "Unassign" only if already assigned. */
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
}

const CHECKBOX_SIZE = 18;
const MENU_WIDTH = 32;

export default function IndexTable<T extends { id: string }>({
  data, columns, selectable, selectedIds, onToggleRow, onToggleAll, allSelected,
  rowActions, emptyText = 'No items found.', onScrollBegin, style,
}: IndexTableProps<T>) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  return (
    <View style={[styles.card, style]}>
      <FlatList
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
          const visibleActions = rowActions?.filter((a) => !a.show || a.show(item)) ?? [];
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={selectable ? () => onToggleRow?.(item.id) : undefined}
                disabled={!selectable}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, flex: 1, minHeight: 0 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, paddingHorizontal: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(28,28,46,0.08)', marginBottom: spacing.sm,
  },
  headerLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },

  row: { position: 'relative', flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm, marginBottom: spacing.xs },
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