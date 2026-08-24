// src/components/plan/generate/steps/MachineSelectStep.tsx
//
// Step 3 — all synced rigs + cranes are listed. Tapping a row toggles it
// in/out of today's active plan (activeRigIds/activeCraneIds) — a plain
// on/off switch, nothing else. Personnel (engineer/supervisor/operator) are
// assigned per-shift in the Team step; deactivating a machine here clears
// its role rows from both shifts so a re-activated machine starts clean.

import React from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Drill, Forklift } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import { TRACK_META } from '@/utils/helpers';

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
  iconColor,
  icon,
  onToggle,
}: {
  machine: SimpleMachine;
  active: boolean;
  iconColor: string;
  icon: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.machineRow} onPress={onToggle}>
      <View style={[styles.machineIcon, { backgroundColor: active ? `${iconColor}1F` : 'rgba(28,28,46,0.06)' }]}>
        {icon}
      </View>
      <Text style={[styles.machineName, active && styles.machineNameActive]} numberOfLines={1}>
        {machine.machineNo}
      </Text>
      <Switch
        value={active}
        onValueChange={onToggle}
        trackColor={{ true: iconColor }}
        thumbColor={active ? colors.white : undefined}
      />
    </Pressable>
  );
}

// Deactivating a machine must not leave a pile's assignment pointing at it —
// PileAssignStep/ResumeConfirmStep only "look" correct because they filter
// their machine lookups against the active list; Preview and the actual
// generate/save path read draft.assignments raw, so a stale id there would
// keep scheduling/persisting real work onto a machine the user turned off.
function scrubAssignmentsForMachine(
  assignments: PlanDraft['assignments'],
  machineId: string,
  type: 'RIG' | 'CRANE',
): PlanDraft['assignments'] {
  const next = { ...assignments };
  let changed = false;
  for (const [pileId, a] of Object.entries(next)) {
    if (type === 'RIG' && a.rig === machineId) {
      // Rig is mandatory — falls back to fully unassigned rather than
      // keeping a crane-only half-pair.
      next[pileId] = { rig: '', crane: undefined };
      changed = true;
    } else if (type === 'CRANE' && a.crane === machineId) {
      // Crane is optional — the pile just becomes rig-only.
      next[pileId] = { ...a, crane: undefined };
      changed = true;
    }
  }
  return changed ? next : assignments;
}

export default function MachineSelectStep({ draft, onUpdate, rigs, cranes }: MachineSelectStepProps) {
  function clearMachineRoles(id: string) {
    function stripFromTeam(team: PlanDraft['checklistPersonnel']['shift1']) {
      const { [id]: _op, ...operatorByMachineId } = team.operatorByMachineId;
      const { [id]: _eng, ...engineerByMachineId } = team.engineerByMachineId;
      const { [id]: _sup, ...supervisorByMachineId } = team.supervisorByMachineId;
      return { ...team, operatorByMachineId, engineerByMachineId, supervisorByMachineId };
    }
    onUpdate({
      checklistPersonnel: {
        ...draft.checklistPersonnel,
        shift1: stripFromTeam(draft.checklistPersonnel.shift1),
        shift2: stripFromTeam(draft.checklistPersonnel.shift2),
      },
    });
  }

  function toggleMachine(id: string, type: 'RIG' | 'CRANE') {
    const isRig = type === 'RIG';
    const activeIds = isRig ? draft.activeRigIds : draft.activeCraneIds;
    const key = isRig ? 'activeRigIds' : 'activeCraneIds';
    if (activeIds.includes(id)) {
      clearMachineRoles(id);
      onUpdate({
        [key]: activeIds.filter((x) => x !== id),
        assignments: scrubAssignmentsForMachine(draft.assignments, id, type),
      });
    } else {
      onUpdate({ [key]: [...activeIds, id] });
    }
  }

  const rigsActiveCount = rigs.filter((r) => draft.activeRigIds.includes(r.id)).length;
  const cranesActiveCount = cranes.filter((c) => draft.activeCraneIds.includes(c.id)).length;

  return (
    <>
      {/* Rigs */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Drill size={16} color={TRACK_META.RIG.color} />
          <Text style={styles.groupLabel}>Rigs</Text>
          <Text style={styles.groupCount}>{rigsActiveCount} active</Text>
        </View>
        {rigs.length === 0 ? (
          <Text style={styles.emptyText}>No rigs synced yet.</Text>
        ) : (
          rigs.map((r) => (
            <MachineRow
              key={r.id}
              machine={r}
              active={draft.activeRigIds.includes(r.id)}
              iconColor={TRACK_META.RIG.color}
              icon={<Drill size={16} color={draft.activeRigIds.includes(r.id) ? TRACK_META.RIG.color : colors.textSecondary} />}
              onToggle={() => toggleMachine(r.id, 'RIG')}
            />
          ))
        )}
      </GlassCard>

      {/* Cranes */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Forklift size={16} color={TRACK_META.CRANE.color} />
          <Text style={styles.groupLabel}>Cranes</Text>
          <Text style={styles.groupCount}>{cranesActiveCount} active</Text>
        </View>
        {cranes.length === 0 ? (
          <Text style={styles.emptyText}>No cranes synced yet.</Text>
        ) : (
          cranes.map((c) => {
            const active = draft.activeCraneIds.includes(c.id);
            const craneColor = TRACK_META.CRANE.color;
            return (
              <MachineRow
                key={c.id}
                machine={c}
                active={active}
                iconColor={craneColor}
                icon={<Forklift size={16} color={active ? craneColor : colors.textSecondary} />}
                onToggle={() => toggleMachine(c.id, 'CRANE')}
              />
            );
          })
        )}
      </GlassCard>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    color: colors.accent,
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
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.06)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  machineIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineName: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
  machineNameActive: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
