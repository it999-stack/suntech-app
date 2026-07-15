import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';

export interface SimplePersonnel {
  id: string;
  name: string;
  designation: string;
}

export interface SimpleShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface SupervisorStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  personnel: SimplePersonnel[];
  shifts: SimpleShift[];
}

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
    <Pressable
      style={[styles.personRow, active && styles.personRowActive]}
      onPress={onPress}
    >
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

function PersonnelList({
  personnel,
  selectedId,
  onSelect,
}: {
  personnel: SimplePersonnel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      <PersonnelRow
        label="None / Skip"
        active={selectedId === null}
        onPress={() => onSelect(null)}
      />
      <View style={{ height: spacing.xs }} />
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

export default function SupervisorStep({
  draft,
  onUpdate,
  personnel,
  shifts,
}: SupervisorStepProps) {
  const shift1 = shifts[0];
  const shift2 = shifts[1];

  const slot1Label = shift1
    ? `${shift1.name} · ${shift1.startTime} – ${shift1.endTime}`
    : 'Shift 1 (Day)';
  const slot2Label = shift2
    ? `${shift2.name} · ${shift2.startTime} – ${shift2.endTime}`
    : 'Shift 2 (Night)';

  return (
    <>
      <Text style={styles.hint}>
        Assign a supervisor for each shift. Both are optional.
      </Text>

      <Accordion
        defaultOpen
        header={<Text style={styles.slotLabel}>{slot1Label}</Text>}
      >
        <View style={{ maxHeight: LIST_MAX_HEIGHT }}>
          <PersonnelList
            personnel={personnel}
            selectedId={draft.supervisorId}
            onSelect={(id) => onUpdate({ supervisorId: id })}
          />
        </View>
      </Accordion>

      <Accordion
        defaultOpen
        header={<Text style={styles.slotLabel}>{slot2Label}</Text>}
      >
        <View style={{ maxHeight: LIST_MAX_HEIGHT }}>
          <PersonnelList
            personnel={personnel}
            selectedId={draft.supervisorId2}
            onSelect={(id) => onUpdate({ supervisorId2: id })}
          />
        </View>
      </Accordion>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  slotLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingBottom: spacing.xs },
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