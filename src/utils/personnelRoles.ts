// src/utils/personnelRoles.ts
// Shared helpers for the checklist-personnel role system (see
// core/models/piling.py::PilingPersonnelRole on the backend).
//
// Designation matching here is a client-side UX convenience for filtering
// picker candidate lists only — it is NOT a security/authorization boundary.
// The backend accepts any active site-personnel row for any role; see
// checklist_personnel_service.py's own note on this.

import type { ChecklistPersonnelAssignment } from '@/types/plan';

export interface SimplePersonnel {
  id: string;
  name: string;
  designation: string;
}

export interface SimpleMachine {
  id: string;
  machineNo: string;
}

export type PersonnelRole =
  | 'PROJECT_MANAGER'
  | 'PLANNING_ENGINEER'
  | 'SHIFT_INCHARGE'
  | 'ENGINEER'
  | 'SUPERVISOR'
  | 'MACHINE_OPERATOR';

const EXACT_ROLE_LABELS: Record<
  'PROJECT_MANAGER' | 'PLANNING_ENGINEER' | 'SHIFT_INCHARGE' | 'ENGINEER' | 'SUPERVISOR',
  string
> = {
  PROJECT_MANAGER: 'project manager',
  PLANNING_ENGINEER: 'planning engineer',
  SHIFT_INCHARGE: 'shift incharge',
  ENGINEER: 'engineer',
  SUPERVISOR: 'supervisor',
};

/**
 * Exact, case-insensitive match against the role's canonical designation
 * label. Deliberately exact (not a substring match) — a naive "contains
 * 'engineer'" rule would incorrectly also match "Planning Engineer" people
 * for the ENGINEER role.
 */
export function matchesRoleDesignation(
  role: keyof typeof EXACT_ROLE_LABELS,
  designation: string,
): boolean {
  return designation.trim().toLowerCase() === EXACT_ROLE_LABELS[role];
}

/**
 * Fuzzy match for Machine Operator candidates, since real designations are
 * inconsistently named in practice ("Rig Operator" / "Crane Operator" /
 * generic "Machine Operator"). A RIG machine accepts designations containing
 * "rig" or "machine"; a CRANE machine accepts "crane" or "machine" — so a
 * generic "Machine Operator" person is offered as a candidate for both
 * types, while a specifically-named "Rig Operator"/"Crane Operator" only
 * shows up for their matching machine type.
 */
export function matchesOperatorDesignation(
  machineType: 'RIG' | 'CRANE',
  designation: string,
): boolean {
  const d = designation.trim().toLowerCase();
  return machineType === 'RIG' ? d.includes('rig') || d.includes('machine') : d.includes('crane') || d.includes('machine');
}

export interface PairedSupervisorMachines {
  rig?: SimpleMachine;
  crane?: SimpleMachine;
}

/**
 * Maps each supervisor's personnel id to whichever rig and/or crane they
 * currently hold — a supervisor may hold at most one of each at a time (see
 * getSupervisorCandidates below), so this is always at most a {rig, crane}
 * pair, never a list.
 */
export function buildPairedMachinesBySupervisor(
  supervisorByMachineId: Record<string, string>,
  activeRigs: SimpleMachine[],
  activeCranes: SimpleMachine[],
): Record<string, PairedSupervisorMachines> {
  const map: Record<string, PairedSupervisorMachines> = {};
  for (const [machineId, personnelId] of Object.entries(supervisorByMachineId)) {
    map[personnelId] = map[personnelId] ?? {};
    const rig = activeRigs.find((r) => r.id === machineId);
    if (rig) map[personnelId].rig = rig;
    else map[personnelId].crane = activeCranes.find((c) => c.id === machineId);
  }
  return map;
}

/**
 * Candidate supervisors for one machine: a supervisor may hold at most one
 * rig and one crane at a time, so anyone already holding a machine of the
 * SAME type elsewhere is excluded — unless it's this exact machine (so the
 * currently-assigned supervisor still shows up as a valid, already-selected
 * candidate).
 */
export function getSupervisorCandidates(
  machineId: string,
  isRig: boolean,
  supervisors: SimplePersonnel[],
  pairedMachineBySupervisor: Record<string, PairedSupervisorMachines>,
): SimplePersonnel[] {
  return supervisors.filter((p) => {
    const heldOfSameType = isRig ? pairedMachineBySupervisor[p.id]?.rig : pairedMachineBySupervisor[p.id]?.crane;
    return !heldOfSameType || heldOfSameType.id === machineId;
  });
}

/** One row of the `checklist_personnel` array sent to POST /plans/generate. */
export type ChecklistPersonnelRow = {
  personnel_id: string;
  role: PersonnelRole;
  machine_id?: string | null;
  shift_slot?: number | null;
};

/**
 * Flattens the draft's role-assignment maps into the row-per-(role,
 * machine/shift-slot) shape the backend expects — the inverse of however
 * GeneratePlanScreen rebuilds a ChecklistPersonnelAssignment from
 * getChecklistPersonnel() on edit-mode load.
 */
export function buildChecklistPersonnelPayload(
  cp: ChecklistPersonnelAssignment,
): ChecklistPersonnelRow[] {
  const rows: ChecklistPersonnelRow[] = [];
  if (cp.projectManagerId) rows.push({ personnel_id: cp.projectManagerId, role: 'PROJECT_MANAGER' });
  if (cp.planningEngineerId) rows.push({ personnel_id: cp.planningEngineerId, role: 'PLANNING_ENGINEER' });
  if (cp.shiftInchargeId) rows.push({ personnel_id: cp.shiftInchargeId, role: 'SHIFT_INCHARGE', shift_slot: 1 });
  if (cp.shiftInchargeId2) rows.push({ personnel_id: cp.shiftInchargeId2, role: 'SHIFT_INCHARGE', shift_slot: 2 });
  for (const [machineId, personnelId] of Object.entries(cp.engineerByMachineId)) {
    rows.push({ personnel_id: personnelId, role: 'ENGINEER', machine_id: machineId });
  }
  for (const [machineId, personnelId] of Object.entries(cp.supervisorByMachineId)) {
    rows.push({ personnel_id: personnelId, role: 'SUPERVISOR', machine_id: machineId });
  }
  for (const [machineId, personnelId] of Object.entries(cp.operatorByMachineId)) {
    rows.push({ personnel_id: personnelId, role: 'MACHINE_OPERATOR', machine_id: machineId });
  }
  return rows;
}
