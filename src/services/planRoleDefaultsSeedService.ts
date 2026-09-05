// src/services/planRoleDefaultsSeedService.ts
//
// Pure fresh-plan seed builder: pre-fills every role from the site's
// last-used defaults (reuse requirement). Machines with a saved
// MACHINE_OPERATOR default (either shift) come in pre-activated; machines
// without one stay inactive until the user manually toggles them on in
// MachineSelectStep. Moved out of useRoleDefaultsSeed.ts so the hook is a
// thin effect calling this + usePlanDraft's seedRoleDefaults.

import type { ShiftTeamAssignment } from '@/types/plan';
import type { PilingSiteRoleDefault } from '@/db/schema';
import type { SimplePersonnel } from '@/utils/personnelRoles';
import { isMachinePlannable } from '@/utils/helpers';
import type { SimpleMachine } from '@screens/Home/generatePlan/useGeneratePlanData';

export type RoleDefaultsSeed = {
  activeRigIds: string[];
  activeCraneIds: string[];
  projectManagerId: string | null;
  planningEngineerId: string | null;
  shift1: ShiftTeamAssignment;
  shift2: ShiftTeamAssignment;
};

export function buildRoleDefaultsSeed(args: {
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  roleDefaults: PilingSiteRoleDefault[];
  personnel: SimplePersonnel[];
}): RoleDefaultsSeed {
  const { rigs, cranes, roleDefaults, personnel } = args;

  // BREAKDOWN/INACTIVE machines are excluded up front — a "last used" role
  // default pointing at one must not resurrect it into the plan, since
  // MachineSelectStep won't let it be selected (or staffed) anyway.
  const rigIds = new Set(rigs.filter((r) => isMachinePlannable(r.status)).map((r) => r.id));
  const craneIds = new Set(cranes.filter((c) => isMachinePlannable(c.status)).map((c) => c.id));
  const activePersonnelIds = new Set(personnel.filter((p) => p.isActive).map((p) => p.id));
  const findSingleton = (role: string) => {
    const id = roleDefaults.find((d) => d.role === role && d.shiftSlot == null)?.personnelId ?? null;
    return id && activePersonnelIds.has(id) ? id : null;
  };

  function buildTeamForSlot(slot: 1 | 2): ShiftTeamAssignment {
    const engineerByMachineId: Record<string, string> = {};
    const supervisorByMachineId: Record<string, string> = {};
    const operatorByMachineId: Record<string, string> = {};
    // An operator can only run one machine per shift (unlike Engineer/Supervisor,
    // which may legitimately cover several) — track claimed ids so a person whose
    // "last used" default was saved for two different machines in this same slot
    // (e.g. across two separate earlier plans) doesn't get seeded onto both at once,
    // which the backend rejects as a double-booking.
    const claimedOperatorIds = new Set<string>();
    for (const d of roleDefaults) {
      if (d.shiftSlot !== slot) continue;
      if (!d.machineId || (!rigIds.has(d.machineId) && !craneIds.has(d.machineId))) continue;
      if (!activePersonnelIds.has(d.personnelId)) continue;
      // Engineers and Supervisors are only ever assigned to rigs now — a
      // stale/legacy default for a crane must not resurrect an assignment
      // the Team step no longer lets a user create.
      if (d.role === 'ENGINEER') {
        if (rigIds.has(d.machineId)) engineerByMachineId[d.machineId] = d.personnelId;
      } else if (d.role === 'SUPERVISOR') {
        if (rigIds.has(d.machineId)) supervisorByMachineId[d.machineId] = d.personnelId;
      } else if (d.role === 'MACHINE_OPERATOR') {
        if (claimedOperatorIds.has(d.personnelId)) continue;
        claimedOperatorIds.add(d.personnelId);
        operatorByMachineId[d.machineId] = d.personnelId;
      }
    }
    const shiftInchargeDefaultId =
      roleDefaults.find((d) => d.role === 'SHIFT_INCHARGE' && d.shiftSlot === slot)?.personnelId ?? null;
    return {
      shiftInchargeId:
        shiftInchargeDefaultId && activePersonnelIds.has(shiftInchargeDefaultId) ? shiftInchargeDefaultId : null,
      engineerByMachineId,
      supervisorByMachineId,
      operatorByMachineId,
    };
  }

  const shift1Raw = buildTeamForSlot(1);
  const shift2Raw = buildTeamForSlot(2);

  // MACHINE_OPERATOR defaults are the ONLY signal that decides which
  // machines the plan starts active with (see activeRigIds/activeCraneIds
  // below) — a saved ENGINEER/SUPERVISOR default must never be able to
  // smuggle a machine's team assignment into the draft on its own, since
  // MachineSelectStep won't show that machine as selected and the user
  // never had a chance to staff it. Filtering every role map against this
  // same set (not just engineer/supervisor) keeps the invariant explicit
  // rather than relying on operatorByMachineId happening to already agree
  // with it by construction.
  const activeMachineIds = new Set<string>([
    ...Object.keys(shift1Raw.operatorByMachineId),
    ...Object.keys(shift2Raw.operatorByMachineId),
  ]);

  function keepOnlyActiveMachines(team: ShiftTeamAssignment): ShiftTeamAssignment {
    const filterByActive = (byMachineId: Record<string, string>) =>
      Object.fromEntries(Object.entries(byMachineId).filter(([machineId]) => activeMachineIds.has(machineId)));
    return {
      ...team,
      operatorByMachineId: filterByActive(team.operatorByMachineId),
      engineerByMachineId: filterByActive(team.engineerByMachineId),
      supervisorByMachineId: filterByActive(team.supervisorByMachineId),
    };
  }

  const shift1 = keepOnlyActiveMachines(shift1Raw);
  const shift2 = keepOnlyActiveMachines(shift2Raw);

  return {
    activeRigIds: rigs
      .filter((r) => !!shift1.operatorByMachineId[r.id] || !!shift2.operatorByMachineId[r.id])
      .map((r) => r.id),
    activeCraneIds: cranes
      .filter((c) => !!shift1.operatorByMachineId[c.id] || !!shift2.operatorByMachineId[c.id])
      .map((c) => c.id),
    projectManagerId: findSingleton('PROJECT_MANAGER'),
    planningEngineerId: findSingleton('PLANNING_ENGINEER'),
    shift1,
    shift2,
  };
}
