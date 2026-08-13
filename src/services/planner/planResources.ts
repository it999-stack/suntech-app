// src/services/planner/planResources.ts
// Machine/track resolution for a pile's steps — see pilingPlannerService.ts
// for the algorithm overview.

import type { PreviewPileInput } from './planTypes';

/** Which PreviewPileInput field holds the assigned machine for a given step's track. */
const TRACK_MACHINE_FIELD: Record<string, keyof PreviewPileInput> = {
  RIG: 'rigId',
  CRANE: 'craneId',
  COMPRESSOR: 'compressorId',
};

function machineForTrack(pile: PreviewPileInput, track: string): string | undefined {
  const field = TRACK_MACHINE_FIELD[track];
  return field ? (pile[field] as string | undefined) : undefined;
}

/**
 * The step definition's own track (`businessTrack`) and "which machine actually executes
 * this step" (`executionTrack`/`assignedMachineId`) are different concepts that happen to
 * coincide unless overridden. This is the ONLY place override logic — and the only caller
 * of machineForTrack() — lives: everything past Pass 1 below reads the already-resolved
 * assignedMachineId/executionTrack and never re-derives them.
 */
export function resolveStepExecution(
  pile: PreviewPileInput,
  step: { id: string; track: string },
): { businessTrack: string; executionTrack: string; assignedMachineId: string | undefined } {
  const executionTrack =
    step.track === 'CRANE' && pile.stepTrackOverrides?.includes(step.id) ? 'RIG' : step.track;
  return {
    businessTrack: step.track,
    executionTrack,
    assignedMachineId: machineForTrack(pile, executionTrack),
  };
}
