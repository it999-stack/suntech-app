// src/types/plan.ts
// Shared types for the plan generation wizard.

import { toLocalIsoString } from '@utils/formatTime';

/** Assignment of rig + crane to a single pile. */
export type PileAssignment = {
  rig: string;   // pilingMachines.id (type=RIG)
  crane: string; // pilingMachines.id (type=CRANE)
};

/** A per-pile override used when an unfinished step continues on a new day. */
export type ResumeWork = {
  stepId: string;
  stepName?: string;
  remainingMinutes: number;
  /** A resumed task normally does not repeat its original setup buffer. */
  bufferMinutes?: number;
  lastRigId?: string | null;
  lastCraneId?: string | null;
  /** True if the resume step already has an actualStart — genuinely in progress. */
  wasStarted?: boolean;
  /** True once the user has confirmed/edited the remaining time via ResumeTimeConfirmModal. */
  remainingTimeConfirmed?: boolean;
  /** Historical checklist-pile id the in-progress step belongs to — needed to write remarks back. */
  pastChecklistPileId?: string;
  pastActualStart?: string | null;
  completedStepNames?: string[];
};

/**
 * Transient wizard state — lives only in GeneratePlanScreen.
 * Seeded from existing checklist on edit mode.
 */
export type PlanDraft = {
  /** "YYYY-MM-DD" — the date this plan covers. */
  date: string;
  /** Work areas whose piles are available to this plan. */
  areaIds: string[];
  /** ISO timestamp — when the 24hr plan begins. */
  planStartTime: string;
  /** Active rig ids for today (user deselects broken ones in MachineSelectStep). */
  activeRigIds: string[];
  /** Active crane ids for today. */
  activeCraneIds: string[];
  /** Ordered pile ids selected for this plan. */
  selectedPileIds: string[];
  /** Ordered step ids selected for this plan. */
  selectedStepIds: string[];
  /** Per-pile rig + crane assignment. */
  assignments: Record<string, PileAssignment>;
  /** Pending work keyed by physical pile id. */
  resumeWorkByPileId: Record<string, ResumeWork>;
  /** pilingSitePersonnel.id — Shift 1 (day) supervisor. */
  supervisorId: string | null;
  /** pilingSitePersonnel.id — Shift 2 (night) supervisor. */
  supervisorId2: string | null;
  /** pilingShiftTypes.id — the active shift for this plan. */
  shiftTypeId: string | null;
};

// ─── Legacy types used by actual-time components ─────────────────────────────

/**
 * A single step entry used by FillActualScreen / PileProgressCard.
 * All time fields are minutes-since-midnight (number) or undefined if not yet recorded.
 */
export type ActualEntry = {
  stepId: string;
  stepName: string;
  pileCode: string;
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  /** piling_steps.sequence_order — the source of truth for step ordering, not plannedStart. */
  sequenceOrder: number;
  /** Planned start — minutes since midnight. */
  plannedStart: number;
  /** Planned end — minutes since midnight. Undefined when this step is "continuing" (no committed end). */
  plannedEnd?: number;
  /** Actual start — minutes since midnight, undefined if not yet logged. */
  actualStart?: number;
  /** Actual end — minutes since midnight, undefined if not yet finished. */
  actualEnd?: number;
  remarks?: string;
  /** Machine currently assigned to this step (pil_plan_steps.assigned_machine_id). */
  assignedMachineId?: string;
  /** Machine number label (e.g. "R-01") — joined from piling_machines. */
  assignedMachineNo?: string;
};

/**
 * Legacy static supervisor list used by SupervisorSelect.
 * Will be replaced by DB-driven data once personnel sync is fully wired in.
 */
export const AVAILABLE_SUPERVISORS: string[] = [];

// ─── Draft + helpers ──────────────────────────────────────────────────────────

// Re-export formatting helpers from the single source of truth so existing
// imports of these names from '@/types/plan' continue to work.
export {
  formatPlanTime as fmtPlanTime,
  formatTime as fmtTime,
  formatDuration as fmtDuration,
} from '@utils/formatTime';

/** Default draft for a new plan. */
export function defaultPlanDraft(today: string): PlanDraft {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 8, 0, 0, 0);
  return {
    date: today,
    areaIds: [],
    planStartTime: toLocalIsoString(dt),
    activeRigIds: [],
    activeCraneIds: [],
    selectedPileIds: [],
    selectedStepIds: [],
    assignments: {},
    resumeWorkByPileId: {},
    supervisorId: null,
    supervisorId2: null,
    shiftTypeId: null,
  };
}

/** Compute plan end time (start + 24 hours). */
export function planEndTime(startIso: string): string {
  const d = new Date(startIso);
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return toLocalIsoString(d);
}