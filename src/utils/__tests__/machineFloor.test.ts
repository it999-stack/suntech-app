// Cross-pile machine occupancy, once a step can be split between machines.
//
// The bug this guards against: collapsing a split step to its roll-up span
// under its roll-up machine credits the WHOLE span to whichever machine holds
// the step now (hiding the other machine's real occupancy) and marks the pause
// gap — when neither machine was on this pile — as busy for both.

import {
  buildMachineFloorIndex,
  findMachineConflict,
  findPileStepConflict,
} from '@utils/machineFloor';
import type { ActualEntry, ActualSegment, PileGroup } from '@app-types/plan';

const R1 = 'machine-r1';
const R3 = 'machine-r3';
const CP = 'cp-1';
const OTHER_CP = 'cp-2';

const at = (hour: number, minute = 0) =>
  `2026-04-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
const d = (hour: number, minute = 0) => new Date(at(hour, minute));

function step(over: Partial<ActualEntry> = {}): ActualEntry {
  return {
    stepId: 'step-boring',
    stepName: 'BORING',
    pileCode: 'P-01',
    track: 'RIG',
    sequenceOrder: 2,
    bufferMinutes: 0,
    ...over,
  } as ActualEntry;
}

function group(steps: ActualEntry[], over: Partial<PileGroup> = {}): PileGroup {
  return {
    checklistPileId: CP,
    pileId: 'pile-1',
    pileCode: 'P-01',
    rigs: [],
    cranes: [],
    rigId: R1,
    steps,
    hasBreakdownWarning: false,
    isBlockedByIdle: false,
    measurements: null,
    ...over,
  } as PileGroup;
}

/** R-1 bores 08:00-10:30, hands over; R-3 finishes 14:00-15:00. */
const SPLIT: ActualSegment[] = [
  { id: 's1', startedAt: at(8), endedAt: at(10, 30), outcome: 'PARTIAL', assignedMachineId: R1 },
  { id: 's2', startedAt: at(14), endedAt: at(15), outcome: 'FINAL', assignedMachineId: R3 },
];

describe('buildMachineFloorIndex', () => {
  it('gives a split step one interval per machine, not one for the roll-up', () => {
    const index = buildMachineFloorIndex([
      group([
        step({
          segments: SPLIT,
          assignedMachineId: R3, // the roll-up machine — whoever holds it now
          actualStartIso: at(8),
          actualEndIso: at(15),
        }),
      ]),
    ]);

    expect(index.get(R1)).toEqual([
      expect.objectContaining({ start: at(8), end: at(10, 30), segmentId: 's1' }),
    ]);
    expect(index.get(R3)).toEqual([
      expect.objectContaining({ start: at(14), end: at(15), segmentId: 's2' }),
    ]);
  });

  it('still uses the roll-up span for an ordinary never-split step', () => {
    const index = buildMachineFloorIndex([
      group([step({ assignedMachineId: R1, actualStartIso: at(8), actualEndIso: at(9) })]),
    ]);
    expect(index.get(R1)).toEqual([expect.objectContaining({ start: at(8), end: at(9) })]);
  });

  it('ignores an open session — nothing settled, so nothing is busy', () => {
    const index = buildMachineFloorIndex([
      group([step({ segments: [{ id: 's1', startedAt: at(8), assignedMachineId: R1 }] })]),
    ]);
    expect(index.get(R1)).toBeUndefined();
  });
});

describe('findMachineConflict', () => {
  const index = buildMachineFloorIndex([
    group(
      [
        step({
          segments: SPLIT,
          assignedMachineId: R3,
          actualStartIso: at(8),
          actualEndIso: at(15),
        }),
      ],
      { checklistPileId: OTHER_CP, pileCode: 'P-02' },
    ),
  ]);

  it('frees the handing-over machine the moment its own session ended', () => {
    // R-1 left at 10:30. Under the old roll-up reading it was not even in the
    // index, and R-3 was busy from 08:00.
    expect(findMachineConflict(index, R1, CP, 'step-casing', d(11), d(12))).toBeNull();
  });

  it('still blocks the handing-over machine during its own session', () => {
    expect(findMachineConflict(index, R1, CP, 'step-casing', d(9), d(10))).not.toBeNull();
  });

  it('leaves the pause gap free for the machine taking over', () => {
    // 10:30-14:00 nobody was on this pile, so R-3 is bookable elsewhere.
    expect(findMachineConflict(index, R3, CP, 'step-casing', d(11), d(12))).toBeNull();
  });

  it('blocks the machine taking over during its own session', () => {
    expect(findMachineConflict(index, R3, CP, 'step-casing', d(14, 15), d(14, 45))).not.toBeNull();
  });

  it('excludes the step being edited, on both of its machines', () => {
    expect(findMachineConflict(index, R1, OTHER_CP, 'step-boring', d(9), d(10))).toBeNull();
    expect(findMachineConflict(index, R3, OTHER_CP, 'step-boring', d(14, 15), d(14, 45))).toBeNull();
  });
});

describe('findPileStepConflict', () => {
  // Deliberately still reads the step's ROLL-UP span, unlike the machine index
  // above. A machine really is free during another step's pause gap; a PILE is
  // not — its steps are one physical sequence, so step N+1 must not be
  // recorded inside step N's pause whoever holds the machine.
  const steps = [
    step({
      stepId: 'step-boring',
      segments: SPLIT,
      actualStartIso: at(8),
      actualEndIso: at(15),
    }),
  ];

  it('blocks another step of the same pile inside the pause gap', () => {
    expect(findPileStepConflict(steps, 'step-casing', d(11), d(12))).not.toBeNull();
  });

  it('allows a time genuinely outside the whole span', () => {
    expect(findPileStepConflict(steps, 'step-casing', d(16), d(17))).toBeNull();
  });

  it('excludes the step being edited', () => {
    expect(findPileStepConflict(steps, 'step-boring', d(11), d(12))).toBeNull();
  });
});
