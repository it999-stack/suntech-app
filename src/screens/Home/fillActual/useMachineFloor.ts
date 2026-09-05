// src/screens/Home/fillActual/useMachineFloor.ts
//
// Cross-pile machine scheduling: a machine works one pile at a time, but a
// checklist has many piles, so the Log Actuals screen must not let a step's
// actual start be logged earlier than the same machine's last logged
// actual_end on a DIFFERENT pile (machineFloorIndex). Also resolves, per
// machine, which pile/step it's actually working on right now.

import { useMemo } from 'react';
import { buildMachineFloorIndex, type MachineFloorIndex } from '@utils/machineFloor';
import type { PileGroup } from '@app-types/plan';

export function useMachineFloor(args: { pileGroups: PileGroup[] }): {
  machineFloorIndex: MachineFloorIndex;
  frontPileIdByMachineId: Map<string, string>;
  currentStepByMachineId: Map<string, { checklistPileId: string; stepId: string }>;
} {
  const { pileGroups } = args;

  const machineFloorIndex = useMemo(() => buildMachineFloorIndex(pileGroups), [pileGroups]);

  // ── Up-next pile, per machine ────────────────────────────────────────────
  // A pile's own "current step" isn't the same as "this pile's machine is
  // actively on it right now" — a machine works piles one at a time in
  // seq_no order, so several not-yet-finished piles assigned to the same
  // rig can each nominally have an unfinished rig step even though the rig
  // has only reached the first one. The real signal, per machine, is the
  // earliest-seq_no pile that still has an unfinished step assigned to it —
  // pileGroups is already seq_no order, so the first match per machine is
  // that machine's front-of-queue pile.
  //
  // This scans the pile's whole APPLICABLE step list now, not just its plan
  // rows, and every row carries a resolved assignedMachineId (see
  // usePileGroups' resolveUnplannedMachineId). A machine whose only remaining
  // work is a step the plan never covered therefore stops looking idle: it
  // gets a front-of-queue pile and a current step, so its Breakdown/Start Idle
  // buttons stay usable and MachinePilesPage's hasActiveStep is right.
  const frontPileIdByMachineId = useMemo(() => {
    const machineIds = new Set<string>();
    pileGroups.forEach((g) =>
      g.steps.forEach((s) => {
        if (s.assignedMachineId) machineIds.add(s.assignedMachineId);
      }),
    );

    const map = new Map<string, string>();
    machineIds.forEach((machineId) => {
      const front = pileGroups.find((g) =>
        g.steps.some((s) => s.assignedMachineId === machineId && s.actualEnd === undefined),
      );
      if (front) map.set(machineId, front.checklistPileId);
    });
    return map;
  }, [pileGroups]);

  // ── The step a machine's Breakdown/Start Idle card buttons log against —
  // the unfinished step assigned to it on its own front-of-queue pile (same
  // pile frontPileIdByMachineId already resolved). Absent when the machine
  // has nothing in progress, in which case those buttons render disabled.
  const currentStepByMachineId = useMemo(() => {
    const map = new Map<string, { checklistPileId: string; stepId: string }>();
    frontPileIdByMachineId.forEach((checklistPileId, machineId) => {
      const group = pileGroups.find((g) => g.checklistPileId === checklistPileId);
      const step = group?.steps.find((s) => s.assignedMachineId === machineId && s.actualEnd === undefined);
      if (step) map.set(machineId, { checklistPileId, stepId: step.stepId });
    });
    return map;
  }, [frontPileIdByMachineId, pileGroups]);

  return { machineFloorIndex, frontPileIdByMachineId, currentStepByMachineId };
}
