// Pile-card derivation, once a step can be paused.
//
// Before segments, `inProgressStep` was `actualStartIso && !actualEndIso`. A
// PAUSED step matches that exactly, so the card claimed "In progress", showed
// the machine that had already walked away as "Current Machine", and printed
// "Since 08:00" hours after it left. Three wrong statements from one predicate.

import { getPileMachines, getPileProgress } from '@components/plan/actual/pileProgress';
import type { ActualEntry, ActualSegment } from '@app-types/plan';

const R1 = 'machine-r1';
const R3 = 'machine-r3';

const at = (hour: number, minute = 0) =>
  `2026-04-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

function step(over: Partial<ActualEntry> = {}): ActualEntry {
  return {
    stepId: `step-${Math.random()}`,
    stepName: 'BORING',
    pileCode: 'P-01',
    track: 'RIG',
    sequenceOrder: 1,
    bufferMinutes: 0,
    ...over,
  } as ActualEntry;
}

const done = (over: Partial<ActualEntry> = {}) =>
  step({ actualStart: 480, actualEnd: 540, actualStartIso: at(8), actualEndIso: at(9), status: 'DONE', ...over });
const untouched = (over: Partial<ActualEntry> = {}) => step({ status: 'NOT_STARTED', ...over });
const running = (over: Partial<ActualEntry> = {}) =>
  step({ actualStart: 480, actualStartIso: at(8), status: 'RUNNING', ...over });
const paused = (over: Partial<ActualEntry> = {}) =>
  step({ actualStart: 480, actualStartIso: at(8), status: 'PAUSED', ...over });

describe('getPileProgress', () => {
  it('reports a paused pile as PAUSED, not IN_PROGRESS', () => {
    const p = getPileProgress([done(), paused(), untouched()]);
    expect(p.status).toBe('PAUSED');
  });

  it('leaves inProgressStep null when the only live step is paused', () => {
    // This is what stops the card printing "Current Machine ... Since 08:00"
    // for a machine that handed the work over hours ago.
    const p = getPileProgress([done(), paused()]);
    expect(p.inProgressStep).toBeNull();
    expect(p.pausedStep).not.toBeNull();
  });

  it('prefers IN_PROGRESS when something is genuinely running', () => {
    // A pile with an earlier paused step and a later running one is being
    // worked on — that is the more useful headline.
    const p = getPileProgress([paused(), running()]);
    expect(p.status).toBe('IN_PROGRESS');
    expect(p.inProgressStep).not.toBeNull();
  });

  it('does not count a paused step as done', () => {
    const p = getPileProgress([done(), paused(), untouched()]);
    expect(p.doneCount).toBe(1);
    expect(p.total).toBe(3);
    expect(p.allDone).toBe(false);
  });

  // Every pile that predates the feature has no `status` on its steps, so the
  // timestamp fallback has to keep behaving exactly as it always did.
  it('is unchanged for steps with no derived status', () => {
    const legacyRunning = step({ actualStart: 480, actualStartIso: at(8) });
    expect(getPileProgress([legacyRunning]).status).toBe('IN_PROGRESS');
    expect(getPileProgress([legacyRunning]).inProgressStep).not.toBeNull();

    expect(getPileProgress([step()]).status).toBe('NOT_STARTED');
    expect(getPileProgress([done()]).status).toBe('COMPLETED');
  });

  it('ignores historical rows when deciding what is live', () => {
    const historical = step({ actualStartIso: at(8), isHistorical: true, status: 'RUNNING' });
    expect(getPileProgress([historical, untouched()]).inProgressStep).toBeNull();
  });
});

describe('getPileMachines', () => {
  const SPLIT: ActualSegment[] = [
    { id: 's1', startedAt: at(8), endedAt: at(10, 30), outcome: 'PARTIAL', assignedMachineId: R1, assignedMachineNo: 'R-1' },
    { id: 's2', startedAt: at(14), endedAt: at(15), outcome: 'FINAL', assignedMachineId: R3, assignedMachineNo: 'R-3' },
  ];

  it('credits BOTH machines that worked a split step', () => {
    // The roll-up names only R-3. Reading that alone drops R-1's 2h30m
    // entirely — the mis-attribution the whole feature exists to fix.
    const { worked } = getPileMachines([
      done({ segments: SPLIT, assignedMachineId: R3, assignedMachineNo: 'R-3' }),
    ]);
    expect(worked.map((m) => m.no)).toEqual(['R-1', 'R-3']);
  });

  it('is unchanged for an ordinary step with no sessions', () => {
    const { worked, planned } = getPileMachines([
      done({ assignedMachineId: R1, assignedMachineNo: 'R-1' }),
    ]);
    expect(worked.map((m) => m.no)).toEqual(['R-1']);
    expect(planned.map((m) => m.no)).toEqual(['R-1']);
  });

  it('does not list a machine as worked before the step starts', () => {
    const { worked, planned } = getPileMachines([
      untouched({ assignedMachineId: R1, assignedMachineNo: 'R-1' }),
    ]);
    expect(worked).toEqual([]);
    expect(planned.map((m) => m.no)).toEqual(['R-1']);
  });
});
