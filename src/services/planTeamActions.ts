// src/services/planTeamActions.ts
//
// Pure state-transition functions for personnel/role assignment. Moved out
// of (and unifying) TeamAssignStep.tsx's setEngineer/setSupervisor/
// setOperator/updateTeam, StartTimeStep.tsx's Project Manager/Planning
// Engineer handlers, and PreviewStep.tsx's equivalent inline
// getRolePickerConfig branches — all four independently implemented the same
// "spread the role map, set-or-delete the machine's entry" shape before this.

import type { ChecklistPersonnelAssignment, PlanDraft, ShiftTeamAssignment } from '@/types/plan';

export function setProjectManager(draft: PlanDraft, personnelId: string | null): Partial<PlanDraft> {
  return { checklistPersonnel: { ...draft.checklistPersonnel, projectManagerId: personnelId } };
}

export function setPlanningEngineer(draft: PlanDraft, personnelId: string | null): Partial<PlanDraft> {
  return { checklistPersonnel: { ...draft.checklistPersonnel, planningEngineerId: personnelId } };
}

function teamForSlot(cp: ChecklistPersonnelAssignment, slot: 1 | 2): ShiftTeamAssignment {
  return slot === 1 ? cp.shift1 : cp.shift2;
}

function withTeamPatch(draft: PlanDraft, slot: 1 | 2, patch: Partial<ShiftTeamAssignment>): Partial<PlanDraft> {
  const key = slot === 1 ? 'shift1' : 'shift2';
  const team = teamForSlot(draft.checklistPersonnel, slot);
  return { checklistPersonnel: { ...draft.checklistPersonnel, [key]: { ...team, ...patch } } };
}

export function setShiftIncharge(draft: PlanDraft, slot: 1 | 2, personnelId: string | null): Partial<PlanDraft> {
  return withTeamPatch(draft, slot, { shiftInchargeId: personnelId });
}

/**
 * Engineers/Supervisors are only ever assigned to rigs and Operators to
 * either rigs or cranes — that restriction is enforced by the picker's
 * candidate/disabled-id lists (see utils/personnelRoles.ts), not here; this
 * function only ever writes to whichever role's byMachineId map it's told to.
 */
export function setMachineRole(
  draft: PlanDraft,
  slot: 1 | 2,
  role: 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR',
  machineId: string,
  personnelId: string | null,
): Partial<PlanDraft> {
  const team = teamForSlot(draft.checklistPersonnel, slot);
  const fieldKey =
    role === 'ENGINEER' ? 'engineerByMachineId' : role === 'SUPERVISOR' ? 'supervisorByMachineId' : 'operatorByMachineId';
  const nextMap = { ...team[fieldKey] };
  if (personnelId) nextMap[machineId] = personnelId;
  else delete nextMap[machineId];
  return withTeamPatch(draft, slot, { [fieldKey]: nextMap });
}
