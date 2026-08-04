// src/utils/personnelRoles.ts
// Shared helpers for the checklist-personnel role system (see
// core/models/piling.py::PilingPersonnelRole on the backend).
//
// Designation matching here is a client-side UX convenience for filtering
// picker candidate lists only — it is NOT a security/authorization boundary.
// The backend accepts any active site-personnel row for any role; see
// checklist_personnel_service.py's own note on this.

import type { ChecklistPersonnelAssignment, ShiftTeamAssignment } from '@/types/plan';

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

/**
 * Candidate operators for a machine type, filtered by designation only. Already-assigned
 * exclusion is surfaced separately as a disabled (not hidden) state via
 * getMachineRoleDisabledIds, so every designation-matching person always appears in the list.
 */
export function getOperatorMachineCandidates(
  machineType: 'RIG' | 'CRANE',
  personnel: SimplePersonnel[],
): SimplePersonnel[] {
  return personnel.filter((p) => matchesOperatorDesignation(machineType, p.designation));
}

/**
 * Person ids that should show as disabled (visible in the list, not selectable) for a
 * per-machine role — Engineer, Supervisor, or Machine Operator — on a given machine+shift:
 *  - always disables anyone already assigned to this same role in the OTHER shift (any
 *    machine) — nobody can work both shifts.
 *  - additionally disables anyone assigned to a DIFFERENT machine in THIS SAME shift only
 *    when `excludeSameShiftOtherMachines` is set — Engineers/Supervisors may cover several
 *    machines in one shift, but an Operator runs exactly one machine at a time.
 */
export function getMachineRoleDisabledIds(
  machineId: string,
  thisShiftMap: Record<string, string>,
  otherShiftMap: Record<string, string>,
  options: { excludeSameShiftOtherMachines: boolean },
): Set<string> {
  const disabled = new Set<string>();
  for (const personnelId of Object.values(otherShiftMap)) {
    if (personnelId) disabled.add(personnelId);
  }
  if (options.excludeSameShiftOtherMachines) {
    for (const [otherMachineId, personnelId] of Object.entries(thisShiftMap)) {
      if (personnelId && otherMachineId !== machineId) disabled.add(personnelId);
    }
  }
  return disabled;
}

/** Person id that should show as disabled for Shift Incharge — whoever's already the OTHER
 * shift's incharge (a single plan-wide slot per shift, no per-machine concept). */
export function getShiftInchargeDisabledIds(otherShiftInchargeId: string | null | undefined): Set<string> {
  return new Set(otherShiftInchargeId ? [otherShiftInchargeId] : []);
}

export type MissingTeamField =
  | { role: 'ENGINEER'; machineId: string }
  | { role: 'SUPERVISOR'; machineId: string }
  | { role: 'MACHINE_OPERATOR'; machineId: string };

/**
 * The first still-unfilled mandatory role in a shift's team, in the same
 * order the Team step displays them (Engineers → Supervisors → Rig
 * Operators → Crane Operators). `shiftInchargeId` is deliberately not
 * checked — it's optional (see ShiftTeamAssignment) and isn't required by
 * isShiftTeamComplete either, so this must stay consistent with that.
 */
export function findFirstMissingTeamField(
  team: ShiftTeamAssignment,
  activeRigIds: string[],
  activeCraneIds: string[],
): MissingTeamField | null {
  for (const machineId of activeRigIds) {
    if (!team.engineerByMachineId[machineId]) return { role: 'ENGINEER', machineId };
  }
  for (const machineId of activeRigIds) {
    if (!team.supervisorByMachineId[machineId]) return { role: 'SUPERVISOR', machineId };
  }
  for (const machineId of [...activeRigIds, ...activeCraneIds]) {
    if (!team.operatorByMachineId[machineId]) return { role: 'MACHINE_OPERATOR', machineId };
  }
  return null;
}

/** True when every mandatory role for this shift's active machines is filled. */
export function isShiftTeamComplete(
  team: ShiftTeamAssignment,
  activeRigIds: string[],
  activeCraneIds: string[],
): boolean {
  return findFirstMissingTeamField(team, activeRigIds, activeCraneIds) === null;
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
 * machine, shift-slot) shape the backend expects — the inverse of however
 * GeneratePlanScreen rebuilds a ChecklistPersonnelAssignment from
 * getChecklistPersonnel() on edit-mode load.
 */
export function buildChecklistPersonnelPayload(
  cp: ChecklistPersonnelAssignment,
): ChecklistPersonnelRow[] {
  const rows: ChecklistPersonnelRow[] = [];
  if (cp.projectManagerId) rows.push({ personnel_id: cp.projectManagerId, role: 'PROJECT_MANAGER' });
  if (cp.planningEngineerId) rows.push({ personnel_id: cp.planningEngineerId, role: 'PLANNING_ENGINEER' });

  for (const [slot, team] of [[1, cp.shift1], [2, cp.shift2]] as const) {
    if (team.shiftInchargeId) {
      rows.push({ personnel_id: team.shiftInchargeId, role: 'SHIFT_INCHARGE', shift_slot: slot });
    }
    for (const [machineId, personnelId] of Object.entries(team.engineerByMachineId)) {
      rows.push({ personnel_id: personnelId, role: 'ENGINEER', machine_id: machineId, shift_slot: slot });
    }
    for (const [machineId, personnelId] of Object.entries(team.supervisorByMachineId)) {
      rows.push({ personnel_id: personnelId, role: 'SUPERVISOR', machine_id: machineId, shift_slot: slot });
    }
    for (const [machineId, personnelId] of Object.entries(team.operatorByMachineId)) {
      rows.push({ personnel_id: personnelId, role: 'MACHINE_OPERATOR', machine_id: machineId, shift_slot: slot });
    }
  }
  return rows;
}
