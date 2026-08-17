// src/services/planner/planTypes.ts
// Shared types used across the plan generation pipeline — see
// pilingPlannerService.ts for the algorithm overview.

import type { NewPilePlanStep, NonWorkingWindowBehavior } from '@db/schema';
import type { PlanStepWithMeta } from '@repositories/planRepository';

// ─── Public input types ───────────────────────────────────────────────────────

export interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  /** FK into piling_dimensions — dia/depth are looked up from here, not carried separately. */
  dimensionId: string;
  rigId: string;
  /** Optional — a pile can be planned with a rig alone. A rig can perform any
   * CRANE-track step, never the reverse; see stepTrackOverrides. */
  craneId?: string;
  /** Optional third track's machine. Undefined until compressor assignment UI exists. */
  compressorId?: string;
  resumeWork?: { stepId: string; remainingMinutes: number; bufferMinutes?: number };
  /** Step ids whose CRANE-track step should run on the Rig instead for this pile — a Rig can
   * perform any CRANE step, never the reverse. One-off per plan generation, not persisted. */
  stepTrackOverrides?: string[];
}

export type EffectiveWindow = {
  id: string;
  label: string;
  behavior: NonWorkingWindowBehavior;
  start: Date;
  end: Date;
};

// ─── Shared result types ──────────────────────────────────────────────────────

export interface PreviewPlanStep
  extends Omit<NewPilePlanStep, 'durationMinutes' | 'bufferMinutes' | 'assignedMachineId' | 'plannedEnd'>,
    Pick<
      PlanStepWithMeta,
      | 'stepName'
      | 'track'
      | 'sequenceOrder'
      | 'durationMinutes'
      | 'bufferMinutes'
      | 'assignedMachineId'
    > {
  // Always set by scheduleOneStep — never left undefined like the insert type allows.
  plannedEnd: string | null;
  /** The step definition's own nominal track — distinct from `track` (the execution
   * track, i.e. which machine actually ran it) once an override is in play. Lets the
   * Preview UI keep offering the Rig/Crane choice tiles even after a step's `track`
   * has flipped to 'RIG'. Not present on persisted/synced rows (see PlanStepWithMeta). */
  businessTrack: string;
}

/** A non-working window resolved to its actual effective placement for one machine. */
export interface EffectivePlanWindow {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface BuildPlanRowsResult {
  planRows: PreviewPlanStep[];
  warningPileIds: string[];
  /** Non-working windows actually applied per machine, keyed by machineId. */
  windowsByMachineId: Record<string, EffectivePlanWindow[]>;
  /** Feed this back in as the next call's `scheduleCache` option — see PlanScheduleCache. */
  scheduleCache: PlanScheduleCache;
}

/**
 * Lets a caller that repeatedly recomputes the same plan (e.g. the Preview step, on every
 * Rig/Crane track-override toggle) skip rescheduling piles that couldn't possibly have
 * changed. Piles are partitioned into machine-sharing "components" (see
 * partitionIntoComponents()) — each component's schedule is provably independent of every
 * other's, so when only a track override changed, only the component(s) containing an
 * affected pile need to actually re-run Pass 2; every other component's rows are reused as-is.
 *
 * `fingerprint` covers every scheduling input EXCEPT stepTrackOverrides (plan start time,
 * site/shift, selected steps, and each pile's id/dimension/machine-assignment/resumeWork in
 * order). A mismatch means component membership itself may have changed (pile added/removed,
 * rig/crane reassigned, resumeWork changed, reorder, etc.) — in that case the whole cache is
 * discarded and every component is rescheduled from scratch, same as if no cache were passed
 * at all. This is intentionally an all-or-nothing gate: it is never partially trusted.
 */
export interface PlanScheduleCache {
  fingerprint: string;
  componentResults: Record<
    string,
    {
      /** Fingerprint of just this component's piles' stepTrackOverrides — a mismatch means
       * this specific component needs rescheduling even though the overall fingerprint matched. */
      overridesFingerprint: string;
      rows: PreviewPlanStep[];
      warningPileIds: string[];
      windowsByMachineId: Record<string, EffectivePlanWindow[]>;
    }
  >;
}

// ─── Reference-data types ──────────────────────────────────────────────────────

export interface PlanTemplateRow {
  id: string;
  stepId: string;
  dimensionId: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
}

export interface PlanRawWindow {
  id: string;
  label: string;
  behavior: string;
  startTime: string;
  endTime: string;
}
