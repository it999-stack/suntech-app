// src/screens/Home/generatePlan/useMachineStatusGuard.ts

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { removeMachineFromDraft, type PlanDraft } from '@/types/plan';
import { isMachinePlannable } from '@/utils/helpers';
import type { SimpleMachine } from './useGeneratePlanData';

export function useMachineStatusGuard(args: {
  dataLoading: boolean;
  editSeeding: boolean;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  draft: PlanDraft;
  setDraft: Dispatch<SetStateAction<PlanDraft>>;
}): void {
  const { dataLoading, editSeeding, rigs, cranes, draft, setDraft } = args;

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

    setDraft((prev) => {
      let next = prev;
      for (const id of staleRigIds) next = { ...next, ...removeMachineFromDraft(next, id, 'RIG') };
      for (const id of staleCraneIds) next = { ...next, ...removeMachineFromDraft(next, id, 'CRANE') };
      return next;
    });
  }, [dataLoading, editSeeding, rigs, cranes, draft.activeRigIds, draft.activeCraneIds, setDraft]);
}
