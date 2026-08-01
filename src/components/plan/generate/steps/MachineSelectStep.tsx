// src/components/plan/generate/steps/MachineSelectStep.tsx
//
// Step 3 — all synced rigs + cranes are listed. A machine becomes part of
// today's active plan the moment an operator is assigned to it (mandatory,
// enforced by GeneratePlanScreen's canContinue gate for this step) — there
// is no separate on/off switch. Picking "None / Skip" in the operator
// picker un-assigns and deactivates the machine again.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Drill, Forklift } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import AssigneeChip from '@components/shared/AssigneeChip';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import { matchesOperatorDesignation } from '@/utils/personnelRoles';
import { getMachineColor } from '@/utils/helpers';

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
  personnel: SimplePersonnel[];
}

function MachineRow({
  machine,
  assigned,
  iconColor,
  icon,
  operatorName,
  onPress,
}: {
  machine: SimpleMachine;
  assigned: boolean;
  iconColor: string;
  icon: React.ReactNode;
  operatorName: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.machineRow} onPress={onPress}>
      <View style={[styles.machineIcon, { backgroundColor: assigned ? `${iconColor}1F` : 'rgba(28,28,46,0.06)' }]}>
        {icon}
      </View>
      <Text style={[styles.machineName, assigned && styles.machineNameActive]} numberOfLines={1}>
        {machine.machineNo}
      </Text>
      <AssigneeChip name={assigned ? operatorName : null} onPress={onPress} />
    </Pressable>
  );
}

export default function MachineSelectStep({
  draft,
  onUpdate,
  rigs,
  cranes,
  personnel,
}: MachineSelectStepProps) {
  const [operatorPickerFor, setOperatorPickerFor] = useState<{ id: string; type: 'RIG' | 'CRANE' } | null>(
    null,
  );

  function clearMachineRoles(id: string) {
    const { [id]: _op, ...operatorByMachineId } = draft.checklistPersonnel.operatorByMachineId;
    const { [id]: _eng, ...engineerByMachineId } = draft.checklistPersonnel.engineerByMachineId;
    const { [id]: _sup, ...supervisorByMachineId } = draft.checklistPersonnel.supervisorByMachineId;
    onUpdate({
      checklistPersonnel: {
        ...draft.checklistPersonnel,
        operatorByMachineId,
        engineerByMachineId,
        supervisorByMachineId,
      },
    });
  }

  function setOperator(id: string, type: 'RIG' | 'CRANE', personnelId: string | null) {
    if (personnelId) {
      const operatorByMachineId = { ...draft.checklistPersonnel.operatorByMachineId, [id]: personnelId };
      const patch: Partial<PlanDraft> = {
        checklistPersonnel: { ...draft.checklistPersonnel, operatorByMachineId },
      };
      if (type === 'RIG' && !draft.activeRigIds.includes(id)) {
        patch.activeRigIds = [...draft.activeRigIds, id];
      } else if (type === 'CRANE' && !draft.activeCraneIds.includes(id)) {
        patch.activeCraneIds = [...draft.activeCraneIds, id];
      }
      onUpdate(patch);
    } else {
      clearMachineRoles(id);
      if (type === 'RIG') {
        onUpdate({ activeRigIds: draft.activeRigIds.filter((x) => x !== id) });
      } else {
        onUpdate({ activeCraneIds: draft.activeCraneIds.filter((x) => x !== id) });
      }
    }
  }

  // An operator runs one machine at a time — exclude anyone already assigned
  // as operator elsewhere, but still let them show up (and stay selected)
  // for the machine they're currently assigned to.
  const operatorCandidates = operatorPickerFor
    ? personnel.filter((p) => {
        if (!matchesOperatorDesignation(operatorPickerFor.type, p.designation)) return false;
        const assignedToAnotherMachine = Object.entries(draft.checklistPersonnel.operatorByMachineId).some(
          ([machineId, personnelId]) => machineId !== operatorPickerFor.id && personnelId === p.id,
        );
        return !assignedToAnotherMachine;
      })
    : [];

  const rigsAssignedCount = rigs.filter((r) => !!draft.checklistPersonnel.operatorByMachineId[r.id]).length;
  const cranesAssignedCount = cranes.filter((c) => !!draft.checklistPersonnel.operatorByMachineId[c.id]).length;

  return (
    <>
      {/* Rigs */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Drill size={16} color={colors.accent} />
          <Text style={styles.groupLabel}>Rigs</Text>
          <Text style={styles.groupCount}>{rigsAssignedCount} assigned</Text>
        </View>
        {rigs.length === 0 ? (
          <Text style={styles.emptyText}>No rigs synced yet.</Text>
        ) : (
          rigs.map((r) => {
            const operatorId = draft.checklistPersonnel.operatorByMachineId[r.id];
            const assigned = !!operatorId;
            return (
              <MachineRow
                key={r.id}
                machine={r}
                assigned={assigned}
                iconColor={colors.accent}
                icon={<Drill size={16} color={assigned ? colors.accent : colors.textSecondary} />}
                operatorName={personnel.find((p) => p.id === operatorId)?.name ?? null}
                onPress={() => setOperatorPickerFor({ id: r.id, type: 'RIG' })}
              />
            );
          })
        )}
      </GlassCard>

      {/* Cranes */}
      <GlassCard innerStyle={styles.groupPad}>
        <View style={styles.groupHeader}>
          <Forklift size={16} color={colors.machine.craneColors[0]} />
          <Text style={styles.groupLabel}>Cranes</Text>
          <Text style={styles.groupCount}>{cranesAssignedCount} assigned</Text>
        </View>
        {cranes.length === 0 ? (
          <Text style={styles.emptyText}>No cranes synced yet.</Text>
        ) : (
          cranes.map((c, idx) => {
            const operatorId = draft.checklistPersonnel.operatorByMachineId[c.id];
            const assigned = !!operatorId;
            const craneColor = getMachineColor({ id: c.id, type: 'CRANE' }, idx);
            return (
              <MachineRow
                key={c.id}
                machine={c}
                assigned={assigned}
                iconColor={craneColor}
                icon={<Forklift size={16} color={assigned ? craneColor : colors.textSecondary} />}
                operatorName={personnel.find((p) => p.id === operatorId)?.name ?? null}
                onPress={() => setOperatorPickerFor({ id: c.id, type: 'CRANE' })}
              />
            );
          })
        )}
      </GlassCard>

      <AppModal
        visible={!!operatorPickerFor}
        onClose={() => setOperatorPickerFor(null)}
        title="Assign Operator"
        position="center"
      >
        <PersonnelPickerList
          personnel={operatorCandidates}
          selectedId={operatorPickerFor ? draft.checklistPersonnel.operatorByMachineId[operatorPickerFor.id] ?? null : null}
          onSelect={(id) => {
            if (operatorPickerFor) setOperator(operatorPickerFor.id, operatorPickerFor.type, id);
            setOperatorPickerFor(null);
          }}
          allowNone
          emptyLabel="No matching machine operators synced for this site."
        />
      </AppModal>
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
    width: 48,
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
