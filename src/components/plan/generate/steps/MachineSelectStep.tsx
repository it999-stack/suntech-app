// src/components/plan/generate/steps/MachineSelectStep.tsx
//
// Step 3 — all synced rigs + cranes are shown, pre-selected.
// User deselects any that are broken / unavailable today.
// Only machines remaining selected flow into PileAssignStep.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, Circle, Wrench, Truck } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';

export interface SimpleMachine {
  id: string;
  machineNo: string;
  description?: string | null;
}

interface MachineSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
}

function MachineRow({
  machine,
  active,
  onToggle,
  icon,
}: {
  machine: SimpleMachine;
  active: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Pressable
      style={[styles.machineRow, active && styles.machineRowActive]}
      onPress={onToggle}
    >
      <View style={styles.machineIcon}>{icon}</View>
      <View style={styles.machineInfo}>
        <Text style={[styles.machineName, active && styles.machineNameActive]}>
          {machine.machineNo}
        </Text>
        {machine.description ? (
          <Text style={styles.machineDesc}>{machine.description}</Text>
        ) : null}
      </View>
      {active ? (
        <CheckCircle2 size={20} color={colors.accent} />
      ) : (
        <Circle size={20} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

export default function MachineSelectStep({
  draft,
  onUpdate,
  rigs,
  cranes,
}: MachineSelectStepProps) {
  function toggleRig(id: string) {
    const next = draft.activeRigIds.includes(id)
      ? draft.activeRigIds.filter((x) => x !== id)
      : [...draft.activeRigIds, id];
    onUpdate({ activeRigIds: next });
  }

  function toggleCrane(id: string) {
    const next = draft.activeCraneIds.includes(id)
      ? draft.activeCraneIds.filter((x) => x !== id)
      : [...draft.activeCraneIds, id];
    onUpdate({ activeCraneIds: next });
  }

  return (
    <>
      <Text style={styles.hint}>
        All machines are selected by default. Deselect any that are unavailable or under maintenance today.
      </Text>

      {/* Rigs */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Wrench size={16} color={colors.accent} />
          <Text style={styles.groupLabel}>Rigs</Text>
          <Text style={styles.groupCount}>
            {draft.activeRigIds.length} / {rigs.length} active
          </Text>
        </View>
        {rigs.length === 0 ? (
          <Text style={styles.emptyText}>No rigs synced yet.</Text>
        ) : (
          rigs.map((r) => (
            <MachineRow
              key={r.id}
              machine={r}
              active={draft.activeRigIds.includes(r.id)}
              onToggle={() => toggleRig(r.id)}
              icon={<Wrench size={16} color={draft.activeRigIds.includes(r.id) ? colors.accent : colors.textSecondary} />}
            />
          ))
        )}
      </GlassCard>

      {/* Cranes */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Truck size={16} color={colors.accent} />
          <Text style={styles.groupLabel}>Cranes</Text>
          <Text style={styles.groupCount}>
            {draft.activeCraneIds.length} / {cranes.length} active
          </Text>
        </View>
        {cranes.length === 0 ? (
          <Text style={styles.emptyText}>No cranes synced yet.</Text>
        ) : (
          cranes.map((c) => (
            <MachineRow
              key={c.id}
              machine={c}
              active={draft.activeCraneIds.includes(c.id)}
              onToggle={() => toggleCrane(c.id)}
              icon={<Truck size={16} color={draft.activeCraneIds.includes(c.id) ? colors.accent : colors.textSecondary} />}
            />
          ))
        )}
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
  groupPad: { padding: spacing.lg },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  groupLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  groupCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: spacing.xs,
  },
  machineRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  machineIcon: { width: 28, alignItems: 'center' },
  machineInfo: { flex: 1 },
  machineName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  machineNameActive: { color: colors.accent },
  machineDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});