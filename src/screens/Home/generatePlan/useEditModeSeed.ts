// src/screens/Home/generatePlan/useEditModeSeed.ts
//
// Edit mode reconstructs a full PlanDraft from an existing checklist instead
// of starting from defaultPlanDraft. Runs once data has loaded, then jumps
// straight to the preview step. If edit mode was requested but no checklist
// exists for the date, there's nothing to seed — just release the loading gate.

import { useEffect, useRef, useState } from 'react';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getPlanStepsForChecklist } from '@repositories/planRepository';
import { defaultPlanDraft, type PlanDraft } from '@/types/plan';
import type { PilingDailyChecklist, PilingChecklistPile, PilingStep } from '@/db/schema';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { EligiblePile } from './useGeneratePlanData';

export function useEditModeSeed(args: {
  isEditMode: boolean;
  dataLoading: boolean;
  checklistLoading: boolean;
  checklist: PilingDailyChecklist | null;
  checklistPiles: PilingChecklistPile[];
  piles: EligiblePile[];
  steps: PilingStep[];
  setDraft: (draft: PlanDraft) => void;
  setStep: (step: Step) => void;
}): { editSeeding: boolean } {
  const { isEditMode, dataLoading, checklistLoading, checklist, checklistPiles, piles, steps, setDraft, setStep } = args;

  // True until the draft-seeding effect below has fully applied the existing
  // checklist and jumped to the preview step — keeps the wizard's loading
  // gate up so it never renders on the default 'start' step first.
  const [editSeeding, setEditSeeding] = useState(isEditMode);

  const seeded = useRef(false);
  useEffect(() => {
    if (!isEditMode || dataLoading || !checklist || !checklistPiles.length || seeded.current) return;
    seeded.current = true;

    (async () => {
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

      const personnelRows = await getChecklistPersonnel(checklist.id);
      const byRole = (role: string) => personnelRows.filter((r) => r.role === role);

      // Reconstruct which CRANE-track steps were previously overridden onto the
      // Rig — this is never persisted as its own field (see stepTrackOverrides'
      // one-off design), only ever expressed through the real plan step's
      // assigned_machine_id — so on re-entering edit mode we derive it back from
      // the checklist's actual persisted schedule, otherwise the very first local
      // recompute below would silently revert those steps back to Crane.
      const craneStepIds = new Set(steps.filter((s) => s.track === 'CRANE').map((s) => s.id));
      const checklistPileById = new Map(checklistPiles.map((cp) => [cp.id, cp]));
      const planStepRows = await getPlanStepsForChecklist(checklist.id);
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

      setDraft({
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
        stepTrackOverrides,
        checklistPersonnel,
        shiftTypeId: checklist.shiftTypeId ?? null,
      });

      // Skip directly to the preview step when editing an existing plan
      setStep('preview');
      setEditSeeding(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, dataLoading, checklist, checklistPiles, piles]);

  // Edit mode was requested but no checklist exists for this date — nothing
  // to seed, so release the loading gate and fall back to the normal wizard.
  useEffect(() => {
    if (!isEditMode || checklistLoading || checklist || seeded.current) return;
    setEditSeeding(false);
  }, [isEditMode, checklistLoading, checklist]);

  return { editSeeding };
}
