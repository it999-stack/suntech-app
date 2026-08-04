// src/screens/Home/generatePlan/useRoleDefaultsSeed.ts
//
// Pre-fills every role from the site's last-used defaults (reuse
// requirement). Machines with a saved MACHINE_OPERATOR default (either
// shift) come in pre-activated; machines without one stay inactive until
// the user manually toggles them on in MachineSelectStep.

import { useEffect, useRef } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { PilingSiteRoleDefault } from '@/db/schema';
import type { SimpleMachine } from './useGeneratePlanData';

export function useRoleDefaultsSeed(args: {
  dataLoading: boolean;
  isEditMode: boolean;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  roleDefaults: PilingSiteRoleDefault[];
  setDraft: (updater: (prev: PlanDraft) => PlanDraft) => void;
}): void {
  const { dataLoading, isEditMode, rigs, cranes, roleDefaults, setDraft } = args;

  const roleDefaultsSeeded = useRef(false);
  useEffect(() => {
    if (dataLoading || roleDefaultsSeeded.current || isEditMode) return;
    if (rigs.length === 0 && cranes.length === 0 && roleDefaults.length === 0) return;
    roleDefaultsSeeded.current = true;

    const rigIds = new Set(rigs.map((r) => r.id));
    const craneIds = new Set(cranes.map((c) => c.id));
    const findSingleton = (role: string) =>
      roleDefaults.find((d) => d.role === role && d.shiftSlot == null)?.personnelId ?? null;

    function buildTeamForSlot(slot: 1 | 2): PlanDraft['checklistPersonnel']['shift1'] {
      const engineerByMachineId: Record<string, string> = {};
      const supervisorByMachineId: Record<string, string> = {};
      const operatorByMachineId: Record<string, string> = {};
      for (const d of roleDefaults) {
        if (d.shiftSlot !== slot) continue;
        if (!d.machineId || (!rigIds.has(d.machineId) && !craneIds.has(d.machineId))) continue;
        // Engineers and Supervisors are only ever assigned to rigs now — a
        // stale/legacy default for a crane must not resurrect an assignment
        // the Team step no longer lets a user create.
        if (d.role === 'ENGINEER') {
          if (rigIds.has(d.machineId)) engineerByMachineId[d.machineId] = d.personnelId;
        } else if (d.role === 'SUPERVISOR') {
          if (rigIds.has(d.machineId)) supervisorByMachineId[d.machineId] = d.personnelId;
        } else if (d.role === 'MACHINE_OPERATOR') operatorByMachineId[d.machineId] = d.personnelId;
      }
      return {
        shiftInchargeId: roleDefaults.find((d) => d.role === 'SHIFT_INCHARGE' && d.shiftSlot === slot)?.personnelId ?? null,
        engineerByMachineId,
        supervisorByMachineId,
        operatorByMachineId,
      };
    }

    const shift1 = buildTeamForSlot(1);
    const shift2 = buildTeamForSlot(2);

    setDraft((prev) => ({
      ...prev,
      activeRigIds: rigs
        .filter((r) => !!shift1.operatorByMachineId[r.id] || !!shift2.operatorByMachineId[r.id])
        .map((r) => r.id),
      activeCraneIds: cranes
        .filter((c) => !!shift1.operatorByMachineId[c.id] || !!shift2.operatorByMachineId[c.id])
        .map((c) => c.id),
      checklistPersonnel: {
        ...prev.checklistPersonnel,
        projectManagerId: findSingleton('PROJECT_MANAGER'),
        planningEngineerId: findSingleton('PLANNING_ENGINEER'),
        shift1,
        shift2,
      },
    }));
  }, [dataLoading, roleDefaults, isEditMode, rigs, cranes]);
}
