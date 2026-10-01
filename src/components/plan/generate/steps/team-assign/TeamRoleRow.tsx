// src/components/plan/generate/steps/team-assign/TeamRoleRow.tsx
//
// One role line inside a shift section: role label on the left, the assignee's
// initials avatar + name (or "—") and a chevron on the right. Tapping opens the picker.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Avatar from '@components/shared/Avatar';
import RequiredMark from '@components/shared/RequiredMark';
import { colors, spacing, radius, typography } from '@/theme/theme';

interface TeamRoleRowProps {
  label: string;
  required?: boolean;
  assigneeName: string | null;
  onPress: () => void;
  /** Red border — set when Next found this required role empty. */
  highlighted?: boolean;
  isLast?: boolean;
  rowRef?: (el: View | null) => void;
}

export default function TeamRoleRow({ label, required, assigneeName, onPress, highlighted, isLast, rowRef }: TeamRoleRowProps) {
  return (
    <Pressable
      ref={rowRef}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        highlighted && styles.rowHighlighted,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
        {required && <RequiredMark />}
      </Text>
      <View style={styles.assigneeRow}>
        {assigneeName ? (
          <>
            <Avatar name={assigneeName} size={26} backgroundColor={colors.accent} />
            <Text style={styles.name} numberOfLines={1}>{assigneeName}</Text>
          </>
        ) : (
          <Text style={[styles.name, styles.empty]}>—</Text>
        )}
        <ChevronRight size={16} color={colors.textSecondary} style={styles.chevron} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.sm,
  },
  rowDivider: { borderBottomColor: 'rgba(28,28,46,0.06)' },
  rowHighlighted: { borderColor: colors.danger, borderBottomColor: colors.danger },
  rowPressed: { opacity: 0.6 },
  label: { ...typography.caption, color: colors.textSecondary, flexShrink: 0 },
  // Right-aligned group: avatar + name + chevron sit together at the row's end.
  assigneeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  name: { ...typography.caption, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  chevron: { marginLeft: -2 },
  empty: { color: colors.textSecondary },
});
