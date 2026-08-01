// src/components/shared/AssigneeChip.tsx
//
// Shared "assign a person" row-end control: an initials avatar + green
// status dot + name + chevron when assigned, or a bare icon when not.
// Used by MachineSelectStep (operator) and TeamAssignStep (engineer).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight, UserPlus } from 'lucide-react-native';
import { colors, spacing, typography } from '@/theme/theme';
import Avatar from '@components/shared/Avatar';

interface AssigneeChipProps {
  /** Assigned person's name, or null if unassigned. */
  name: string | null;
  onPress: () => void;
  /** Icon color shown in the unassigned state. Defaults to the existing warning/amber tone. */
  placeholder?: string;
}

export default function AssigneeChip({ name, onPress, placeholder }: AssigneeChipProps) {
  if (name) {
    return (
      <Pressable style={styles.assignedChip} onPress={onPress}>
        <View style={styles.avatarWrap}>
          <Avatar name={name} size={28} />
          <View style={styles.statusDot} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <ChevronRight size={18} color={colors.textSecondary} />
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.assignPill} onPress={onPress}>
      <UserPlus size={20} color={colors.warning} />
      {placeholder && <Text style={styles.placeholderText}>{placeholder}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  assignPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  assignedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  avatarWrap: {
    width: 28,
    height: 28,
  },
  placeholderText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.warning,
  },
  statusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
