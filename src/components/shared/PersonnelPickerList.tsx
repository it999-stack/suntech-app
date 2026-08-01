// src/components/shared/PersonnelPickerList.tsx
//
// Shared "pick one person from a filtered list" body, used inside an
// AppModal by StartTimeStep (PM/Planning Engineer), MachineSelectStep
// (operator), ShiftInchargeStep, and TeamAssignStep (engineer/supervisor).
// Extracted from the original SupervisorStep, which had its own
// file-local copy of this exact list/row pair.

import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { SimplePersonnel } from '@/utils/personnelRoles';

export type { SimplePersonnel };

const LIST_MAX_HEIGHT = 260;

function PersonnelRow({
  label,
  sublabel,
  active,
  onPress,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.personRow, active && styles.personRowActive]} onPress={onPress}>
      <View style={styles.personIcon}>
        <User size={16} color={active ? colors.accent : colors.textSecondary} />
      </View>
      <View style={styles.personInfo}>
        <Text style={[styles.personName, active && styles.personNameActive]}>{label}</Text>
        {sublabel ? <Text style={styles.personDesig}>{sublabel}</Text> : null}
      </View>
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
}

export default function PersonnelPickerList({
  personnel,
  selectedId,
  onSelect,
  allowNone = true,
  emptyLabel = 'No matching personnel synced for this site.',
  maxHeight = LIST_MAX_HEIGHT,
}: PersonnelPickerListProps) {
  if (!personnel.length) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <ScrollView
      style={[styles.list, { maxHeight }]}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {allowNone ? (
        <>
          <PersonnelRow label="None / Skip" active={selectedId === null} onPress={() => onSelect(null)} />
          <View style={{ height: spacing.xs }} />
        </>
      ) : null}
      {personnel.map((item, idx) => (
        <React.Fragment key={item.id}>
          <PersonnelRow
            label={item.name}
            sublabel={item.designation}
            active={selectedId === item.id}
            onPress={() => onSelect(item.id)}
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
  personIcon: { width: 24, alignItems: 'center' },
  personInfo: { flex: 1 },
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
});
