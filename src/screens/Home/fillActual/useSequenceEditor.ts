// src/screens/Home/fillActual/useSequenceEditor.ts
//
// Per-machine pile sequence editing (reorder / add / remove). Everything
// here mutates a local draft only — nothing is sent to the server until the
// ReorderPilesModal's Save is tapped (handleReorderConfirm), which is the
// only action that actually persists.

import { useMemo, useState } from 'react';
import type { ReorderPile } from '@components/plan/generate/preview/ReorderPilesModal';
import type { EditPlanPileInput, EditPlanPreview, EditPlanSummary } from '@state/PlanContext';
import type { PilingChecklistPile, PilingDailyChecklist, PilingMachine, PilingPile } from '@db/schema';
import type { PileGroup } from '@app-types/plan';
import type { MachineBadge } from './useMachinePages';
import { notify } from '@utils/notify';

/** Splices a reordered subset (one machine's piles) back into the full pile
 * order, leaving every other pile's position untouched — same helper the
 * now-deleted EditPlanScreen and the plan-generation wizard both used. */
function mergeOrder(fullOrder: string[], subsetNewOrder: string[]): string[] {
  const subsetIds = new Set(subsetNewOrder);
  let i = 0;
  return fullOrder.map((id) => (subsetIds.has(id) ? subsetNewOrder[i++] : id));
}

export function useSequenceEditor(args: {
  siteId: string;
  checklist: PilingDailyChecklist | null;
  workingDate: string;
  checklistPiles: PilingChecklistPile[];
  pileGroups: PileGroup[];
  pileMap: Map<string, PilingPile>;
  machines: PilingMachine[];
  activeMachines: MachineBadge[];
  selectedMachineId: string | undefined;
  editPlanMidDay: (
    siteId: string,
    checklistId: string,
    date: string,
    piles: EditPlanPileInput[],
  ) => Promise<EditPlanSummary>;
  /** Dry-run check before actually committing — same call AddPileModal uses
   * for its own live preview, reused here so a rejection (a pile with logged
   * progress, the plan window having elapsed, etc.) surfaces before writing
   * anything, instead of the user only finding out after Save Changes. */
  previewEditPlanMidDay: (
    siteId: string,
    checklistId: string,
    piles: EditPlanPileInput[],
  ) => Promise<EditPlanPreview>;
}): {
  rigs: PilingMachine[];
  cranes: PilingMachine[];
  activeMachine: MachineBadge | undefined;
  pileProgressByPileId: Map<string, { hasProgress: boolean; isRunning: boolean }>;
  draftRows: EditPlanPileInput[] | null;
  sequencePiles: ReorderPile[];
  sequenceModalOpen: boolean;
  sequenceRemountKey: number;
  addPileModalOpen: boolean;
  setAddPileModalOpen: (open: boolean) => void;
  isSavingSequence: boolean;
  openSequenceModal: () => void;
  closeSequenceModal: () => void;
  handleReorderConfirm: (newSubsetOrder: string[]) => Promise<void>;
  handleRemovePile: (pileId: string) => void;
  handleAddPileConfirm: (input: EditPlanPileInput) => void;
} {
  const { siteId, checklist, workingDate, checklistPiles, pileGroups, pileMap, machines, activeMachines, selectedMachineId, editPlanMidDay, previewEditPlanMidDay } = args;

  const rigs = useMemo(() => machines.filter((m) => m.type === 'RIG'), [machines]);
  const cranes = useMemo(() => machines.filter((m) => m.type === 'CRANE'), [machines]);
  const machineNoById = useMemo(() => new Map(machines.map((m) => [m.id, m.machineNo])), [machines]);

  const activeMachine = activeMachines.find(
    (m) => m.id === (selectedMachineId ?? activeMachines[0]?.id),
  );

  const groupByPileId = useMemo(() => new Map(pileGroups.map((g) => [g.pileId, g])), [pileGroups]);

  function currentMachineIds(row: EditPlanPileInput): { rigId: string; craneId?: string } {
    const group = groupByPileId.get(row.pileId);
    return {
      rigId: group?.rigId ?? row.rigId,
      craneId: group?.craneId ?? row.craneId,
    };
  }

  const pileProgressByPileId = useMemo(() => {
    const map = new Map<string, { hasProgress: boolean; isRunning: boolean }>();
    for (const g of pileGroups) {
      map.set(g.pileId, {
        hasProgress: g.steps.some((s) => s.actualStart != null),
        isRunning: g.steps.some((s) => s.actualStart != null && s.actualEnd == null),
      });
    }
    return map;
  }, [pileGroups]);

  const [draftRows, setDraftRows] = useState<EditPlanPileInput[] | null>(null);

  const sequencePiles = useMemo((): ReorderPile[] => {
    if (!activeMachine || !draftRows) return [];
    return draftRows
      .map((r) => ({ r, current: currentMachineIds(r) }))
      .filter(({ current }) => (activeMachine.type === 'RIG' ? current.rigId : current.craneId) === activeMachine.id)
      .map(({ r, current }) => ({
        id: r.pileId,
        label: `${pileMap.get(r.pileId)?.pileIdCode ?? r.pileId}`,
        locked: !!pileProgressByPileId.get(r.pileId)?.hasProgress,
        otherMachineLabel: activeMachine.type === 'RIG'
          ? (current.craneId ? machineNoById.get(current.craneId) : undefined)
          : machineNoById.get(current.rigId),
      }));
  }, [activeMachine, draftRows, pileProgressByPileId, pileMap, machineNoById, groupByPileId]);

  const [sequenceModalOpen, setSequenceModalOpen] = useState(false);
  const [sequenceRemountKey, setSequenceRemountKey] = useState(0);
  const [addPileModalOpen, setAddPileModalOpen] = useState(false);
  const [isSavingSequence, setIsSavingSequence] = useState(false);

  function deriveStepTrackOverrides(pileId: string): string[] {
    const group = groupByPileId.get(pileId);
    if (!group) return [];
    return group.steps
      .filter((s) => (s.businessTrack ?? s.track) === 'CRANE' && s.track === 'RIG')
      .map((s) => s.stepId);
  }

  /**
   * Steps whose work sits on a machine the pile's OWN rig/crane can't account
   * for — i.e. a mid-day replacement moved it elsewhere. Only those get pinned:
   * anything the pile's own machines already explain is left to the server's
   * normal track resolution, so changing a pile's rig still moves its steps
   * rather than being overridden by a stale pin.
   *
   * Completed steps are skipped — persist_final never deletes their plan rows,
   * so their machine survives regardless (that is why a finished step kept its
   * replacement while a paused one silently lost it).
   */
  function deriveStepMachineOverrides(pileId: string): Record<string, string> {
    const group = groupByPileId.get(pileId);
    if (!group) return {};
    const pileOwnMachines = new Set([group.rigId, group.craneId].filter(Boolean) as string[]);
    const pinned: Record<string, string> = {};
    for (const s of group.steps) {
      if (s.isHistorical || s.actualEnd !== undefined) continue;
      const machineId = s.assignedMachineId;
      if (machineId && !pileOwnMachines.has(machineId)) pinned[s.stepId] = machineId;
    }
    return pinned;
  }

  function openSequenceModal() {
    setDraftRows(
      checklistPiles.map((cp) => {
        const group = groupByPileId.get(cp.pileId);
        return {
          pileId: cp.pileId,
          rigId: group?.rigId ?? cp.rigId,
          craneId: group?.craneId ?? (cp.craneId ?? undefined),
          stepTrackOverrides: deriveStepTrackOverrides(cp.pileId),
          stepMachineOverrides: deriveStepMachineOverrides(cp.pileId),
        };
      }),
    );
    setSequenceModalOpen(true);
  }

  function closeSequenceModal() {
    setSequenceModalOpen(false);
    setDraftRows(null);
  }

  // The only action that actually persists — reorder/add/remove below only
  // touch the local draft, so this sends everything accumulated in one go.
  async function handleReorderConfirm(newSubsetOrder: string[]) {
    if (!checklist || !draftRows) return;
    const byPileId = new Map(draftRows.map((r) => [r.pileId, r]));

    const oldSubsetOrder = sequencePiles.map((p) => p.id);
    const overridesBySlot = oldSubsetOrder.map((pileId) => byPileId.get(pileId)?.stepTrackOverrides ?? []);
    const overridesForNewOrder = new Map(newSubsetOrder.map((pileId, i) => [pileId, overridesBySlot[i] ?? []]));

    const fullOrder = draftRows.map((r) => r.pileId);
    const merged = mergeOrder(fullOrder, newSubsetOrder);
    const piles: EditPlanPileInput[] = merged.map((pileId) => {
      const row = byPileId.get(pileId)!;
      return {
        ...row,
        ...currentMachineIds(row),
        // Re-derived rather than carried from the draft: a replacement logged
        // while the sequence modal sat open would otherwise be sent stale.
        // Keyed by pile, unlike stepTrackOverrides below — which machine is
        // doing a step belongs to the pile, never to its position in the queue.
        stepMachineOverrides: deriveStepMachineOverrides(pileId),
        ...(overridesForNewOrder.has(pileId) ? { stepTrackOverrides: overridesForNewOrder.get(pileId) } : {}),
      };
    });

    setIsSavingSequence(true);
    try {
      await previewEditPlanMidDay(siteId, checklist.id, piles);
      await editPlanMidDay(siteId, checklist.id, workingDate, piles);
      setDraftRows(null);
    } catch (err) {
      const message =
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Please try again.');
      notify.error(message, { title: 'Could not save changes' });
      throw err;
    } finally {
      setIsSavingSequence(false);
    }
  }

  function handleRemovePile(pileId: string) {
    setDraftRows((prev) => (prev ?? []).filter((r) => r.pileId !== pileId));
  }

  function handleAddPileConfirm(input: EditPlanPileInput) {
    // Guards against a double-tap on "Add to plan" (or any other double-fire
    // of onConfirm) appending the same pile twice — draftRows is keyed by
    // pileId everywhere else (FlatList included), so two rows with the same
    // id crash the list with a duplicate-key error. Re-adding an already
    // present pile just updates its row instead of duplicating it.
    setDraftRows((prev) => {
      const existing = prev ?? [];
      const alreadyIndex = existing.findIndex((r) => r.pileId === input.pileId);
      if (alreadyIndex === -1) return [...existing, input];
      const next = [...existing];
      next[alreadyIndex] = input;
      return next;
    });
    setSequenceRemountKey((k) => k + 1);
    setAddPileModalOpen(false);
  }

  return {
    rigs,
    cranes,
    activeMachine,
    pileProgressByPileId,
    draftRows,
    sequencePiles,
    sequenceModalOpen,
    sequenceRemountKey,
    addPileModalOpen,
    setAddPileModalOpen,
    isSavingSequence,
    openSequenceModal,
    closeSequenceModal,
    handleReorderConfirm,
    handleRemovePile,
    handleAddPileConfirm,
  };
}
