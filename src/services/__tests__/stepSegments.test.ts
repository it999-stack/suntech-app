// Derivations over a step's work sessions. Pure — no SQLite, no React.
//
// The distinction under test throughout is RUNNING vs PAUSED. Both have a
// start and no end on the roll-up, so the old two-state timestamp reading
// collapses them — and collapsing them is what put a departed machine on the
// pile card as "Current Machine ... Since 08:00".

import {
  deriveStepStatus,
  defaultRemainingMinutes,
  lastLiveSegment,
  machinesForStep,
  workedMinutes,
} from '@services/stepSegments';
import type { ActualSegment } from '@app-types/plan';

const R1 = 'machine-r1';
const R3 = 'machine-r3';

const at = (hour: number, minute = 0) =>
  `2026-04-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

function segment(over: Partial<ActualSegment> = {}): ActualSegment {
  return { id: `seg-${Math.random()}`, startedAt: at(8), assignedMachineId: R1, ...over };
}

/** R-1 bores 08:00-10:30 and hands over; R-3 finishes 14:00-15:00. */
const SPLIT: ActualSegment[] = [
  segment({ id: 's1', startedAt: at(8), endedAt: at(10, 30), outcome: 'PARTIAL', assignedMachineId: R1 }),
  segment({ id: 's2', startedAt: at(14), endedAt: at(15), outcome: 'FINAL', assignedMachineId: R3 }),
];

describe('deriveStepStatus', () => {
  // A step with no sessions is every step recorded before this feature, and
  // everything the web dashboard writes. It must read exactly as it always did.
  it('falls back to the timestamps when there are no sessions', () => {
    expect(deriveStepStatus(undefined, {})).toBe('NOT_STARTED');
    expect(deriveStepStatus(undefined, { actualStartIso: at(8) })).toBe('RUNNING');
    expect(deriveStepStatus(undefined, { actualStartIso: at(8), actualEndIso: at(9) })).toBe('DONE');
    expect(deriveStepStatus([], { actualStartIso: at(8) })).toBe('RUNNING');
  });

  it('reports an open session as running', () => {
    expect(deriveStepStatus([segment({ endedAt: undefined })], {})).toBe('RUNNING');
  });

  it('reports a closed PARTIAL session as paused, not running', () => {
    const paused = [segment({ endedAt: at(10, 30), outcome: 'PARTIAL' })];
    expect(deriveStepStatus(paused, { actualStartIso: at(8) })).toBe('PAUSED');
  });

  it('reports a closed FINAL session as done', () => {
    expect(deriveStepStatus([segment({ endedAt: at(10), outcome: 'FINAL' })], {})).toBe('DONE');
  });

  it('follows the LAST session, not the first', () => {
    expect(deriveStepStatus(SPLIT, {})).toBe('DONE');
    // ...and a step picked back up after a pause is running again.
    expect(deriveStepStatus([SPLIT[0], segment({ id: 's2', startedAt: at(14) })], {})).toBe('RUNNING');
  });

  it('takes the latest-started when two sessions are somehow both open', () => {
    // Two devices offline on the same step can each leave one open — there is
    // no unique index preventing it, so the derivation degrades rather than
    // throwing. Order of the input must not matter.
    const both = [
      segment({ id: 'a', startedAt: at(8) }),
      segment({ id: 'b', startedAt: at(9) }),
    ];
    expect(lastLiveSegment(both)?.id).toBe('b');
    expect(lastLiveSegment([...both].reverse())?.id).toBe('b');
    expect(deriveStepStatus(both, {})).toBe('RUNNING');
  });

  it('a PARTIAL session overrides a stored end — pausing undoes a finish', () => {
    const reopened = [
      segment({ id: 'a', startedAt: at(8), endedAt: at(10), outcome: 'FINAL' }),
      segment({ id: 'b', startedAt: at(11), endedAt: at(12), outcome: 'PARTIAL' }),
    ];
    expect(deriveStepStatus(reopened, { actualStartIso: at(8), actualEndIso: at(10) })).toBe('PAUSED');
  });
});

describe('workedMinutes', () => {
  it('excludes the pause gap', () => {
    // 08:00-10:30 plus 14:00-15:00 is 3h30m of work across a 7h span. Reading
    // the roll-up span instead would report 420 — the number the delay report
    // currently shows for a split step.
    expect(workedMinutes(SPLIT, { actualStartIso: at(8), actualEndIso: at(15) })).toBe(210);
  });

  it('ignores a session that is still open', () => {
    const running = [SPLIT[0], segment({ id: 's2', startedAt: at(14) })];
    expect(workedMinutes(running, {})).toBe(150);
  });

  it('falls back to the roll-up span when there are no sessions', () => {
    expect(workedMinutes(undefined, { actualStartIso: at(8), actualEndIso: at(9, 30) })).toBe(90);
  });

  it('is undefined rather than 0 when nothing has closed yet', () => {
    expect(workedMinutes([segment({ endedAt: undefined })], {})).toBeUndefined();
    expect(workedMinutes(undefined, { actualStartIso: at(8) })).toBeUndefined();
  });
});

describe('defaultRemainingMinutes', () => {
  it('subtracts work already done, including the session being closed', () => {
    // 120-minute step, open since 08:00, pausing at 09:00 -> 60 left.
    const open = [segment({ id: 'a', startedAt: at(8), endedAt: undefined })];
    expect(defaultRemainingMinutes(120, open, {}, at(9))).toBe(60);
  });

  it('counts earlier closed sessions too', () => {
    // 240-minute step. 08:00-10:30 already closed (150) plus the open session
    // from 14:00 to the 15:00 pause (60) is 210 worked, so 30 left. Counting
    // only the closed session would say 90 and re-plan nearly two hours of
    // work that has already happened.
    const segs = [SPLIT[0], segment({ id: 'b', startedAt: at(14), endedAt: undefined })];
    expect(defaultRemainingMinutes(240, segs, {}, at(15))).toBe(30);
  });

  it('floors at 5 rather than 0 — a pause means work IS left', () => {
    const open = [segment({ id: 'a', startedAt: at(8), endedAt: undefined })];
    expect(defaultRemainingMinutes(30, open, {}, at(12))).toBe(5);
  });

  it('is undefined with no template to reason from', () => {
    expect(defaultRemainingMinutes(undefined, SPLIT, {}, at(15))).toBeUndefined();
  });

  it('works for a step with no sessions yet, off the roll-up start', () => {
    expect(defaultRemainingMinutes(120, undefined, { actualStartIso: at(8) }, at(9))).toBe(60);
  });
});

describe('machinesForStep', () => {
  it('lists every machine that worked it, in order', () => {
    expect(machinesForStep(SPLIT)).toEqual([R1, R3]);
  });

  it('de-duplicates a machine that worked more than one session', () => {
    const backAndForth = [
      segment({ id: 'a', assignedMachineId: R1 }),
      segment({ id: 'b', assignedMachineId: R3 }),
      segment({ id: 'c', assignedMachineId: R1 }),
    ];
    expect(machinesForStep(backAndForth)).toEqual([R1, R3]);
  });

  it('falls back to the step machine when there are no sessions', () => {
    expect(machinesForStep(undefined, R1)).toEqual([R1]);
    expect(machinesForStep(undefined, undefined)).toEqual([]);
  });
});
