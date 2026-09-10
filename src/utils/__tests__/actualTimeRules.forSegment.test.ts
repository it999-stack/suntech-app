// src/utils/__tests__/actualTimeRules.forSegment.test.ts
//
// forSegment scopes the same bound/conflict machinery forStep uses down to
// ONE work session of a step that has been split between machines. Three
// things are easy to get subtly wrong here, and each has its own test below:
//
//   1. A MIDDLE session is bounded purely by its own siblings; only the
//      FIRST session's start and the LAST session's end fall through to the
//      step-level cross-STEP bound (the same one forStep uses).
//   2. The machine conflict check must exclude only the session being
//      edited — NOT the whole step, or a sibling session on the same
//      machine (a genuine hand-back, e.g. R-1 -> R-3 -> R-1) would be
//      silently excused from a real overlap.
//   3. The pile conflict check stays STEP-level, deliberately unchanged —
//      see machineFloor.ts's findPileStepConflict docstring.

import { buildActualTimeRules } from '@utils/actualTimeRules';
import { buildMachineFloorIndex } from '@utils/machineFloor';
import type { ActualEntry, ActualSegment, PileGroup } from '@app-types/plan';

const CP_ID = 'cp-1';

function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function step(partial: Partial<ActualEntry> & { stepId: string; sequenceOrder: number }): ActualEntry {
  return {
    stepName: partial.stepId.toUpperCase(),
    pileCode: 'P-01',
    track: 'RIG',
    bufferMinutes: 0,
    ...partial,
  };
}

function done(stepId: string, sequenceOrder: number, startIso: string, endIso: string): ActualEntry {
  return step({
    stepId,
    sequenceOrder,
    actualStart: minutesOf(startIso),
    actualEnd: minutesOf(endIso),
    actualStartIso: startIso,
    actualEndIso: endIso,
  });
}

function segment(over: Partial<ActualSegment> & { id: string; startedAt: string }): ActualSegment {
  return { assignedMachineId: 'r1', assignedMachineNo: 'R-1', outcome: 'FINAL', ...over };
}

function rulesFor(steps: ActualEntry[], machineFloorIndex = new Map()) {
  return buildActualTimeRules({
    steps,
    checklistPileId: CP_ID,
    pileCode: 'P-01',
    machineFloorIndex,
  });
}

// R-1 08:00-10:30 (partial, handed over), R-3 14:00-16:00 (final).
const SPLIT_SEGMENTS: ActualSegment[] = [
  segment({
    id: 'seg-1',
    startedAt: '2026-09-05T08:00:00',
    endedAt: '2026-09-05T10:30:00',
    outcome: 'PARTIAL',
    assignedMachineId: 'r1',
    assignedMachineNo: 'R-1',
  }),
  segment({
    id: 'seg-2',
    startedAt: '2026-09-05T14:00:00',
    endedAt: '2026-09-05T16:00:00',
    assignedMachineId: 'r3',
    assignedMachineNo: 'R-3',
  }),
];

function splitStep(over: Partial<ActualEntry> = {}): ActualEntry {
  return step({
    stepId: 'boring',
    sequenceOrder: 2,
    segments: SPLIT_SEGMENTS,
    actualStartIso: '2026-09-05T08:00:00',
    actualEndIso: '2026-09-05T16:00:00',
    assignedMachineId: 'r3',
    ...over,
  });
}

describe('forSegment — sibling bounds within one step', () => {
  it("the FIRST session's start bound falls through to the step-level cross-step bound", () => {
    const earlier = done('casing', 1, '2026-09-05T06:00:00', '2026-09-05T07:30:00');
    const rules = rulesFor([earlier, splitStep()]);

    const start = rules.forSegment('boring', 'seg-1', 'start');
    expect(start.minBoundIso).toBe('2026-09-05T07:30:00');
    expect(start.minBoundConflict?.message).toContain('CASING');
  });

  it("the LAST session's finish bound falls through to the step-level cross-step bound", () => {
    const later = step({
      stepId: 'cage',
      sequenceOrder: 3,
      actualStart: minutesOf('2026-09-05T17:00:00'),
      actualStartIso: '2026-09-05T17:00:00',
    });
    const rules = rulesFor([splitStep(), later]);

    const finish = rules.forSegment('boring', 'seg-2', 'finish');
    expect(finish.maxBoundIso).toBe('2026-09-05T17:00:00');
    expect(finish.maxBoundConflict?.message).toContain('CAGE');
  });

  it("a session with BOTH siblings is bounded purely by them, never the step-level bound", () => {
    // Insert a THIRD session between the two so seg-2 has both a previous
    // and a next sibling — its bounds must come from those, not from
    // whatever a step-level lookup would otherwise find.
    const middleSegments: ActualSegment[] = [
      SPLIT_SEGMENTS[0],
      segment({
        id: 'seg-2',
        startedAt: '2026-09-05T14:00:00',
        endedAt: '2026-09-05T15:00:00',
        outcome: 'PARTIAL',
        assignedMachineId: 'r3',
        assignedMachineNo: 'R-3',
      }),
      segment({
        id: 'seg-3',
        startedAt: '2026-09-05T18:00:00',
        endedAt: '2026-09-05T19:00:00',
        assignedMachineId: 'r1',
        assignedMachineNo: 'R-1',
      }),
    ];
    const rules = rulesFor([splitStep({ segments: middleSegments })]);

    const finish = rules.forSegment('boring', 'seg-2', 'finish');
    expect(finish.maxBoundIso).toBe('2026-09-05T18:00:00'); // seg-3's start, not any step-level fallback
  });

  it("a session's start cannot move past its own recorded end", () => {
    const rules = rulesFor([splitStep()]);
    expect(rules.forSegment('boring', 'seg-1', 'start').maxBoundIso).toBe('2026-09-05T10:30:00');
  });

  it("a session's finish cannot move before its own recorded start", () => {
    const rules = rulesFor([splitStep()]);
    expect(rules.forSegment('boring', 'seg-2', 'finish').minBoundIso).toBe('2026-09-05T14:00:00');
  });

  it('seeds the picker from the session’s own time, not the step’s roll-up', () => {
    const rules = rulesFor([splitStep()]);
    // seg-1 starts 08:00, well before the step's roll-up actualStartIso would
    // suggest anything else — confirms the seed reads the SEGMENT.
    expect(rules.forSegment('boring', 'seg-1', 'start').getDefaultMinutes()).toBe(minutesOf('2026-09-05T08:00:00'));
    expect(rules.forSegment('boring', 'seg-2', 'finish').getDefaultMinutes()).toBe(minutesOf('2026-09-05T16:00:00'));
  });

  it('returns the empty rule set for an unknown step or segment id, rather than throwing', () => {
    const rules = rulesFor([splitStep()]);
    expect(rules.forSegment('no-such-step', 'seg-1', 'start').minBoundIso).toBeUndefined();
    expect(rules.forSegment('boring', 'no-such-segment', 'start').minBoundIso).toBeUndefined();
  });
});

describe('forSegment — machine conflict scoped to the one session', () => {
  // machineConflictCheck queries buildMachineFloorIndex's output, not the
  // `steps` array directly — an index built from nothing (the default empty
  // Map) would make every assertion below pass vacuously regardless of
  // whether the exclusion logic is actually right. Each test here builds a
  // real index from THIS pile's own segments, exactly as the app does.
  function thisPile(segments: ActualSegment[]): PileGroup {
    return {
      checklistPileId: CP_ID,
      pileId: 'pile-1',
      pileCode: 'P-01',
      rigs: ['R-1', 'R-3'],
      cranes: [],
      rigId: 'r1',
      steps: [splitStep({ segments })],
      hasBreakdownWarning: false,
      isBlockedByIdle: false,
      measurements: null,
    };
  }

  it('excludes only the session being edited, not its sibling on a DIFFERENT machine', () => {
    const rules = rulesFor([splitStep()], buildMachineFloorIndex([thisPile(SPLIT_SEGMENTS)]));
    const check = rules.forSegment('boring', 'seg-1', 'start').machineConflictCheck!;
    // seg-1 is on R-1; seg-2 (14:00-16:00) is on R-3 — editing seg-1's own
    // window must never be flagged against seg-2's interval at all, since
    // the check only ever queries R-1's machine index.
    expect(check(new Date('2026-09-05T15:00:00'))).toBeNull();
  });

  it('DOES flag an overlap with a sibling session on the SAME machine — the hand-back case', () => {
    // R-1 works 08:00-10:30, hands to R-3, then R-3 hands BACK to R-1 at
    // 14:00. Both sessions are on R-1. Editing seg-1's end to reach into
    // seg-3 must be caught — "same step" must not excuse a genuine
    // double-booking of R-1 against itself.
    const segments: ActualSegment[] = [
      SPLIT_SEGMENTS[0],
      segment({
        id: 'seg-2',
        startedAt: '2026-09-05T11:00:00',
        endedAt: '2026-09-05T13:00:00',
        outcome: 'PARTIAL',
        assignedMachineId: 'r3',
        assignedMachineNo: 'R-3',
      }),
      segment({
        id: 'seg-3',
        startedAt: '2026-09-05T14:00:00',
        endedAt: '2026-09-05T16:00:00',
        assignedMachineId: 'r1',
        assignedMachineNo: 'R-1',
      }),
    ];
    const rules = rulesFor([splitStep({ segments })], buildMachineFloorIndex([thisPile(segments)]));
    const check = rules.forSegment('boring', 'seg-1', 'finish').machineConflictCheck!;

    // Extending seg-1 (R-1) to end at 15:00 collides with seg-3 (also R-1,
    // 14:00-16:00) — same machine, different session of the same step.
    expect(check(new Date('2026-09-05T15:00:00'))).not.toBeNull();
    // 10:45 stays clear of seg-3 entirely.
    expect(check(new Date('2026-09-05T10:45:00'))).toBeNull();
  });

  it('flags an overlap with a DIFFERENT pile’s step on the same machine — parity with forStep', () => {
    const otherPile: PileGroup = {
      checklistPileId: 'cp-2',
      pileId: 'pile-2',
      pileCode: 'P-02',
      rigs: ['R-1'],
      cranes: [],
      rigId: 'r1',
      steps: [{ ...done('x1', 1, '2026-09-05T09:00:00', '2026-09-05T09:45:00'), assignedMachineId: 'r1' }],
      hasBreakdownWarning: false,
      isBlockedByIdle: false,
      measurements: null,
    };
    const rules = rulesFor([splitStep()], buildMachineFloorIndex([otherPile]));
    const check = rules.forSegment('boring', 'seg-1', 'finish').machineConflictCheck!;

    expect(check(new Date('2026-09-05T09:20:00'))).not.toBeNull();
    expect(check(new Date('2026-09-05T08:30:00'))).toBeNull();
  });
});

describe('forSegment — pile conflict stays step-level', () => {
  it("uses the STEP's own roll-up span, unaffected by which session is being edited", () => {
    // A later step recorded 12:00-13:00 — squarely inside the pause gap
    // (10:30-14:00) between this step's two sessions. Per machineFloor.ts's
    // documented decision, the PILE check still spans the whole step
    // (pause gap included), so this must still conflict even though no
    // individual SESSION covers 12:00-13:00.
    const overlapping = done('cage', 3, '2026-09-05T12:00:00', '2026-09-05T13:00:00');
    const rules = rulesFor([splitStep(), overlapping]);

    const check = rules.forSegment('boring', 'seg-1', 'finish').pileConflictCheck!;
    expect(check(new Date('2026-09-05T12:30:00'))).not.toBeNull();
  });
});
