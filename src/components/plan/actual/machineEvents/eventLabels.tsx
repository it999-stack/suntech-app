// src/components/plan/actual/machineEvents/eventLabels.tsx
//
// Shared event-type union for MachineIdleModal, plus MachineReplaceModal's
// replacement-eligibility rule.

import type { Track } from './types';

export type IdleEventType = 'IDLE_START' | 'IDLE_END';

/** A Rig can substitute for a Crane-track step; a Crane can never
 * substitute for a Rig-track step. One-directional, mirrors the
 * CRANE→RIG override already used at plan-generation time (see
 * resolveStepExecution in src/services/planner/planResources.ts),
 * applied here to the runtime "replace machine" action instead. */
export function isEligibleReplacementType(machineType: string, stepTrack: Track): boolean {
  return machineType === stepTrack || (stepTrack === 'CRANE' && machineType === 'RIG');
}
