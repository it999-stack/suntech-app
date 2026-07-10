// src/components/plan/generate/steps/SupervisorStep.tsx
//
// Step 5 — pick supervisors for Shift 1 (day) and Shift 2 (night).
// Shift labels + times are read from DB shifts passed as props.
// Both slots are optional (None / Skip is always available).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
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
  /** All shift types from DB — used to show shift labels (Shift 1, Shift 2). */
  shifts: SimpleShift[];
}

// ─── Personnel picker list ────────────────────────────────────────────────────

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
    <View style={styles.list}>
      <Pressable
        style={[styles.personRow, selectedId === null && styles.personRowActive]}
        onPress={() => onSelect(null)}
      >
        <View style={styles.personIcon}>
          <User size={16} color={selectedId === null ? colors.accent : colors.textSecondary} />
        </View>
        <Text style={[styles.personName, selectedId === null && styles.personNameActive]}>
          None / Skip
        </Text>
      </Pressable>

      {personnel.map((p) => (
        <Pressable
          key={p.id}
          style={[styles.personRow, selectedId === p.id && styles.personRowActive]}
          onPress={() => onSelect(p.id)}
        >
          <View style={styles.personIcon}>
            <User size={16} color={selectedId === p.id ? colors.accent : colors.textSecondary} />
          </View>
          <View style={styles.personInfo}>
            <Text style={[styles.personName, selectedId === p.id && styles.personNameActive]}>
              {p.name}
            </Text>
            <Text style={styles.personDesig}>{p.designation}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SupervisorStep({
  draft,
  onUpdate,
  personnel,
  shifts,
}: SupervisorStepProps) {
  // Use first two shifts from DB to label the slots, or fall back to generic labels
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

      {/* Shift 1 supervisor */}
      <GlassCard innerStyle={styles.slotPad}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotLabel}>{slot1Label}</Text>
        </View>
        <PersonnelList
          personnel={personnel}
          selectedId={draft.supervisorId}
          onSelect={(id) => onUpdate({ supervisorId: id })}
        />
      </GlassCard>

      {/* Shift 2 supervisor */}
      <GlassCard innerStyle={styles.slotPad}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotLabel}>{slot2Label}</Text>
        </View>
        <PersonnelList
          personnel={personnel}
          selectedId={draft.supervisorId2}
          onSelect={(id) => onUpdate({ supervisorId2: id })}
        />
      </GlassCard>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  slotPad: { padding: spacing.lg },
  slotHeader: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.08)',
  },
  slotLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { gap: spacing.xs },
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