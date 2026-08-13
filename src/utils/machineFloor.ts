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

import type { ActualEntry, PileGroup } from '@app-types/plan';

export type MachineConflictInfo = {
  /** e.g. "RIG (SANY 205 1ST)" — same "TRACK (no)" convention as the track badge. */
  machineLabel: string;
  /** e.g. "Pile P-387 — BORING" */
  reasonLabel: string;
  /** The conflicting interval's own bounds — end is null when that step is still
   * open (started, not yet finished), i.e. busy indefinitely from `start`. */
  start: string;
  end: string | null;
};

type MachineInterval = {
  stepId: string;
  start: string;
  end: string | null;
  pileCode: string;
  stepName: string;
  machineLabel: string;
};

/** assignedMachineId -> that machine's actual-time intervals across the WHOLE
 * checklist (every pile). */
export type MachineFloorIndex = Map<string, MachineInterval[]>;

function machineLabelFor(step: ActualEntry): string {
  return `${step.track}${step.assignedMachineNo ? ` (${step.assignedMachineNo})` : ''}`;
}

/**
 * Builds the cross-pile machine interval index from `pileGroups` — already
 * whole-checklist, already-joined data (assignedMachineId, actualStartIso,
 * actualEndIso, pileCode, stepName, track, assignedMachineNo all present per
 * step), so no separate re-join of raw plan/actual steps is needed. Every
 * step with at least an actualStart contributes one interval: [start, end) if
 * finished, [start, +∞) (end: null) if merely open (started, not yet
 * finished) — so a machine that's still mid-step elsewhere in the checklist
 * still correctly shows up as busy from <start> onward rather than looking
 * completely free just because nobody has closed the step out yet. Recompute
 * whenever `pileGroups` changes (e.g. via useMemo keyed on it).
 */
export function buildMachineFloorIndex(pileGroups: PileGroup[]): MachineFloorIndex {
  const index: MachineFloorIndex = new Map();
  for (const group of pileGroups) {
    for (const step of group.steps) {
      if (!step.assignedMachineId || !step.actualStartIso) continue;
      const entry: MachineInterval = {
        stepId: step.stepId,
        start: step.actualStartIso,
        end: step.actualEndIso ?? null,
        pileCode: step.pileCode,
        stepName: step.stepName,
        machineLabel: machineLabelFor(step),
      };
      const list = index.get(step.assignedMachineId);
      if (list) list.push(entry);
      else index.set(step.assignedMachineId, [entry]);
    }
  }
  return index;
}

/** True when [aStart, aEnd) and [bStart, bEnd) genuinely overlap (both ends
 * exclusive-upper, epoch millis; pass Infinity for a still-open end). */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The first *other* interval on `machineId` (excluding `excludeStepId`, so
 * re-checking a step's own start/end never self-blocks against a value
 * derived from its own already-set fields) that genuinely overlaps
 * `[candidateStart, candidateEnd)`. `candidateEnd` is optional — filling a
 * start time with no end known yet degenerates to a point check: does
 * candidateStart fall strictly inside another interval. Returns undefined
 * when nothing conflicts (including when this machine has no other actual
 * time recorded at all).
 */
export function getMachineConflict(
  index: MachineFloorIndex,
  machineId: string | null | undefined,
  excludeStepId: string,
  candidateStart: Date,
  candidateEnd?: Date,
): MachineConflictInfo | undefined {
  if (!machineId) return undefined;
  const intervals = index.get(machineId);
  if (!intervals) return undefined;

  const start = candidateStart.getTime();
  // A bare point (no known end yet) still needs a non-zero-width probe to
  // detect landing inside another interval — start === end would never
  // overlap anything under the strict "<" test below.
  const end = candidateEnd ? candidateEnd.getTime() : start + 1;

  for (const interval of intervals) {
    if (interval.stepId === excludeStepId) continue;
    const otherStart = new Date(interval.start).getTime();
    const otherEnd = interval.end ? new Date(interval.end).getTime() : Infinity;
    if (intervalsOverlap(start, end, otherStart, otherEnd)) {
      return {
        machineLabel: interval.machineLabel,
        reasonLabel: `Pile ${interval.pileCode} — ${interval.stepName}`,
        start: interval.start,
        end: interval.end,
      };
    }
  }
  return undefined;
}

/**
 * The next genuinely free instant on `machineId` at or after `from` —
 * repeatedly jumps past any other interval `from` lands inside, the same
 * "never start inside a window" shape as the scheduler's own
 * skipNonWorkingWindows (pilingPlannerService.ts), just against actual-time
 * intervals instead of non-working windows. For SUGGESTING A DEFAULT
 * value only — never a hard block; see getMachineConflict for the actual
 * validation performed at save time.
 */
export function nextFreeTimeOnOrAfter(
  index: MachineFloorIndex,
  machineId: string | null | undefined,
  excludeStepId: string,
  from: Date,
): Date {
  if (!machineId) return from;
  const intervals = index.get(machineId);
  if (!intervals) return from;

  let current = from.getTime();
  let moved = true;
  while (moved) {
    moved = false;
    for (const interval of intervals) {
      if (interval.stepId === excludeStepId) continue;
      const otherStart = new Date(interval.start).getTime();
      if (interval.end === null) {
        // Still open (in progress) indefinitely — there's no known free instant
        // to jump to. Best-effort: suggest right when it started rather than
        // looping toward Infinity. Purely a suggested default; getMachineConflict
        // is what actually blocks a genuine overlap at save time.
        if (current >= otherStart) return new Date(otherStart);
        continue;
      }
      const otherEnd = new Date(interval.end).getTime();
      if (current >= otherStart && current < otherEnd) {
        current = otherEnd;
        moved = true;
        break;
      }
    }
  }
  return new Date(current);
}
