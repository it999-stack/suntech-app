// src/utils/actualTimeRules.ts
//
// Assembles the complete set of rules — bounds, conflict checks, and picker
// seeding — for one pile's actual start/finish time entry. Sits between the
// primitives (timeValidation.ts decides IF a candidate is valid;
// machineFloor.ts finds WHAT is in the way) and the components that render a
// picker, which previously each had to know how to wire those together.
//
// This exists because that wiring used to live inside PileStepsModal alone.
// Every other surface that logs a time — the resume close-out, the four
// machine-event modals — had nothing to import, only something to copy, and
// so copied none of it. A step time entered from Log Actuals was fully
// validated; the same column written from the resume flow was not.
//
// Deliberately a pure builder, not a hook:
//   - its whole body would be one useMemo, which hides the dependency array
//     from the call site — exactly how the memos this replaces silently rotted
//     into no-ops (they keyed on a `steps` array rebuilt every render);
//   - the resume close-out needs to evaluate its rules at CONFIRM time, in an
//     event handler, where a hook cannot run.
//
// Every bound emitted here is a full ISO timestamp, never a time-of-day.
// resolveOvernightDate pins a picked time to the anchor's calendar day, so
// comparing times-of-day would silently mis-order anything crossing midnight.

import type { ActualEntry } from '@app-types/plan';
import { toLocalIsoString } from '@utils/formatTime';
import {
  findMachineConflict,
  findPileStepConflict,
  type MachineFloorIndex,
} from '@utils/machineFloor';
import { formatOccupiedNotice, type ConflictNotice, type CandidateTimeBounds } from '@utils/timeValidation';

/** Current time-of-day as minutes-since-midnight. */
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Everything a time picker needs for one step's one field — both the rules it
 * must satisfy and the value it should open on. Spread wholesale into
 * StepTimeControl / EditTimeButton so a call site can't accidentally supply
 * half of it.
 *
 * `blocked` is deliberately absent: that's UI state (the machine is down or
 * idle), not a property of the candidate time, and it short-circuits before
 * the picker even opens.
 */
export type TimeFieldRules = {
  minBoundIso?: string;
  minBoundConflict?: ConflictNotice;
  maxBoundIso?: string;
  maxBoundConflict?: ConflictNotice;
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  machineConflictCheck?: (candidate: Date) => ConflictNotice | null;
  pileConflictCheck?: (candidate: Date) => ConflictNotice | null;
  /** Which calendar day the entry is attributed to — seeds the picker's
   * header. Read from the step (precomputed by usePileGroups via
   * resolveActualTimeAnchor) rather than recomputed here, so the picker and
   * the save path can't disagree about the date. */
  anchorIso?: string;
  /**
   * The value the picker opens on. A thunk, not a number, because the finish
   * seed falls back to "now" when the plan is already overrun — and this
   * builder is memoised while the modal can sit open for minutes. Callers
   * must resolve it when the picker opens, never at render.
   */
  getDefaultMinutes: () => number;
};

export type ActualTimeRules = {
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  forStep(stepId: string, field: 'start' | 'finish'): TimeFieldRules;
};

export function buildActualTimeRules(args: {
  /** This pile's steps, historical and current, in any order — sorted here. */
  steps: ActualEntry[];
  checklistPileId: string;
  pileCode: string;
  machineFloorIndex: MachineFloorIndex;
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
}): ActualTimeRules {
  const { steps, checklistPileId, pileCode, machineFloorIndex, planWindowMinIso, planWindowMaxIso } = args;

  const sorted = [...steps].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  // Rules are keyed only by CURRENT steps. stepId is not unique across the
  // merged list — a pile carried over from a previous day has historical rows
  // with the same step ids (which is why the render loop keys them
  // `hist-`/`cur-`). Historical rows never render a fill/edit control, so
  // excluding them here makes that collision structurally impossible rather
  // than merely benign-by-sort-order.
  const byStepId = new Map<string, ActualEntry>();
  for (const step of sorted) {
    if (!step.isHistorical) byStepId.set(step.stepId, step);
  }

  /**
   * The nearest already-recorded time that bounds this step, resolved across
   * the FULL list (historical rows included — those are real recorded
   * intervals on this pile, and the first current step's lower bound is still
   * the last historical step's recorded end).
   *
   * Deliberately NOT "the immediate predecessor/successor". Every not-yet-done
   * step is fillable now, not just the single first unfinished one, so the
   * immediate neighbour is frequently untouched: filling step 4 while step 3
   * is blank would then yield `prev.actualEndIso === undefined` — no lower
   * bound at all — and happily accept a start time before step 1. The real
   * constraint is the LATEST recorded end among ALL earlier steps (and,
   * symmetrically, the EARLIEST recorded start among all later ones), which
   * degrades to the immediate neighbour whenever that neighbour is filled.
   *
   * Compared by sequenceOrder rather than array index: a pile carried over
   * from a previous day has a historical row and a current row that can share
   * a stepId, and `< / >` correctly treats neither as "earlier"/"later" than
   * the other, where an index prefix/suffix would pick up the twin.
   */
  function latestEarlierEnd(step: ActualEntry): ActualEntry | undefined {
    let best: ActualEntry | undefined;
    let bestTime = -Infinity;
    for (const other of sorted) {
      if (other === step || other.sequenceOrder >= step.sequenceOrder || !other.actualEndIso) continue;
      const time = new Date(other.actualEndIso).getTime();
      if (time > bestTime) {
        bestTime = time;
        best = other;
      }
    }
    return best;
  }

  function earliestLaterStart(step: ActualEntry): ActualEntry | undefined {
    let best: ActualEntry | undefined;
    let bestTime = Infinity;
    for (const other of sorted) {
      if (other === step || other.sequenceOrder <= step.sequenceOrder || !other.actualStartIso) continue;
      const time = new Date(other.actualStartIso).getTime();
      if (time < bestTime) {
        bestTime = time;
        best = other;
      }
    }
    return best;
  }

  const occupied = (s: ActualEntry) =>
    formatOccupiedNotice(pileCode, s.stepName, s.actualStartIso, s.actualEndIso);

  /**
   * A start check spans [candidate, ownEnd]; a finish check spans
   * [ownStart, candidate]. The asymmetry matters — a candidate time is only
   * one edge of the interval being claimed, and the other edge is whatever
   * this step has already recorded.
   */
  function machineCheck(step: ActualEntry, field: 'start' | 'finish') {
    if (!step.assignedMachineId) return undefined;
    const machineId = step.assignedMachineId;
    const ownStart = step.actualStartIso ? new Date(step.actualStartIso) : undefined;
    const ownEnd = step.actualEndIso ? new Date(step.actualEndIso) : undefined;
    return (candidate: Date): ConflictNotice | null => {
      const [from, to] = field === 'start' ? [candidate, ownEnd] : [ownStart ?? candidate, candidate];
      const conflict = findMachineConflict(
        machineFloorIndex,
        machineId,
        checklistPileId,
        step.stepId,
        from,
        to,
      );
      return conflict
        ? formatOccupiedNotice(conflict.pileCode, conflict.stepName, conflict.start, conflict.end)
        : null;
    };
  }

  function pileCheck(step: ActualEntry, field: 'start' | 'finish') {
    const ownStart = step.actualStartIso ? new Date(step.actualStartIso) : undefined;
    const ownEnd = step.actualEndIso ? new Date(step.actualEndIso) : undefined;
    return (candidate: Date): ConflictNotice | null => {
      const [from, to] = field === 'start' ? [candidate, ownEnd] : [ownStart ?? candidate, candidate];
      // Candidates are checked against the FULL list including historical
      // rows — those are real recorded intervals on this pile and overlapping
      // them should still be rejected.
      const conflict = findPileStepConflict(sorted, step.stepId, from, to);
      return conflict
        ? formatOccupiedNotice(pileCode, conflict.stepName, conflict.actualStartIso, conflict.actualEndIso)
        : null;
    };
  }

  const empty: TimeFieldRules = { getDefaultMinutes: nowMinutes };

  return {
    planWindowMinIso,
    planWindowMaxIso,
    forStep(stepId, field) {
      const step = byStepId.get(stepId);
      if (!step) return empty;

      if (field === 'start') {
        const prev = latestEarlierEnd(step);
        return {
          minBoundIso: prev?.actualEndIso,
          minBoundConflict: prev ? occupied(prev) : undefined,
          maxBoundIso: step.actualEndIso,
          maxBoundConflict: occupied(step),
          planWindowMinIso,
          planWindowMaxIso,
          machineConflictCheck: machineCheck(step, 'start'),
          pileConflictCheck: pileCheck(step, 'start'),
          anchorIso: step.startAnchorIso,
          // Pick up where the last finished earlier step actually ended; then
          // this step's own plan; then "now". Never 0 — an unplanned step has
          // no planned start at all, and 0 would open the picker on midnight.
          getDefaultMinutes: () => prev?.actualEnd ?? step.plannedStart ?? nowMinutes(),
        };
      }

      const next = earliestLaterStart(step);
      return {
        minBoundIso: step.actualStartIso,
        minBoundConflict: occupied(step),
        maxBoundIso: next?.actualStartIso,
        maxBoundConflict: next ? occupied(next) : undefined,
        planWindowMinIso,
        planWindowMaxIso,
        machineConflictCheck: machineCheck(step, 'finish'),
        pileConflictCheck: pileCheck(step, 'finish'),
        anchorIso: step.endAnchorIso,
        // The planned end, unless the step has already run past it (or was
        // never planned) — "now" is the better guess than a time already gone
        // by, or than nothing at all.
        getDefaultMinutes: () =>
          step.plannedEnd != null && step.actualStart != null && step.plannedEnd > step.actualStart
            ? step.plannedEnd
            : nowMinutes(),
      };
    },
  };
}

// ─── Resume close-out ─────────────────────────────────────────────────────────

/**
 * Deliberately narrower than TimeFieldRules, and named so: two bounds, no
 * conflict checks, no plan window. The resume flow closes out a step on a
 * PREVIOUS day's checklist, and the plan wizard never builds the pileGroups a
 * MachineFloorIndex needs — so parity isn't available, and pretending
 * otherwise by reusing the wider type would invite someone to assume it.
 */
export type ResumeCloseOutRules = Pick<
  CandidateTimeBounds,
  | 'minBoundIso'
  | 'minBoundConflict'
  | 'maxBoundIso'
  | 'maxBoundConflict'
  | 'planWindowMinIso'
  | 'planWindowMaxIso'
>;

/**
 * Bounded by the plan window of the HISTORICAL checklist the step belongs to,
 * not today's — the supervisor is recording something that happened on that
 * day, so that day's window is the one that constrains it. Passing today's
 * window here would be a bug, not a shortcut.
 *
 * That window is plan_start_time → +24h (see planEndTime in types/plan.ts),
 * which is deliberately loose enough not to reject a genuine overrun: a step
 * reaches this modal precisely because it ran past the end of the working day.
 * What it does catch is a mis-scrolled picker landing on the wrong date. Both
 * window bounds are omitted on legacy checklists that never persisted one,
 * which degrades to the two hard bounds below rather than rejecting anything.
 *
 * `now` is passed in rather than read here so the caller resolves it at
 * confirm time; a value captured at mount goes stale while the user reads the
 * form. It overlaps planWindowMaxIso by design — whichever is earlier wins,
 * and for a plan generated yesterday that is `now`.
 */
export function buildResumeCloseOutRules(args: {
  pastActualStartIso: string | null | undefined;
  planWindowMinIso: string | null | undefined;
  planWindowMaxIso: string | null | undefined;
  formatBound: (iso: string) => string;
  now: Date;
}): ResumeCloseOutRules {
  const { pastActualStartIso, planWindowMinIso, planWindowMaxIso, formatBound, now } = args;
  return {
    planWindowMinIso: planWindowMinIso ?? undefined,
    planWindowMaxIso: planWindowMaxIso ?? undefined,
    minBoundIso: pastActualStartIso ?? undefined,
    minBoundConflict: pastActualStartIso
      ? {
          title: 'Invalid time',
          message: `This step started at ${formatBound(pastActualStartIso)}. Pick a time after that.`,
        }
      : undefined,
    // toLocalIsoString, never .toISOString() — every other timestamp in this
    // app is naive local wall-clock, and a bound that isn't would compare
    // correctly today but read as a mistake to the next person.
    maxBoundIso: toLocalIsoString(now),
    maxBoundConflict: { title: 'Invalid time', message: 'This time is in the future.' },
  };
}

/**
 * Where the resume picker opens: the step's canonical template duration added
 * to when work actually started — a far better first guess for "when did this
 * stop" than the wall-clock moment the supervisor happened to open the modal.
 * Falls back to the historical checklist's date when there's no logged start.
 */
export function seedResumeCloseOutTime(args: {
  pastActualStartIso: string | null | undefined;
  checklistDate: string | undefined;
  templateMinutes: number;
}): Date {
  const { pastActualStartIso, checklistDate, templateMinutes } = args;
  const anchorSource = pastActualStartIso ?? (checklistDate ? `${checklistDate}T00:00:00` : null);
  if (!anchorSource) return new Date();
  const anchor = new Date(anchorSource);
  if (Number.isNaN(anchor.getTime())) return new Date();
  return new Date(anchor.getTime() + Math.max(0, templateMinutes) * 60000);
}

export type PlanFinishRules = Pick<
  CandidateTimeBounds,
  'minBoundIso' | 'minBoundConflict' | 'minBoundExclusive' | 'planWindowMaxIso'
>;

/**
 * Today's plan finish time for a resumed step — the one field in the resume
 * modal that is PLAN time rather than actual time, so it gets its own builder
 * and its own narrow type rather than being folded into
 * buildResumeCloseOutRules (which bounds the PREVIOUS day's close-out against
 * that day's window; mixing the two is exactly the confusion worth preventing).
 *
 * The lower bound is exclusive: a finish landing exactly on the plan start
 * would schedule a zero-length step. The upper bound is today's plan window
 * end and only bites when a late plan start has been pushed past midnight by a
 * night-time non-working window — the picked time-of-day is otherwise pinned to
 * the plan start's own calendar day by the caller.
 *
 * No overlap or machine-floor checks: the plan doesn't exist yet, so there is
 * no floor to check against.
 */
export function buildPlanFinishRules(args: {
  planStartIso: string;
  todayPlanEndIso: string | null | undefined;
  formatBound: (iso: string) => string;
}): PlanFinishRules {
  const { planStartIso, todayPlanEndIso, formatBound } = args;
  return {
    minBoundIso: planStartIso,
    minBoundExclusive: true,
    minBoundConflict: {
      title: 'Invalid time',
      message: `Today's plan starts at ${formatBound(planStartIso)}.\nPick a finish time after that.`,
    },
    planWindowMaxIso: todayPlanEndIso ?? undefined,
  };
}
