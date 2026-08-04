// src/screens/Home/generatePlan/usePreviewReorder.ts
//
// Builds the Preview step's per-pile machine-label rows, and the per-machine
// reorder overlay (ReorderPilesOverlay) wiring — which machine is being
// reordered, its piles, and committing a new order back into the draft.

import { useMemo, useState } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { MachineInfo } from '@/types/timeline';
import type { PreviewPile } from '@components/plan/generate/steps/PreviewStep';
import type { EligiblePile, SimpleMachine } from './useGeneratePlanData';

export function usePreviewReorder(args: {
  draft: PlanDraft;
  updateDraft: (patch: Partial<PlanDraft>) => void;
  selectedPlanPiles: EligiblePile[];
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
}): {
  builtPreviewPiles: PreviewPile[];
  editingMachineId: string | undefined;
  setEditingMachineId: (id: string | undefined) => void;
  editingMachine: MachineInfo | undefined;
  pilesForMachine: (m: MachineInfo) => { id: string; label: string }[];
  handleReorderMachine: (newSubsetOrder: string[]) => void;
} {
  const { draft, updateDraft, selectedPlanPiles, rigs, cranes, activeRigs, activeCranes } = args;

  // Build preview piles (already-assigned piles with machine labels)
  const builtPreviewPiles: PreviewPile[] = useMemo(() => {
    return draft.selectedPileIds.flatMap((id) => {
      const pile = selectedPlanPiles.find((p) => p.id === id);
      if (!pile) return [];
      const asgn = draft.assignments[id];
      if (!asgn) return [];
      const rigNo = rigs.find((r) => r.id === asgn.rig)?.machineNo ?? '—';
      const craneNo = cranes.find((c) => c.id === asgn.crane)?.machineNo ?? '—';
      return [{
        id: pile.id,
        checklistPileId: pile.id,
        code: pile.code,
        dia: pile.dia,
        depth: pile.depth,
        rigMachineNo: rigNo,
        craneMachineNo: craneNo,
        rigId: asgn.rig,
        craneId: asgn.crane,
      }];
    });
  }, [draft.selectedPileIds, draft.assignments, selectedPlanPiles, rigs, cranes]);

  function handleReorderPiles(newOrder: string[]) {
    updateDraft({ selectedPileIds: newOrder });
  }

  const [editingMachineId, setEditingMachineId] = useState<string | undefined>();
  const machineInfos: MachineInfo[] = [
    ...activeRigs.map((r) => ({ id: r.id, machineNo: r.machineNo, type: 'RIG' as const })),
    ...activeCranes.map((c) => ({ id: c.id, machineNo: c.machineNo, type: 'CRANE' as const })),
  ];
  const editingMachine = machineInfos.find((m) => m.id === editingMachineId);

  function pilesForMachine(machine: MachineInfo) {
    return builtPreviewPiles
      .filter((p) => (machine.type === 'RIG' ? p.rigId : p.craneId) === machine.id)
      .map((p) => ({ id: p.checklistPileId, label: `Pile ${p.code}` }));
  }

  function mergeOrder(fullOrder: string[], subsetNewOrder: string[]): string[] {
    const subsetIds = new Set(subsetNewOrder);
    let i = 0;
    return fullOrder.map((id) => (subsetIds.has(id) ? subsetNewOrder[i++] : id));
  }

  function handleReorderMachine(newSubsetOrder: string[]) {
    // Each arrow tap is its own discrete commit (unlike a single drag-end),
    // so this fires repeatedly while the overlay stays open — don't close it here.
    handleReorderPiles(mergeOrder(builtPreviewPiles.map((p) => p.checklistPileId), newSubsetOrder));
  }

  return {
    builtPreviewPiles,
    editingMachineId,
    setEditingMachineId,
    editingMachine,
    pilesForMachine,
    handleReorderMachine,
  };
}
