// src/components/plan/generate/steps/MachineSelectStep.tsx
//
// Step 3 — all synced rigs + cranes are shown, pre-selected.
// User deselects any that are broken / unavailable today.
// Only machines remaining selected flow into PileAssignStep.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Drill, Truck } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import Switch from '@components/shared/Switch';
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
  onToggle: (next: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <Pressable
      style={styles.machineRow}
      onPress={() => onToggle(!active)}
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
      <Switch value={active} onValueChange={onToggle} />
    </Pressable>
  );
}

export default function MachineSelectStep({
  draft,
  onUpdate,
  rigs,
  cranes,
}: MachineSelectStepProps) {
  function toggleRig(id: string, next: boolean) {
    const nextIds = next
      ? [...draft.activeRigIds, id]
      : draft.activeRigIds.filter((x) => x !== id);
    onUpdate({ activeRigIds: nextIds });
  }

  function toggleCrane(id: string, next: boolean) {
    const nextIds = next
      ? [...draft.activeCraneIds, id]
      : draft.activeCraneIds.filter((x) => x !== id);
    onUpdate({ activeCraneIds: nextIds });
  }

  return (
    <>
      <Text style={styles.hint}>
        All machines are selected by default. Deselect any that are unavailable or under maintenance today.
      </Text>

      {/* Rigs */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Drill size={16} color={colors.accent} />
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
              onToggle={(next) => toggleRig(r.id, next)}
              icon={<Drill size={16} color={draft.activeRigIds.includes(r.id) ? colors.accent : colors.textSecondary} />}
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
              onToggle={(next) => toggleCrane(c.id, next)}
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
    
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.06)',
    marginBottom: spacing.xs,
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