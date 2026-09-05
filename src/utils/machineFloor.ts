// src/utils/machineFloor.ts
//
// Cross-pile "is this machine already busy at this time, on another pile"
// index for the Log Actuals screen — a machine works one pile at a time, but
// a checklist has many piles, so "can this step start/finish at this time"
// can't be answered by looking at the current pile's own step list alone.
//
// Modeled as real time INTERVALS per machine (not a single "latest timestamp"
// scalar) — the earlier single-scalar "floor" design rejected any candidate
// earlier than the single latest actual timestamp recorded anywhere for a
// machine, regardless of that entry's own time range. That only holds if
// every entry happens to get filled in strict chronological order; the
// moment a supervisor backfills an earlier pile's time after a later one
// (a normal workflow), it wrongly blocks something that never actually
// overlaps. Interval overlap is the actual physical constraint that matters.
//
// Only CLOSED intervals (both actualStart and actualEnd recorded) count as
// "busy" here — a step that's merely started (in progress, no end yet)
// doesn't block anything, on this machine or within its own pile. This
// keeps the rule to exactly "can't overlap a time that's already been
// recorded", with no guessing about how long an in-progress step will run.

import type { ActualEntry, PileGroup } from '@app-types/plan';
import { addMinutes, toLocalIsoString } from '@utils/formatTime';

type MachineInterval = {
  stepId: string;
  /** pil_checklist_piles.id — `stepId` alone is only the shared step-DEFINITION
   * id (e.g. every pile's "BORING" step has the same stepId), so it can't tell
   * two different piles' same-named step apart. This is what actually makes an
   * interval unique across the whole checklist; see the exclusion check below. */
  checklistPileId: string;
  start: string;
  end: string;
  /** Carried along purely so a conflict can be reported by name — "Machine
   * already occupied — P-02 · Casing" — instead of a bare "Invalid time". */
  pileCode: string;
  stepName: string;
};

/** assignedMachineId -> that machine's CLOSED actual-time intervals across the
 * WHOLE checklist (every pile). */
export type MachineFloorIndex = Map<string, MachineInterval[]>;

/**
 * Builds the cross-pile machine interval index from `pileGroups` — already
 * whole-checklist, already-joined data. Only a step with BOTH actualStartIso
 * and actualEndIso recorded contributes an interval — an in-progress step
 * (started, not yet finished) is not considered "busy" for conflict-checking
 * purposes. Recompute whenever `pileGroups` changes (e.g. via useMemo keyed
 * on it).
 */
export function buildMachineFloorIndex(pileGroups: PileGroup[]): MachineFloorIndex {
  const index: MachineFloorIndex = new Map();
  for (const group of pileGroups) {
    for (const step of group.steps) {
      if (!step.assignedMachineId || !step.actualStartIso || !step.actualEndIso) continue;
      const entry: MachineInterval = {
        stepId: step.stepId,
        checklistPileId: group.checklistPileId,
        start: step.actualStartIso,
        end: step.actualEndIso,
        pileCode: group.pileCode,
        stepName: step.stepName,
      };
      const list = index.get(step.assignedMachineId);
      if (list) list.push(entry);
      else index.set(step.assignedMachineId, [entry]);
    }
  }
  return index;
}

/** True when [aStart, aEnd) and [bStart, bEnd) genuinely overlap (epoch millis). */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Turns a candidate (start, optional end) into a non-zero-width [start, end)
 * probe — a bare point (no known end yet) still needs a non-zero width to
 * detect landing inside another interval; start === end would never overlap
 * anything under the strict "<" test above. */
function candidateRange(candidateStart: Date, candidateEnd?: Date): [number, number] {
  const start = candidateStart.getTime();
  const end = candidateEnd ? candidateEnd.getTime() : start + 1;
  return [start, end];
}

/**
 * Returns the *other* closed interval recorded on `machineId` that genuinely
 * overlaps `[candidateStart, candidateEnd)` (excluding the entry's own
 * checklist-pile + step, so re-checking a step's own start/end never
 * self-blocks against a value derived from its own already-set fields), or
 * null if nothing conflicts. The returned interval carries `pileCode`/
 * `stepName` so callers can report exactly what it's occupied by, instead of
 * a bare yes/no.
 *
 * `excludeStepId` alone is NOT enough to identify "this step" — it's the
 * shared step-DEFINITION id (e.g. every pile's "BORING" step has the same
 * stepId), so excluding by stepId alone would also exclude every OTHER
 * pile's same-named step on this machine, hiding a genuine double-booking
 * between two different piles. `excludeChecklistPileId` (unique per pile)
 * is what actually disambiguates.
 */
export function findMachineConflict(
  index: MachineFloorIndex,
  machineId: string | null | undefined,
  excludeChecklistPileId: string,
  excludeStepId: string,
  candidateStart: Date,
  candidateEnd?: Date,
): MachineInterval | null {
  if (!machineId) return null;
  const intervals = index.get(machineId);
  if (!intervals) return null;

  const [start, end] = candidateRange(candidateStart, candidateEnd);
  return (
    intervals.find((interval) => {
      if (interval.checklistPileId === excludeChecklistPileId && interval.stepId === excludeStepId) return false;
      const otherStart = new Date(interval.start).getTime();
      const otherEnd = new Date(interval.end).getTime();
      return intervalsOverlap(start, end, otherStart, otherEnd);
    }) ?? null
  );
}

/**
 * The within-pile counterpart to `findMachineConflict` — the *other* step
 * within the same pile (regardless of which machine it's assigned to) whose
 * already-recorded actual interval genuinely overlaps
 * `[candidateStart, candidateEnd)`, or null if none does. Purely "does this
 * pile's own timeline already have something recorded here".
 */
export function findPileStepConflict(
  steps: ActualEntry[],
  excludeStepId: string,
  candidateStart: Date,
  candidateEnd?: Date,
): ActualEntry | null {
  const [start, end] = candidateRange(candidateStart, candidateEnd);
  return (
    steps.find((step) => {
      if (step.stepId === excludeStepId) return false;
      if (!step.actualStartIso || !step.actualEndIso) return false;
      const otherStart = new Date(step.actualStartIso).getTime();
      const otherEnd = new Date(step.actualEndIso).getTime();
      return intervalsOverlap(start, end, otherStart, otherEnd);
    }) ?? null
  );
}

export type ExpectedStepStart = {
  expectedStartIso: string;
  /** Undefined for the base case — anchored on this step's own planned
   * start because the machine has no earlier real completion to chain off. */
  anchorPileCode?: string;
  anchorStepName?: string;
};

/**
 * Mirrors `expected_step_start` in suntech-core's delay_service.py /
 * `expectedStepStart` in suntech-client's timelineMath.ts — see
 * DELAY_CALCULATIONS.md's "Start Delay" section. A step's realistic start is
 * that same machine's own most recent actual completion, at or before this
 * step's own actual start, across every pile it works that day — by real
 * chronological finish order, not the planned queue order (exactly what
 * MachineFloorIndex already tracks, since only closed intervals are indexed)
 * — plus this step's own buffer. No qualifying prior completion (this is the
 * machine's first real work of the day, or every other assigned step
 * finished after this one started) falls back to this step's own planned
 * start instead.
 *
 * Returns null when there is neither: an UNPLANNED step (no plan row, hence no
 * planned start — see ActualEntry.plannedStart) whose machine has no earlier
 * completion to chain off simply has no expected start, and callers must render
 * that as absent rather than being handed a fabricated one.
 */
export function computeExpectedStepStart(
  index: MachineFloorIndex,
  machineId: string | undefined,
  excludeChecklistPileId: string,
  excludeStepId: string,
  atOrBeforeIso: string,
  plannedStartIso: string | null | undefined,
  bufferMinutes: number,
): ExpectedStepStart | null {
  const intervals = machineId ? index.get(machineId) : undefined;
  const atOrBefore = new Date(atOrBeforeIso).getTime();

  let anchor: MachineInterval | null = null;
  let anchorEnd = -Infinity;
  for (const interval of intervals ?? []) {
    if (interval.checklistPileId === excludeChecklistPileId && interval.stepId === excludeStepId) continue;
    const end = new Date(interval.end).getTime();
    if (end <= atOrBefore && end > anchorEnd) {
      anchor = interval;
      anchorEnd = end;
    }
  }

  const anchorIso = anchor?.end ?? plannedStartIso;
  if (!anchorIso) return null;
  return {
    expectedStartIso: toLocalIsoString(addMinutes(new Date(anchorIso), bufferMinutes || 0)),
    anchorPileCode: anchor?.pileCode,
    anchorStepName: anchor?.stepName,
  };
}
