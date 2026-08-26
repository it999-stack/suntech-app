// src/components/plan/generate/steps/MachineSelectStep.tsx
//
// Step 3 — all synced rigs + cranes are listed as tiles. Tapping a tile
// toggles it in/out of today's active plan (activeRigIds/activeCraneIds).
// A machine's real, persisted status is a separate concern from that
// toggle: each tile shows a status chip (STATUS_META), tapping it opens
// MachineStatusModal to actually change the machine's status directly.
// BREAKDOWN/INACTIVE machines can't be toggled into the plan at all (tile
// disabled for selection) — see isMachinePlannable. Personnel (engineer/
// supervisor/operator) are assigned per-shift in the Team step;
// deactivating a machine here clears its role rows from both shifts so a
// re-activated machine starts clean.

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import GlassCard from '@components/shared/GlassCard';
import TilePicker, { type TileSection } from '@components/shared/TilePicker';
import type { TileGroupOption } from '@components/shared/TileGroup';
import { spacing } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import { TRACK_META, STATUS_META, isMachinePlannable, type MachineStatus } from '@/utils/helpers';
import type { SimpleMachine } from '@screens/Home/generatePlan/useGeneratePlanData';
import MachineStatusModal from './MachineStatusModal';

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

interface MachineSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
}

export default function MachineSelectStep({ draft, onUpdate, rigs, cranes }: MachineSelectStepProps) {
  // Local mirror of status changes made via MachineStatusModal — the rigs/
  // cranes props only refresh from SQLite on the next machines sync, so
  // this is what makes a status change reflect immediately in this step.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, MachineStatus>>({});
  const [statusTarget, setStatusTarget] = useState<{ id: string; label: string; status: MachineStatus } | null>(
    null,
  );

  function statusFor(m: SimpleMachine): MachineStatus {
    return (statusOverrides[m.id] ?? m.status) as MachineStatus;
  }

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

  function handleToggle(id: string) {
    const isRig = rigs.some((r) => r.id === id);
    toggleMachine(id, isRig ? 'RIG' : 'CRANE');
  }

  // A status change to BREAKDOWN/INACTIVE must drop the machine out of the
  // plan if it was already included — not just block re-selecting it.
  function handleStatusChanged(machineId: string, status: MachineStatus) {
    setStatusOverrides((prev) => ({ ...prev, [machineId]: status }));
    if (!isMachinePlannable(status)) {
      if (draft.activeRigIds.includes(machineId)) toggleMachine(machineId, 'RIG');
      if (draft.activeCraneIds.includes(machineId)) toggleMachine(machineId, 'CRANE');
    }
  }

  function toOption(m: SimpleMachine, type: 'RIG' | 'CRANE'): TileGroupOption {
    const meta = TRACK_META[type];
    const status = statusFor(m);
    const statusMeta = STATUS_META[status];
    return {
      id: m.id,
      label: m.machineNo,
      icon: meta.icon,
      color: meta.color,
      soft: meta.soft,
      disabled: !isMachinePlannable(status),
      statusBadge: {
        text: statusMeta.label,
        color: statusMeta.color,
        soft: statusMeta.soft,
        onPress: () => setStatusTarget({ id: m.id, label: m.machineNo, status }),
      },
    };
  }

  const rigsActiveCount = rigs.filter((r) => draft.activeRigIds.includes(r.id)).length;
  const cranesActiveCount = cranes.filter((c) => draft.activeCraneIds.includes(c.id)).length;

  const sections: TileSection[] = [
    { key: 'RIG', label: `Rigs · ${rigsActiveCount} active`, options: rigs.map((r) => toOption(r, 'RIG')) },
    { key: 'CRANE', label: `Cranes · ${cranesActiveCount} active`, options: cranes.map((c) => toOption(c, 'CRANE')) },
  ];

  const selectedIds = [...draft.activeRigIds, ...draft.activeCraneIds];

  return (
    <>
      <GlassCard innerStyle={styles.groupPad}>
        <TilePicker sections={sections} selectedIds={selectedIds} onToggle={handleToggle} columns={1} />
      </GlassCard>

      {statusTarget && (
        <MachineStatusModal
          visible
          machineId={statusTarget.id}
          machineLabel={statusTarget.label}
          currentStatus={statusTarget.status}
          onClose={() => setStatusTarget(null)}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  groupPad: { padding: spacing.lg },
});
