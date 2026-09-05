// src/services/planMachineActions.ts
//
// Pure state-transition functions for activating/deactivating machines in
// the plan. Moved out of MachineSelectStep.tsx (toggleMachine) and
// useMachineStatusGuard.ts (its stale-machine prune loop) so usePlanDraft's
// toggleMachine action and internal machine-status guard call the same
// implementations.

import { removeMachineFromDraft, type PlanDraft } from '@/types/plan';

/**
 * Deactivating a machine goes through removeMachineFromDraft — the single
 * source of truth for "take this machine out of the plan" (drops it from the
 * active list, unassigns it from any pile, strips its team-role rows).
 * Activating is just an append; there's nothing else to reconcile since a
 * newly-active machine starts with no pile/team assignments of its own.
 */
export function toggleMachineActive(draft: PlanDraft, machineId: string, type: 'RIG' | 'CRANE'): Partial<PlanDraft> {
  const isRig = type === 'RIG';
  const activeIds = isRig ? draft.activeRigIds : draft.activeCraneIds;
  const key = isRig ? 'activeRigIds' : 'activeCraneIds';

  if (activeIds.includes(machineId)) {
    return removeMachineFromDraft(draft, machineId, type);
  }
  return { [key]: [...activeIds, machineId] };
}

/**
 * Removes every machine that is no longer plannable (status changed to
 * BREAKDOWN/INACTIVE mid-session, or was seeded in from stale role
 * defaults/edit-mode data) — same removeMachineFromDraft as a manual
 * deselect, just applied to a whole batch of stale ids at once.
 */
export function pruneInactiveMachines(draft: PlanDraft, staleRigIds: string[], staleCraneIds: string[]): Partial<PlanDraft> {
  let next: PlanDraft = draft;
  for (const id of staleRigIds) next = { ...next, ...removeMachineFromDraft(next, id, 'RIG') };
  for (const id of staleCraneIds) next = { ...next, ...removeMachineFromDraft(next, id, 'CRANE') };
  // Only the fields removeMachineFromDraft ever touches actually changed —
  // returning the accumulated `next` as a patch is safe since every field on
  // it either came from `draft` unchanged or from a removeMachineFromDraft patch.
  const { activeRigIds, activeCraneIds, assignments, checklistPersonnel } = next;
  return { activeRigIds, activeCraneIds, assignments, checklistPersonnel };
}
