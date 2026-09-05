// src/utils/__tests__/actualTimeRules.test.ts
//
// Covers the two rules that stop being obvious once EVERY not-yet-completed
// step is fillable (not just the pile's first unfinished one): where a step's
// lower/upper time bounds come from when its immediate neighbour is still
// blank, and that a step with no plan row still gets a real machine-occupancy
// check and a sane picker seed.

import { buildActualTimeRules } from '@utils/actualTimeRules';
import { buildMachineFloorIndex } from '@utils/machineFloor';
import type { ActualEntry, PileGroup } from '@app-types/plan';

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

/** A step with both actual times recorded, in minutes and ISO form. */
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

function rulesFor(steps: ActualEntry[]) {
  return buildActualTimeRules({
    steps,
    checklistPileId: CP_ID,
    pileCode: 'P-01',
    machineFloorIndex: new Map(),
  });
}

describe('buildActualTimeRules — bounds across a gap', () => {
  // The trap: step 3 is untouched, so "the immediate predecessor's actual end"
  // is undefined and there would be NO lower bound at all — a start time
  // before step 1 would be accepted.
  it("uses the latest earlier step's actual end as the start's lower bound, skipping blank steps", () => {
    const steps = [
      done('s1', 1, '2026-09-05T08:00:00', '2026-09-05T09:00:00'),
      done('s2', 2, '2026-09-05T09:00:00', '2026-09-05T10:30:00'),
      step({ stepId: 's3', sequenceOrder: 3 }),
      step({ stepId: 's4', sequenceOrder: 4 }),
    ];

    const s4Start = rulesFor(steps).forStep('s4', 'start');
    expect(s4Start.minBoundIso).toBe('2026-09-05T10:30:00');
    expect(s4Start.minBoundConflict?.message).toContain('S2');
  });

  it("uses the earliest later step's actual start as the finish's upper bound", () => {
    const steps = [
      done('s1', 1, '2026-09-05T08:00:00', '2026-09-05T09:00:00'),
      step({
        stepId: 's2',
        sequenceOrder: 2,
        actualStart: minutesOf('2026-09-05T09:00:00'),
        actualStartIso: '2026-09-05T09:00:00',
      }),
      step({ stepId: 's3', sequenceOrder: 3 }),
      step({
        stepId: 's4',
        sequenceOrder: 4,
        actualStart: minutesOf('2026-09-05T13:00:00'),
        actualStartIso: '2026-09-05T13:00:00',
      }),
    ];

    const s2Finish = rulesFor(steps).forStep('s2', 'finish');
    expect(s2Finish.maxBoundIso).toBe('2026-09-05T13:00:00');
    expect(s2Finish.maxBoundConflict?.message).toContain('S4');
  });

  it('takes historical rows into account, and never treats a step as its own bound', () => {
    const steps = [
      { ...done('s1', 1, '2026-09-04T20:00:00', '2026-09-04T22:00:00'), isHistorical: true },
      step({ stepId: 's2', sequenceOrder: 2 }),
    ];

    expect(rulesFor(steps).forStep('s2', 'start').minBoundIso).toBe('2026-09-04T22:00:00');
    // A historical row renders read-only, so it has no rules of its own.
    expect(rulesFor(steps).forStep('s1', 'start').minBoundIso).toBeUndefined();
  });
});

describe('buildActualTimeRules — an unplanned step', () => {
  const unplanned = step({ stepId: 's3', sequenceOrder: 3, assignedMachineId: 'rig-1' });

  it('still gets a real machine-occupancy check', () => {
    // A machine-conflict check is only omitted when the step has no machine at
    // all — which is exactly what an unplanned row used to look like.
    const withMachine = rulesFor([unplanned]).forStep('s3', 'start');
    expect(withMachine.machineConflictCheck).toBeDefined();

    const withoutMachine = rulesFor([step({ stepId: 's9', sequenceOrder: 9 })]).forStep('s9', 'start');
    expect(withoutMachine.machineConflictCheck).toBeUndefined();
  });

  it('rejects a start that overlaps the same machine on another pile', () => {
    const otherPile: PileGroup = {
      checklistPileId: 'cp-2',
      pileId: 'pile-2',
      pileCode: 'P-02',
      rigs: ['R-01'],
      cranes: [],
      rigId: 'rig-1',
      steps: [{ ...done('x1', 1, '2026-09-05T14:00:00', '2026-09-05T15:00:00'), assignedMachineId: 'rig-1' }],
      hasBreakdownWarning: false,
      isBlockedByIdle: false,
      measurements: null,
    };

    const rules = buildActualTimeRules({
      steps: [unplanned],
      checklistPileId: CP_ID,
      pileCode: 'P-01',
      machineFloorIndex: buildMachineFloorIndex([otherPile]),
    });
    const check = rules.forStep('s3', 'start').machineConflictCheck!;

    expect(check(new Date('2026-09-05T14:30:00'))).not.toBeNull();
    expect(check(new Date('2026-09-05T16:00:00'))).toBeNull();
  });

  it('seeds the picker from the previous actual end, and never from midnight', () => {
    const withPrev = rulesFor([
      done('s1', 1, '2026-09-05T08:00:00', '2026-09-05T09:15:00'),
      unplanned,
    ]);
    expect(withPrev.forStep('s3', 'start').getDefaultMinutes()).toBe(9 * 60 + 15);

    // Nothing earlier recorded and no planned start: "now", never 0 (which
    // would render as midnight).
    const before = new Date().getHours() * 60 + new Date().getMinutes();
    const seeded = rulesFor([unplanned]).forStep('s3', 'start').getDefaultMinutes();
    const after = new Date().getHours() * 60 + new Date().getMinutes();
    expect(seeded).toBeGreaterThanOrEqual(before);
    expect(seeded).toBeLessThanOrEqual(after);
  });

  it('keeps the checklist day as a hard stop', () => {
    const rules = buildActualTimeRules({
      steps: [unplanned],
      checklistPileId: CP_ID,
      pileCode: 'P-01',
      machineFloorIndex: new Map(),
      planWindowMinIso: '2026-09-05T08:00:00',
      planWindowMaxIso: '2026-09-06T08:00:00',
    });
    expect(rules.forStep('s3', 'start').planWindowMaxIso).toBe('2026-09-06T08:00:00');
    expect(rules.forStep('s3', 'finish').planWindowMaxIso).toBe('2026-09-06T08:00:00');
  });
});
