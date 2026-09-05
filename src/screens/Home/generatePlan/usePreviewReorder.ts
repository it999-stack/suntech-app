// src/screens/Home/generatePlan/usePreviewReorder.ts
//
// Builds the Preview step's per-pile machine-label rows, and the per-machine
// reorder overlay (ReorderPilesOverlay) wiring — which machine is being
// reordered, its piles, and committing a new order back into the draft.

import { useMemo, useRef, useState } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { MachineInfo } from '@/types/timeline';
import type { PreviewPile } from '@components/plan/generate/steps/PreviewStep';
import type { EligiblePile, SimpleMachine } from './useGeneratePlanData';

export function usePreviewReorder(args: {
  draft: PlanDraft;
  reorderPiles: (newOrder: string[]) => void;
  selectedPlanPiles: EligiblePile[];
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
}): {
  builtPreviewPiles: PreviewPile[];
  editingMachineId: string | undefined;
  setEditingMachineId: (id: string | undefined) => void;
  /** The machine the reorder overlay is showing. Stays populated for one extra
   * beat after `editingMachineId` clears (see isMachineOverlayOpen) so the
   * overlay's own close animation has real data to fade out instead of
   * snapping to blank content. */
  editingMachine: MachineInfo | undefined;
  /** True only while a machine is actually selected for editing — drives the
   * overlay's `visible` prop. `editingMachine` itself deliberately outlives
   * this going false, so don't use `!!editingMachine` for that purpose. */
  isMachineOverlayOpen: boolean;
  pilesForMachine: (m: MachineInfo) => { id: string; label: string }[];
  handleReorderMachine: (newSubsetOrder: string[]) => void;
} {
  const { draft, reorderPiles, selectedPlanPiles, activeRigs, activeCranes } = args;

  // Build preview piles (already-assigned piles with machine labels)
  const builtPreviewPiles: PreviewPile[] = useMemo(() => {
    return draft.selectedPileIds.flatMap((id) => {
      const pile = selectedPlanPiles.find((p) => p.id === id);
      if (!pile) return [];
      const asgn = draft.assignments[id];
      if (!asgn) return [];
      // Resolved against the ACTIVE machine lists (not the full site list) —
      // matching PileAssignStep/ResumeConfirmStep exactly, so a stale
      // assignment left pointing at a since-deactivated machine degrades to
      // the same "—"/unassigned fallback everywhere instead of Preview alone
      // still showing a real (but no-longer-active) machine name.
      const rigNo = activeRigs.find((r) => r.id === asgn.rig)?.machineNo ?? '—';
      // Undefined (not '—') when no crane is assigned at all — a genuinely
      // rig-only pile — vs. a real crane id that just failed to resolve to a
      // label, which still shows the placeholder. This distinction is what
      // lets TrackChoiceTiles hide the Crane tile for rig-only piles.
      const craneNo = asgn.crane ? (activeCranes.find((c) => c.id === asgn.crane)?.machineNo ?? '—') : undefined;
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
  }, [draft.selectedPileIds, draft.assignments, selectedPlanPiles, activeRigs, activeCranes]);

  function handleReorderPiles(newOrder: string[]) {
    reorderPiles(newOrder);
  }

  const [editingMachineId, setEditingMachineId] = useState<string | undefined>();
  const machineInfos: MachineInfo[] = [
    ...activeRigs.map((r) => ({ id: r.id, machineNo: r.machineNo, type: 'RIG' as const })),
    ...activeCranes.map((c) => ({ id: c.id, machineNo: c.machineNo, type: 'CRANE' as const })),
  ];
  const selectedMachine = machineInfos.find((m) => m.id === editingMachineId);
  // Caches the last real selection during render (not an effect) so the overlay
  // keeps rendering the machine it was showing while it fades out, instead of
  // going blank the instant editingMachineId clears — see the exported
  // isMachineOverlayOpen/editingMachine doc comments above.
  const lastMachineRef = useRef<MachineInfo | undefined>(selectedMachine);
  if (selectedMachine) lastMachineRef.current = selectedMachine;
  const editingMachine = selectedMachine ?? lastMachineRef.current;

  function pilesForMachine(machine: MachineInfo) {
    return builtPreviewPiles
      .filter((p) => (machine.type === 'RIG' ? p.rigId : p.craneId) === machine.id)
      .map((p) => ({
        id: p.checklistPileId,
        label: `Pile ${p.code}`,
        // The machine on the *other* track for this pile — e.g. sequencing a
        // rig's piles surfaces which crane(s) they're each paired with, so the
        // overlay's header can show every distinct one instead of nothing.
        otherMachineLabel: machine.type === 'RIG' ? p.craneMachineNo : p.rigMachineNo,
      }));
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
    isMachineOverlayOpen: !!editingMachineId,
    pilesForMachine,
    handleReorderMachine,
  };
}
