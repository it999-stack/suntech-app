// src/services/stepSegments.ts
//
// Pure derivations over a step's work sessions. No SQLite, no React — every
// screen-level consumer (usePileGroups, pileProgress, useMachineFloor,
// PileStepsModal) reads its notion of "is this step running or paused" from
// here, so the answer can't drift between them.
//
// Mirrors the server's repositories/actual_step_segments.py. The server is
// authoritative — it recomputes the roll-up on every push — but the app has to
// derive the same thing locally to stay correct offline.

import type { ActualSegment } from '@app-types/plan';

/**
 * A step's state, replacing the two-state actualStart/actualEnd reading.
 *
 * The distinction that matters is RUNNING vs PAUSED: both have a start and no
 * end on the roll-up, but a paused step's machine has walked away and is free,
 * and its remaining work can be re-planned onto another machine.
 */
export type StepStatus = 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'DONE';

/** The roll-up fields this module needs; a subset of ActualEntry. */
type RollupLike = {
  actualStartIso?: string;
  actualEndIso?: string;
};

/** Live sessions only, oldest first. Callers should already have filtered
 * soft-deleted rows out, but ordering is re-asserted here so a caller that
 * passes a raw query result still gets the right "last" session. */
export function sortedSegments(segments: ActualSegment[]): ActualSegment[] {
  return [...segments].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/**
 * The session that decides the step's current state — the latest-started one.
 *
 * "Latest started" rather than "the only open one" is deliberate: two devices
 * working offline can each leave a session open on the same step, and there is
 * no unique index to prevent it (see pileActualStepSegments). Taking the
 * latest is the same degrade rule the server's running-pile cursor uses.
 */
export function lastLiveSegment(segments: ActualSegment[]): ActualSegment | undefined {
  const sorted = sortedSegments(segments);
  return sorted[sorted.length - 1];
}

/**
 * Derive a step's state.
 *
 * A step with NO segments falls back to the timestamp rule, which is how every
 * step behaved before this feature and how every step recorded by the web
 * dashboard still behaves. That fallback is what makes segments additive
 * rather than a migration.
 */
export function deriveStepStatus(
  segments: ActualSegment[] | undefined,
  rollup: RollupLike,
): StepStatus {
  const last = segments?.length ? lastLiveSegment(segments) : undefined;

  if (!last) {
    if (rollup.actualEndIso) return 'DONE';
    if (rollup.actualStartIso) return 'RUNNING';
    return 'NOT_STARTED';
  }

  if (!last.endedAt) return 'RUNNING';
  return last.outcome === 'FINAL' ? 'DONE' : 'PAUSED';
}

/** Minutes actually worked, excluding any pause gaps between sessions.
 *
 * Deliberately NOT (end - start) on the roll-up: for a step split across a
 * shift change that span includes hours nobody was working. Returns undefined
 * when nothing is closed yet, so callers can distinguish "no worked time" from
 * "zero minutes". */
export function workedMinutes(
  segments: ActualSegment[] | undefined,
  rollup: RollupLike,
): number | undefined {
  if (segments?.length) {
    let total = 0;
    let counted = false;
    for (const seg of segments) {
      if (!seg.endedAt) continue; // an open session has no settled duration yet
      total += minutesBetween(seg.startedAt, seg.endedAt);
      counted = true;
    }
    return counted ? total : undefined;
  }
  if (!rollup.actualStartIso || !rollup.actualEndIso) return undefined;
  return minutesBetween(rollup.actualStartIso, rollup.actualEndIso);
}

/**
 * What to pre-fill the "work remaining" field with when pausing a step.
 *
 * The template is the step's expected total, so subtracting what has already
 * been worked is the best available estimate. Floored at 5 rather than 0: a
 * pause means work is genuinely left, and a zero would schedule a no-op step.
 * Returns undefined when there is no template to reason from — the field then
 * starts empty and the supervisor states the number themselves.
 */
export function defaultRemainingMinutes(
  templateMinutes: number | undefined,
  segments: ActualSegment[] | undefined,
  rollup: RollupLike,
  pausedAtIso?: string,
): number | undefined {
  if (templateMinutes == null) return undefined;

  let worked = workedMinutes(segments, rollup) ?? 0;
  // The session being closed right now isn't in `segments` yet, so its own
  // elapsed time has to be added or the estimate ignores the work that
  // prompted the pause.
  const open = segments?.length ? lastLiveSegment(segments) : undefined;
  const openStart = open && !open.endedAt ? open.startedAt : rollup.actualStartIso;
  if (pausedAtIso && openStart) worked += minutesBetween(openStart, pausedAtIso);

  return Math.max(5, Math.round(templateMinutes - worked));
}

/** Every distinct machine that worked this step, in the order they worked it.
 * A step with no segments contributes its roll-up machine, if it has one. */
export function machinesForStep(
  segments: ActualSegment[] | undefined,
  fallbackMachineId?: string,
): string[] {
  if (!segments?.length) return fallbackMachineId ? [fallbackMachineId] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of sortedSegments(segments)) {
    if (!seg.assignedMachineId || seen.has(seg.assignedMachineId)) continue;
    seen.add(seg.assignedMachineId);
    out.push(seg.assignedMachineId);
  }
  return out;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}
