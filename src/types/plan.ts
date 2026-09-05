// src/types/plan.ts
// Shared types for the plan generation wizard.

import { toLocalIsoString } from '@utils/formatTime';

/** Assignment of rig (+ optional crane) to a single pile. A rig alone is a
 * valid plan — a rig can perform any CRANE-track step, never the reverse. */
export type PileAssignment = {
  rig: string;
  crane?: string;
};

/** A step already completed (actualEnd set) on the pile's most recent past
 * checklist — plan + actual times, for display in Preview/Log Actuals. */
export type CompletedStepInfo = {
  stepId: string;
  stepName: string;
  track: string;
  sequenceOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

/**
 * A previous-day step close-out the supervisor has confirmed in the wizard but
 * which has NOT been written yet.
 *
 * These used to be written to pil_actual_steps the instant the supervisor
 * answered "Partially/Fully completed" — permanently, and queued for sync —
 * while the remaining-minutes estimate they entered alongside it lived only in
 * this draft. Abandoning the wizard therefore committed half the answer and
 * discarded the other half, leaving the step indistinguishable from a fully
 * completed one: the next generation skipped it entirely and its remaining
 * work silently vanished from the plan.
 *
 * Holding them here instead means the close-out and the remaining time live or
 * die together — nothing touches the database until the plan is actually
 * generated. See flushResumeCloseOuts.
 */
export type PendingCloseOut = {
  pastChecklistPileId: string;
  stepId: string;
  pastActualStart: string | null;
  pastEndIso: string;
  remarks: string;
  /** The historical checklist to enqueue for sync once written. */
  checklistId?: string;
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
  /** Same steps as completedStepNames, with plan + actual times. */
  completedSteps?: CompletedStepInfo[];
  /** The step after the in-progress one, if any — used when the supervisor
   * confirms the in-progress step was actually fully completed on the
   * previous day. */
  nextStep?: { stepId: string; stepName: string; remainingMinutes: number } | null;
  /** The historical checklist this resume work came from, and its date —
   * lets the confirm modal anchor its "previous day" time pickers correctly. */
  checklistId?: string;
  checklistDate?: string;
  /** That historical checklist's own plan window (plan_start_time →
   * plan_end_time, a 24h span). The close-out time the supervisor records
   * belongs to THAT day, so it is bounded by THAT day's window — not today's.
   * See buildResumeCloseOutRules. */
  pastPlanStartTime?: string | null;
  pastPlanEndTime?: string | null;
  /** What the supervisor chose the last time this pile's resume was
   * confirmed, and the exact values used — lets the modal reopen prefilled
   * instead of resetting to a blank choice. Only ever set by confirmPartial;
   * confirmFull's pile becomes unreachable via openSingle afterward (see
   * useResumeConfirmQueue.ts), so there's nothing to reopen there. */
  confirmedStatus?: 'partial';
  confirmedPastEndIso?: string;
  confirmedRemarks?: string;
  /** The step this pile most recently had marked "Fully completed" via
   * confirmFull — survives the pile's resume-work object being overwritten
   * with the next step's info, so it stays reachable for a light edit
   * (finish time + remarks only; see confirmFull/editConfirmedFull). */
  lastConfirmedFull?: {
    stepId: string;
    stepName: string;
    pastChecklistPileId: string;
    pastActualStart: string | null;
    pastEndIso: string;
    remarks: string;
    /** The historical checklist pastChecklistPileId belongs to — captured
     * here since confirmFull's nextStep branch replaces the whole
     * resume-work object (dropping the top-level checklistId), so
     * editConfirmedFull needs its own copy to enqueue a sync. */
    checklistId?: string;
    /** That checklist's plan window, captured for the same reason as
     * checklistId above — the edit-completed path has no other route back to
     * it once the resume-work object has been replaced. */
    pastPlanStartTime?: string | null;
    pastPlanEndTime?: string | null;
  };
};

/**
 * Every named-role assignment for one shift (Shift Incharge, Engineer,
 * Supervisor, Machine Operator) — mirrors the backend's one-row-per-(role,
 * machine, shift_slot) shape (pil_checklist_personnel). Per-machine roles are
 * keyed by machineId — a "group" (an Engineer or Supervisor covering several
 * rigs) is never an explicit entity, it's just multiple map entries sharing
 * the same personnel id.
 */
export type ShiftTeamAssignment = {
  /** pilingSitePersonnel.id — this shift's incharge. Optional. */
  shiftInchargeId: string | null;
  /** machineId -> personnelId. Rigs only — mandatory: every active rig needs one this shift. */
  engineerByMachineId: Record<string, string>;
  /** machineId -> personnelId. Rigs only — optional: any subset of active rigs (including none) may have one this shift. No pairing/cap — one supervisor may cover many rigs. */
  supervisorByMachineId: Record<string, string>;
  /** machineId -> personnelId. Rigs + cranes — mandatory: every active machine needs one this shift. */
  operatorByMachineId: Record<string, string>;
};

/**
 * Every named-role assignment for this checklist. Leadership (Project
 * Manager, Planning Engineer) is a whole-plan singleton; every other role is
 * assigned per shift (see ShiftTeamAssignment) — Shift 1 (day) and Shift 2
 * (night).
 */
export type ChecklistPersonnelAssignment = {
  /** pilingSitePersonnel.id — 1 per checklist, frozen per plan (defaults from last-used). */
  projectManagerId: string | null;
  /** pilingSitePersonnel.id — 1 per checklist, frozen per plan (defaults from last-used). */
  planningEngineerId: string | null;
  shift1: ShiftTeamAssignment;
  shift2: ShiftTeamAssignment;
};

/**
 * Transient wizard state — lives only in GeneratePlanScreen.
 * Seeded from existing checklist on edit mode.
 */
export type PlanDraft = {
  /** "YYYY-MM-DD" — the date this plan covers. */
  date: string;
  /** Work locations whose piles are available to this plan. */
  locationIds: string[];
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
  /** Previous-day close-outs confirmed in the wizard, keyed by physical pile
   * id, flushed only once the plan generates. Keyed (not a list) so
   * re-confirming or editing a pile replaces its entry instead of queueing a
   * second write for the same step. */
  pendingCloseOuts: Record<string, PendingCloseOut>;
  /** checklistPileId (pile.id in the draft) -> stepIds overridden to run on the Rig instead of Crane. One-off, not persisted beyond this plan generation. */
  stepTrackOverrides: Record<string, string[]>;
  /** All personnel role assignments for this checklist. */
  checklistPersonnel: ChecklistPersonnelAssignment;
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
  /** Whichever machine is *currently* assigned to this step — flips if the
   * machine is replaced mid-day. For anything that must survive a swap
   * (e.g. which replacement machine types are eligible), use
   * `businessTrack` instead. */
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  /** The step definition's own fixed nominal track (piling_steps.track) —
   * unlike `track`, never changes when the assigned machine is replaced.
   * Undefined only for historical (previous-checklist) rows, which carry
   * no machine info at all. */
  businessTrack?: 'RIG' | 'CRANE' | 'COMPRESSOR';
  /** piling_steps.sequence_order — the source of truth for step ordering, not plannedStart. */
  sequenceOrder: number;
  /**
   * Planned start — minutes since midnight. Undefined when this step has NO
   * plan row at all: the scheduler stopped planning the pile before reaching
   * it (not enough of the 24h window left), yet the crew ran ahead and
   * performed it anyway. Such a step has no planned time and never will —
   * tomorrow's continuation is a different row — so this must stay undefined
   * and never be coerced to 0, which renders as midnight.
   */
  plannedStart?: number;
  /** Planned end — minutes since midnight. Undefined when this step is "continuing" (no committed end), or unplanned entirely (see plannedStart). */
  plannedEnd?: number;
  /** Actual start — minutes since midnight, undefined if not yet logged. */
  actualStart?: number;
  /** Actual end — minutes since midnight, undefined if not yet finished. */
  actualEnd?: number;
  /** ISO passthroughs of the four fields above, used for date-aware duration
   * math (plannedStart/actualStart etc. lose the date once reduced to
   * minutes-since-midnight, which breaks duration calc for overnight steps). */
  plannedStartIso?: string;
  plannedEndIso?: string;
  actualStartIso?: string;
  actualEndIso?: string;
  remarks?: string;
  /** Machine currently assigned to this step (pil_plan_steps.assigned_machine_id). */
  assignedMachineId?: string;
  /** Machine number label (e.g. "R-01") — joined from piling_machines. */
  assignedMachineNo?: string;
  /** ISO anchor timestamp the actual-time picker uses to seed its displayed
   * date for "Fill/Edit start time" — see resolveActualTimeAnchor. */
  startAnchorIso?: string;
  /** Same, for "Fill/Edit finish time". */
  endAnchorIso?: string;
  /** pil_plan_steps.buffer_minutes for this step — used only to compute the
   * suggested default start time once the assigned machine becomes free
   * (machineFloor + bufferMinutes). Never a hard floor. 0 when null/legacy. */
  bufferMinutes: number;
  /** This step's configured duration template for the pile's dimension, in
   * minutes. A purely informational reference for an UNPLANNED step ("Not
   * planned · ~60 min") — it is what the step would have been scheduled for,
   * not a commitment, and nothing validates against it. Undefined when the
   * step's plan row already carries real planned times, or when no template
   * exists (in which case the step isn't applicable at all). */
  templateMinutes?: number;
  /** Configured non-working window(s) (lunch, shift change, etc.) that landed
   * strictly inside this step's own plan span, re-derived at render time via
   * splitStepByInternalWindows — not persisted, since pil_plan_steps has no
   * column for it. Explains why plannedEndIso is later than the step's pure
   * work duration would suggest. Undefined/empty when nothing overlapped. */
  planBreaks?: { label: string; start: string; end: string }[];
  /** True for a synthetic, read-only row representing a step completed on a
   * *previous* day's checklist — rendered faded, with no edit/remarks/
   * machine-event controls (see FillActualScreen/PileStepsModal). */
  isHistorical?: boolean;
};

/**
 * The fixed set of one-time engineering measurements for a *physical* pile
 * (never varies per checklist — see pilPileMeasurements in db/schema.ts).
 * Field keys match pilPileMeasurements' own column names 1:1 so a value read
 * off that table can be spread directly into a patch with no translation.
 * null once no field has been recorded yet; individual fields are null until
 * their trigger step's actual start/end is filled in — see
 * pileMeasurementTriggers.ts.
 */
export type PileMeasurementFields = {
  eglM: number | null;
  pileContractorId: string | null;
  cageContractorId: string | null;
  pileLengthM: number | null;
  cageWeightKg: number | null;
  ctlM: number | null;
  colM: number | null;
  boreDepthM: number | null;
  hookLengthM: number | null;
  flM: number | null;
  actualQtyM3: number | null;
};

/** Shape expected by PileProgressCard and PileStepsModal — one pile's steps
 * grouped with its rig/crane assignment, used by FillActualScreen. */
export type PileGroup = {
  checklistPileId: string;
  pileId: string;
  pileCode: string;
  /** Every distinct machine that has worked this pile's RIG-track steps, in
   * the order first assigned — usually just the planned rig, but includes
   * any mid-day replacement too. Always non-empty. */
  rigs: string[];
  /** Same as `rigs`, for CRANE-track steps — empty if this pile has none. */
  cranes: string[];
  /** The machine currently responsible for this pile's RIG-track work (the
   * most recent replacement, if any) — drives which machine's tab this pile
   * appears under, see useMachinePages.ts. */
  rigId: string;
  /** Same as `rigId`, for CRANE-track work. */
  craneId?: string;
  steps: ActualEntry[];
  /** True when a not-yet-done step's assigned machine has status BREAKDOWN. */
  hasBreakdownWarning: boolean;
  /** True when the current (not-yet-done) step's assigned machine has an open
   * self-logged idle session (status IDLE) — that step's actual time entry is
   * blocked until the idle session is ended, everywhere this pile appears. */
  isBlockedByIdle: boolean;
  /** One-time engineering measurements recorded so far for this physical
   * pile, or null if nothing has been recorded yet — see
   * MeasurementFieldsModal.tsx / pileMeasurementTriggers.ts. */
  measurements: PileMeasurementFields | null;
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
    locationIds: [],
    planStartTime: toLocalIsoString(dt),
    activeRigIds: [],
    activeCraneIds: [],
    selectedPileIds: [],
    selectedStepIds: [],
    assignments: {},
    resumeWorkByPileId: {},
    pendingCloseOuts: {},
    stepTrackOverrides: {},
    checklistPersonnel: {
      projectManagerId: null,
      planningEngineerId: null,
      shift1: { shiftInchargeId: null, engineerByMachineId: {}, supervisorByMachineId: {}, operatorByMachineId: {} },
      shift2: { shiftInchargeId: null, engineerByMachineId: {}, supervisorByMachineId: {}, operatorByMachineId: {} },
    },
    shiftTypeId: null,
  };
}

/** Compute plan end time (start + 24 hours). */
export function planEndTime(startIso: string): string {
  const d = new Date(startIso);
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return toLocalIsoString(d);
}

/** Fully removes a machine from the draft: drops it from the active list,
 * unassigns it from any pile pointing at it, and strips its role rows from
 * both shifts' teams. The single source of truth for "take this machine out
 * of the plan" — used both by MachineSelectStep's manual deselect and by
 * useMachineStatusGuard's automatic prune of a machine that's no longer
 * plannable (however it got into the draft — role defaults, edit-mode
 * seeding, or a status change mid-session). */
export function removeMachineFromDraft(
  draft: PlanDraft,
  machineId: string,
  type: 'RIG' | 'CRANE',
): Partial<PlanDraft> {
  const isRig = type === 'RIG';
  const activeIds = isRig ? draft.activeRigIds : draft.activeCraneIds;

  const assignments = { ...draft.assignments };
  let assignmentsChanged = false;
  for (const [pileId, a] of Object.entries(assignments)) {
    if (isRig && a.rig === machineId) {
      // Rig is mandatory — falls back to fully unassigned rather than
      // keeping a crane-only half-pair.
      assignments[pileId] = { rig: '', crane: undefined };
      assignmentsChanged = true;
    } else if (!isRig && a.crane === machineId) {
      // Crane is optional — the pile just becomes rig-only.
      assignments[pileId] = { ...a, crane: undefined };
      assignmentsChanged = true;
    }
  }

  function stripFromTeam(team: ShiftTeamAssignment): ShiftTeamAssignment {
    const { [machineId]: _op, ...operatorByMachineId } = team.operatorByMachineId;
    const { [machineId]: _eng, ...engineerByMachineId } = team.engineerByMachineId;
    const { [machineId]: _sup, ...supervisorByMachineId } = team.supervisorByMachineId;
    return { ...team, operatorByMachineId, engineerByMachineId, supervisorByMachineId };
  }

  return {
    [isRig ? 'activeRigIds' : 'activeCraneIds']: activeIds.filter((x) => x !== machineId),
    assignments: assignmentsChanged ? assignments : draft.assignments,
    checklistPersonnel: {
      ...draft.checklistPersonnel,
      shift1: stripFromTeam(draft.checklistPersonnel.shift1),
      shift2: stripFromTeam(draft.checklistPersonnel.shift2),
    },
  };
}