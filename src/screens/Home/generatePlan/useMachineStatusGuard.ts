// src/screens/Home/generatePlan/useMachineStatusGuard.ts
//
// Detects any active rig/crane that is no longer plannable (status changed
// mid-session, or seeded in stale from role defaults/edit-mode data) and
// applies the prune via usePlanDraft's applyPrune callback. The actual
// removal logic is planMachineActions.ts's pruneInactiveMachines
// (built on top of removeMachineFromDraft) — this hook only ever detects.

import { useEffect } from 'react';
import type { PlanDraft } from '@/types/plan';
import { isMachinePlannable } from '@/utils/helpers';
import type { SimpleMachine } from './useGeneratePlanData';

export function useMachineStatusGuard(args: {
  dataLoading: boolean;
  editSeeding: boolean;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  draft: PlanDraft;
  applyPrune: (staleRigIds: string[], staleCraneIds: string[]) => void;
}): void {
  const { dataLoading, editSeeding, rigs, cranes, draft, applyPrune } = args;

  useEffect(() => {
    // Wait for both the reference machine list and any edit-mode seeding to
    // finish — pruning against a not-yet-loaded/seeded draft would otherwise
    // remove ids that just haven't landed yet.
    if (dataLoading || editSeeding) return;

    const rigById = new Map(rigs.map((r) => [r.id, r]));
    const craneById = new Map(cranes.map((c) => [c.id, c]));

    const staleRigIds = draft.activeRigIds.filter((id) => !isMachinePlannable(rigById.get(id)?.status ?? ''));
    const staleCraneIds = draft.activeCraneIds.filter(
      (id) => !isMachinePlannable(craneById.get(id)?.status ?? ''),
    );
    if (staleRigIds.length === 0 && staleCraneIds.length === 0) return;

    applyPrune(staleRigIds, staleCraneIds);
  }, [dataLoading, editSeeding, rigs, cranes, draft.activeRigIds, draft.activeCraneIds, applyPrune]);
}
