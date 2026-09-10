// Locks in the fix for a silent-data-loss bug: closing out a step by writing
// actual_end on its roll-up directly is invisible to the server once the step
// has ANY live segment — the next sync push re-sends the (unchanged)
// segments, the server treats that as "this client is authoritative about
// the sessions", and recomputes the roll-up from them, discarding the write.
// See services/stepSegmentActions.ts's file header for the full mechanism.
//
// Repositories are mocked — this tests the write SHAPE (closes the right
// session, as FINAL, then derives the roll-up from it) without touching
// SQLite, matching this app's existing pure-logic test style.

import { closeLastLiveSegment, syncActualRollupFromSegments } from '@services/stepSegmentActions';
import { getSegmentsForStep, updateSegment } from '@repositories/segmentsRepository';
import { upsertActualStep } from '@repositories/planRepository';

jest.mock('@repositories/segmentsRepository');
jest.mock('@repositories/planRepository');

const mockGetSegments = getSegmentsForStep as jest.Mock;
const mockUpdateSegment = updateSegment as jest.Mock;
const mockUpsertActualStep = upsertActualStep as jest.Mock;

const CP = 'cp-1';
const STEP = 'step-boring';

beforeEach(() => jest.clearAllMocks());

function segment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'seg-1',
    checklistPileId: CP,
    stepId: STEP,
    startedAt: '2026-04-01T08:00:00',
    endedAt: null,
    assignedMachineId: 'r1',
    outcome: null,
    stopReason: null,
    remainingMinutes: null,
    notes: null,
    ...over,
  };
}

describe('closeLastLiveSegment', () => {
  it('closes the open session as FINAL', async () => {
    mockGetSegments.mockResolvedValue([segment({ id: 'seg-1', endedAt: null })]);

    const closed = await closeLastLiveSegment(CP, STEP, { endedAtIso: '2026-04-01T10:00:00' });

    expect(closed).toBe(true);
    expect(mockUpdateSegment).toHaveBeenCalledWith(
      'seg-1',
      expect.objectContaining({
        endedAt: '2026-04-01T10:00:00',
        outcome: 'FINAL',
        stopReason: null,
        remainingMinutes: null,
      }),
    );
  });

  it('closes the latest closed-but-not-FINAL session when none is open — a step paused and never resumed, which is exactly resumeWorkService\'s reason for existing', async () => {
    mockGetSegments.mockResolvedValue([
      segment({ id: 'seg-1', endedAt: '2026-04-01T09:00:00', outcome: 'PARTIAL' }),
    ]);

    await closeLastLiveSegment(CP, STEP, { endedAtIso: '2026-04-01T10:00:00' });

    expect(mockUpdateSegment).toHaveBeenCalledWith('seg-1', expect.objectContaining({ outcome: 'FINAL' }));
  });

  it('is a no-op and reports false when the step has no sessions at all', async () => {
    mockGetSegments.mockResolvedValue([]);

    const closed = await closeLastLiveSegment(CP, STEP, { endedAtIso: '2026-04-01T10:00:00' });

    expect(closed).toBe(false);
    expect(mockUpdateSegment).not.toHaveBeenCalled();
  });

  it('preserves the session’s own note when no new one is given', async () => {
    mockGetSegments.mockResolvedValue([segment({ notes: 'paused for shift change' })]);

    await closeLastLiveSegment(CP, STEP, { endedAtIso: '2026-04-01T10:00:00', notes: null });

    expect(mockUpdateSegment).toHaveBeenCalledWith(
      'seg-1',
      expect.objectContaining({ notes: 'paused for shift change' }),
    );
  });

  it('overwrites the note when new text is given', async () => {
    mockGetSegments.mockResolvedValue([segment({ notes: 'paused for shift change' })]);

    await closeLastLiveSegment(CP, STEP, { endedAtIso: '2026-04-01T10:00:00', notes: 'confirmed finished' });

    expect(mockUpdateSegment).toHaveBeenCalledWith(
      'seg-1',
      expect.objectContaining({ notes: 'confirmed finished' }),
    );
  });
});

describe('syncActualRollupFromSegments', () => {
  it('sets actual_end only when the last session is FINAL', async () => {
    mockGetSegments.mockResolvedValue([
      segment({ id: 'seg-1', endedAt: '2026-04-01T10:00:00', outcome: 'FINAL' }),
    ]);

    await syncActualRollupFromSegments(CP, STEP);

    expect(mockUpsertActualStep).toHaveBeenCalledWith(
      expect.objectContaining({ actualEnd: '2026-04-01T10:00:00' }),
    );
  });

  it('clears actual_end for a PARTIAL last session', async () => {
    mockGetSegments.mockResolvedValue([
      segment({ id: 'seg-1', endedAt: '2026-04-01T10:00:00', outcome: 'PARTIAL' }),
    ]);

    await syncActualRollupFromSegments(CP, STEP);

    expect(mockUpsertActualStep).toHaveBeenCalledWith(expect.objectContaining({ actualEnd: null }));
  });

  it('does nothing when the step has no sessions — the roll-up stays authored', async () => {
    mockGetSegments.mockResolvedValue([]);

    await syncActualRollupFromSegments(CP, STEP);

    expect(mockUpsertActualStep).not.toHaveBeenCalled();
  });

  it('uses remarksOverride when given, instead of the existing roll-up remarks', async () => {
    mockGetSegments.mockResolvedValue([segment({ endedAt: '2026-04-01T10:00:00', outcome: 'FINAL' })]);

    await syncActualRollupFromSegments(
      CP,
      STEP,
      { id: 'existing-id', actualStart: null, remarks: 'old remark', assignedMachineId: null },
      'confirmed at close-out',
    );

    expect(mockUpsertActualStep).toHaveBeenCalledWith(
      expect.objectContaining({ remarks: 'confirmed at close-out' }),
    );
  });

  it('omits remarks when no override is given, rather than recopying the existing value', async () => {
    mockGetSegments.mockResolvedValue([segment({ endedAt: '2026-04-01T10:00:00', outcome: 'FINAL' })]);

    await syncActualRollupFromSegments(CP, STEP, {
      id: 'existing-id',
      actualStart: null,
      remarks: 'old remark',
      assignedMachineId: null,
    });

    // upsertActualStep treats an omitted field as "leave it exactly as
    // stored" — recopying existing.remarks here would risk reverting a
    // remarks write that happened earlier in the same caller if that
    // snapshot were stale (see planRepository.ts's upsertActualStep doc).
    const call = mockUpsertActualStep.mock.calls[0][0];
    expect(call).not.toHaveProperty('remarks');
  });
});

// ─── The regression this file exists to guard ──────────────────────────────

describe('a close-out on a segmented step (the resumeWorkService bug)', () => {
  it('closing the last session then re-deriving the roll-up survives a server recompute', async () => {
    // Simulates resumeWorkService.closeOutResumeStep's new two-step sequence
    // for a step that was still open from a previous day.
    const openSession = segment({ id: 'seg-2', endedAt: null, outcome: null });
    mockGetSegments.mockResolvedValue([openSession]);

    const closed = await closeLastLiveSegment(CP, STEP, {
      endedAtIso: '2026-04-01T16:00:00',
      notes: 'confirmed in wizard',
    });
    expect(closed).toBe(true);

    // After the close, a fresh read would show it FINAL — simulate that for
    // the roll-up derivation step.
    mockGetSegments.mockResolvedValue([
      { ...openSession, endedAt: '2026-04-01T16:00:00', outcome: 'FINAL' },
    ]);
    await syncActualRollupFromSegments(CP, STEP, undefined, 'confirmed in wizard');

    // This is exactly what the OLD buggy code could never produce for a
    // segmented step: an actual_end the server's derive_rollup will agree
    // with, because it now comes from a FINAL segment rather than being
    // asserted on the roll-up in isolation.
    expect(mockUpsertActualStep).toHaveBeenCalledWith(
      expect.objectContaining({ actualEnd: '2026-04-01T16:00:00', remarks: 'confirmed in wizard' }),
    );
  });
});
