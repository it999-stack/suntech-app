// src/components/plan/generate/steps/TeamAssignStep.tsx

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Drill, Forklift } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import AppModal from '@components/shared/AppModal';
import AssigneeChip from '@components/shared/AssigneeChip';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import {
  matchesRoleDesignation,
  buildPairedMachinesBySupervisor,
  getSupervisorCandidates,
  type SimpleMachine,
} from '@/utils/personnelRoles';

interface TeamAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
  personnel: SimplePersonnel[];
}

function SupervisorMachineRow({
  machine,
  icon,
  pairedWith,
  supervisorName,
  onPress,
}: {
  machine: SimpleMachine;
  icon: React.ReactNode;
  pairedWith: string | null;
  supervisorName: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.machineTeamRow} onPress={onPress}>
      <View style={styles.machineIcon}>{icon}</View>
      <View style={styles.supervisorRowInfo}>
        <Text style={styles.supervisorMachineNo}>{machine.machineNo}</Text>
        {pairedWith ? <Text style={styles.pairedWithText}>⇄ paired with {pairedWith}</Text> : null}
      </View>
      <AssigneeChip name={supervisorName} onPress={onPress} />
    </Pressable>
  );
}

export default function TeamAssignStep({
  draft,
  onUpdate,
  activeRigs,
  activeCranes,
  personnel,
}: TeamAssignStepProps) {
  const engineers = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('ENGINEER', p.designation)),
    [personnel],
  );
  const supervisors = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('SUPERVISOR', p.designation)),
    [personnel],
  );

  function updatePersonnel(patch: Partial<PlanDraft['checklistPersonnel']>) {
    onUpdate({ checklistPersonnel: { ...draft.checklistPersonnel, ...patch } });
  }

  // ── Engineers: one picker per rig, group emerges from repeated picks ──

  const [engineerPickerFor, setEngineerPickerFor] = useState<string | null>(null);

  function setEngineer(machineId: string, personnelId: string | null) {
    const engineerByMachineId = { ...draft.checklistPersonnel.engineerByMachineId };
    if (personnelId) engineerByMachineId[machineId] = personnelId;
    else delete engineerByMachineId[machineId];
    updatePersonnel({ engineerByMachineId });
  }

  // ── Supervisors: assigned independently per machine (tap a rig, tap a
  // crane, same as Engineers) — but a supervisor may hold at most one rig
  // and one crane at a time, so picking someone for a crane who's already
  // on a rig pairs them together; picking someone already on a different
  // rig/crane of the SAME type simply isn't offered as a candidate. The
  // "paired with" caption is derived by finding whichever machine of the
  // other type currently shares the same supervisor id — not by position.

  const [supervisorPickerFor, setSupervisorPickerFor] = useState<string | null>(null);

  function setSupervisor(machineId: string, personnelId: string | null) {
    const supervisorByMachineId = { ...draft.checklistPersonnel.supervisorByMachineId };
    if (personnelId) supervisorByMachineId[machineId] = personnelId;
    else delete supervisorByMachineId[machineId];
    updatePersonnel({ supervisorByMachineId });
  }

  const pairedMachineBySupervisor = useMemo(
    () => buildPairedMachinesBySupervisor(draft.checklistPersonnel.supervisorByMachineId, activeRigs, activeCranes),
    [draft.checklistPersonnel.supervisorByMachineId, activeRigs, activeCranes],
  );

  const supervisorPickerIsRig = supervisorPickerFor ? activeRigs.some((r) => r.id === supervisorPickerFor) : null;
  const supervisorCandidates = useMemo(() => {
    if (supervisorPickerFor === null || supervisorPickerIsRig === null) return [];
    return getSupervisorCandidates(supervisorPickerFor, supervisorPickerIsRig, supervisors, pairedMachineBySupervisor);
  }, [supervisorPickerFor, supervisorPickerIsRig, supervisors, pairedMachineBySupervisor]);

  return (
    <>
      <Accordion defaultOpen header={<Text style={styles.sectionLabel}>Engineers</Text>}>
        {activeRigs.length === 0 ? (
          <Text style={styles.emptyText}>No active rigs — go back and assign an operator to at least one rig.</Text>
        ) : (
          activeRigs.map((r) => {
            const assignedId = draft.checklistPersonnel.engineerByMachineId[r.id];
            const assignedName = personnel.find((p) => p.id === assignedId)?.name ?? null;
            return (
              <Pressable
                key={r.id}
                style={styles.machineTeamRow}
                onPress={() => setEngineerPickerFor(r.id)}
              >
                <View style={styles.machineIcon}>
                  <Drill size={16} color={colors.accent} />
                </View>
                <Text style={styles.machineTeamNo}>{r.machineNo}</Text>
                <AssigneeChip name={assignedName} onPress={() => setEngineerPickerFor(r.id)} />
              </Pressable>
            );
          })
        )}
      </Accordion>

      <Accordion defaultOpen header={<Text style={styles.sectionLabel}>Supervisors</Text>}>
        {activeRigs.length === 0 && activeCranes.length === 0 ? (
          <Text style={styles.emptyText}>
            No active machines — go back and assign an operator to at least one rig or crane.
          </Text>
        ) : (
          <>
            {activeRigs.map((r) => {
              const assignedId = draft.checklistPersonnel.supervisorByMachineId[r.id];
              const supervisorName = personnel.find((p) => p.id === assignedId)?.name ?? null;
              const pairedCrane = assignedId ? pairedMachineBySupervisor[assignedId]?.crane : undefined;
              return (
                <SupervisorMachineRow
                  key={r.id}
                  machine={r}
                  icon={<Drill size={16} color={colors.accent} />}
                  pairedWith={pairedCrane?.machineNo ?? null}
                  supervisorName={supervisorName}
                  onPress={() => setSupervisorPickerFor(r.id)}
                />
              );
            })}
            {activeCranes.map((c) => {
              const assignedId = draft.checklistPersonnel.supervisorByMachineId[c.id];
              const supervisorName = personnel.find((p) => p.id === assignedId)?.name ?? null;
              const pairedRig = assignedId ? pairedMachineBySupervisor[assignedId]?.rig : undefined;
              return (
                <SupervisorMachineRow
                  key={c.id}
                  machine={c}
                  icon={<Forklift size={16} color={colors.accent} />}
                  pairedWith={pairedRig?.machineNo ?? null}
                  supervisorName={supervisorName}
                  onPress={() => setSupervisorPickerFor(c.id)}
                />
              );
            })}
          </>
        )}
      </Accordion>

      {/* ── Engineer picker modal ─────────────────────────────────────────── */}
      <AppModal
        visible={!!engineerPickerFor}
        onClose={() => setEngineerPickerFor(null)}
        title="Assign Engineer"
        position="center"
      >
        <PersonnelPickerList
          personnel={engineers}
          selectedId={engineerPickerFor ? draft.checklistPersonnel.engineerByMachineId[engineerPickerFor] ?? null : null}
          onSelect={(id) => {
            if (engineerPickerFor) setEngineer(engineerPickerFor, id);
            setEngineerPickerFor(null);
          }}
          allowNone={false}
          emptyLabel="No matching engineers synced for this site."
        />
      </AppModal>

      {/* ── Supervisor picker modal ───────────────────────────────────────── */}
      <AppModal
        visible={!!supervisorPickerFor}
        onClose={() => setSupervisorPickerFor(null)}
        title="Assign Supervisor"
        position="center"
      >
        <PersonnelPickerList
          personnel={supervisorCandidates}
          selectedId={supervisorPickerFor ? draft.checklistPersonnel.supervisorByMachineId[supervisorPickerFor] ?? null : null}
          onSelect={(id) => {
            if (supervisorPickerFor) setSupervisor(supervisorPickerFor, id);
            setSupervisorPickerFor(null);
          }}
          emptyLabel="No matching supervisors synced for this site."
        />
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  machineTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28,28,46,0.04)',
    marginBottom: spacing.xs,
  },
  machineIcon: { width: 24, alignItems: 'center' },
  machineTeamNo: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  supervisorRowInfo: { flex: 1 },
  supervisorMachineNo: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pairedWithText: {
    ...typography.caption,
    color: colors.success,
    marginTop: 1,
  },
});