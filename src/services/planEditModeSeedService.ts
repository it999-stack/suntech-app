// src/services/planEditModeSeedService.ts
//
// Pure edit-mode seed builder: reconstructs a full PlanDraft from an
// existing checklist. Moved out of useEditModeSeed.ts's synchronous
// reconstruction so the hook only does the two repository fetches, then
// calls this + usePlanDraft's seedFromChecklist.

import { defaultPlanDraft, type PlanDraft } from '@/types/plan';
import type { PilingDailyChecklist, PilingChecklistPile, PilingStep, PilingChecklistPersonnel } from '@/db/schema';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { EligiblePile } from '@screens/Home/generatePlan/useGeneratePlanData';

export function buildEditModeDraft(input: {
  checklist: PilingDailyChecklist;
  checklistPiles: PilingChecklistPile[];
  piles: EligiblePile[];
  steps: PilingStep[];
  personnelRows: PilingChecklistPersonnel[];
  planStepRows: PlanStepWithMeta[];
}): PlanDraft {
  const { checklist, checklistPiles, piles, steps, personnelRows, planStepRows } = input;

  const ids = checklistPiles.map((cp) => cp.pileId);
  const assignments: PlanDraft['assignments'] = {};
  checklistPiles.forEach((cp) => {
    assignments[cp.pileId] = { rig: cp.rigId, crane: cp.craneId ?? undefined };
  });

  // Locations aren't stored on the checklist itself — recover them from
  // the locationId of each checklist pile so LocationSelectStep and
  // PileAssignStep (which both derive from draft.locationIds) preselect
  // correctly on edit.
  const pileById = new Map(piles.map((p) => [p.id, p]));
  const locationIds = [...new Set(
    ids
      .map((pileId) => pileById.get(pileId)?.locationId)
      .filter((locationId): locationId is string => !!locationId),
  )];

  const byRole = (role: string) => personnelRows.filter((r) => r.role === role);

  // Reconstruct which CRANE-track steps were previously overridden onto the
  // Rig — this is never persisted as its own field (see stepTrackOverrides'
  // one-off design), only ever expressed through the real plan step's
  // assigned_machine_id — so on re-entering edit mode we derive it back from
  // the checklist's actual persisted schedule, otherwise the very first local
  // recompute below would silently revert those steps back to Crane.
  const craneStepIds = new Set(steps.filter((s) => s.track === 'CRANE').map((s) => s.id));
  const checklistPileById = new Map(checklistPiles.map((cp) => [cp.id, cp]));
  const stepTrackOverrides: PlanDraft['stepTrackOverrides'] = {};
  for (const row of planStepRows) {
    if (!craneStepIds.has(row.stepId)) continue;
    const cp = checklistPileById.get(row.checklistPileId);
    if (!cp || row.assignedMachineId !== cp.rigId) continue;
    const forPile = stepTrackOverrides[cp.pileId] ?? [];
    forPile.push(row.stepId);
    stepTrackOverrides[cp.pileId] = forPile;
  }
  const byRoleAndSlot = (role: string, slot: 1 | 2) =>
    personnelRows.filter((r) => r.role === role && r.shiftSlot === slot);
  const buildTeamForSlot = (slot: 1 | 2): PlanDraft['checklistPersonnel']['shift1'] => ({
    shiftInchargeId: byRole('SHIFT_INCHARGE').find((r) => r.shiftSlot === slot)?.personnelId ?? null,
    engineerByMachineId: Object.fromEntries(
      byRoleAndSlot('ENGINEER', slot)
        .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
        .map((r) => [r.machineId, r.personnelId]),
    ),
    supervisorByMachineId: Object.fromEntries(
      byRoleAndSlot('SUPERVISOR', slot)
        .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
        .map((r) => [r.machineId, r.personnelId]),
    ),
    operatorByMachineId: Object.fromEntries(
      byRoleAndSlot('MACHINE_OPERATOR', slot)
        .filter((r): r is typeof r & { machineId: string } => !!r.machineId)
        .map((r) => [r.machineId, r.personnelId]),
    ),
  });
  const checklistPersonnel: PlanDraft['checklistPersonnel'] = {
    projectManagerId: byRole('PROJECT_MANAGER')[0]?.personnelId ?? null,
    planningEngineerId: byRole('PLANNING_ENGINEER')[0]?.personnelId ?? null,
    shift1: buildTeamForSlot(1),
    shift2: buildTeamForSlot(2),
  };

  return {
    date: checklist.date,
    planStartTime: checklist.planStartTime ?? defaultPlanDraft(checklist.date).planStartTime,
    activeRigIds: [...new Set(checklistPiles.map((cp) => cp.rigId))],
    activeCraneIds: [...new Set(
      checklistPiles.map((cp) => cp.craneId).filter((id): id is string => !!id),
    )],
    selectedPileIds: ids,
    locationIds,
    selectedStepIds: steps.map((s) => s.id),
    assignments,
    resumeWorkByPileId: {},
    // Seeding an existing checklist replaces the whole draft, so any
    // close-out staged before entering edit mode is discarded with it.
    pendingCloseOuts: {},
    stepTrackOverrides,
    checklistPersonnel,
    shiftTypeId: checklist.shiftTypeId ?? null,
  };
}
