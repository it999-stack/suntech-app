// src/services/stepSegmentActions.ts
//
// Closing a session, and re-deriving the roll-up from it — stated once here
// so PlanContext's own pause/resume/finish actions and any OTHER write path
// that closes out a step (e.g. resumeWorkService's previous-day close-out)
// can't drift into disagreeing about what "finish" means for a segmented
// step. Two implementations of this exact logic is how the bug this file
// fixes happened in the first place: resumeWorkService's closeOutResumeStep
// wrote actual_end on the roll-up directly, never touching the step's
// segments — which is exactly wrong once a step has any.
//
// The invariant this protects: once a step has ANY live segment, its
// pil_actual_steps row is a roll-up DERIVED from them, server-side (see
// actual_step_segments.py::derive_rollup) — never authored directly. Writing
// actual_end on the roll-up alone for such a step gets SILENTLY REVERTED the
// next time this checklist's segments sync, because getChecklistsForSync
// always re-sends every local segment for the whole checklist regardless of
// what changed, so the server always treats the step's segments as "touched"
// this push (see push_service.py's segment_keys / touched_keys) and
// recomputes the roll-up from them — discarding whatever the roll-up write
// intended, with no error and no conflict raised. The fix is structural, not
// a special case: any caller that wants to "finish" a step must close its
// last live SESSION and let the roll-up follow from that, never write
// actual_end on the roll-up as if the step had none.

import { getSegmentsForStep, updateSegment } from '@repositories/segmentsRepository';
import { upsertActualStep } from '@repositories/planRepository';
import { generateId } from '@utils/helpers';

/**
 * Close a step's most recent live session as FINAL.
 *
 * Picks the open session if there is one, else the latest closed one — same
 * "resume from wherever work actually stands" reasoning as PlanContext's own
 * finishSegment, since a step reaching a close-out can be either: still
 * running as of the last synced data, or already paused (closed PARTIAL) and
 * simply never resumed before the day rolled over.
 *
 * Returns false with no write at all when the step has no sessions — the
 * caller is then free to write the roll-up directly, exactly as every step
 * predating this feature (and everything the web dashboard writes) does.
 */
export async function closeLastLiveSegment(
  checklistPileId: string,
  stepId: string,
  args: { endedAtIso: string; notes?: string | null },
): Promise<boolean> {
  const live = await getSegmentsForStep(checklistPileId, stepId);
  const target = live.find((s) => !s.endedAt) ?? live[live.length - 1];
  if (!target) return false;

  await updateSegment(target.id, {
    endedAt: args.endedAtIso,
    outcome: 'FINAL',
    // A finished session has no work left and no reason for stopping beyond
    // "it's done" — clearing both keeps a step that was paused and later
    // finished from carrying a stale remaining-minutes/reason.
    stopReason: null,
    remainingMinutes: null,
    // `??`, not `||`: an explicit empty note still means "nothing new to
    // say", which should fall through to whatever this session's note
    // already was (e.g. why it was originally paused) rather than blank it.
    notes: args.notes ?? target.notes ?? null,
  });
  return true;
}

/**
 * Mirrors the server's roll-up rule onto the local actual row — see
 * actual_step_segments.py::derive_rollup. A step with no live segments is
 * left untouched: its roll-up is authored directly and this has nothing to
 * derive it from.
 *
 * `remarksOverride` lets a caller state the roll-up's remarks explicitly
 * (e.g. text just entered in a close-out flow) instead of carrying forward
 * whatever `existing.remarks` already held — omit it to preserve the
 * existing value unchanged, which is what every in-app pause/resume/finish
 * action wants (remarks there are set through their own separate action).
 */
export async function syncActualRollupFromSegments(
  checklistPileId: string,
  stepId: string,
  existing?: {
    id: string;
    actualStart: string | null;
    remarks: string | null;
    assignedMachineId: string | null;
  },
  remarksOverride?: string | null,
): Promise<void> {
  const live = await getSegmentsForStep(checklistPileId, stepId);
  if (!live.length) return;

  const last = live[live.length - 1];
  const firstStart = live[0].startedAt;
  await upsertActualStep({
    id: existing?.id ?? generateId(),
    checklistPileId,
    stepId,
    // Never move a recorded start forward — a step already in progress
    // before it was ever split has elapsed time no session covers.
    actualStart:
      existing?.actualStart && existing.actualStart < firstStart ? existing.actualStart : firstStart,
    // Only a FINAL session finishes the step. A PARTIAL one must CLEAR any
    // stored end: that is exactly what "paused, not done" means to every
    // reader that still looks at actualEnd.
    actualEnd: last.outcome === 'FINAL' ? (last.endedAt ?? null) : null,
    // Omitted (not recopied from `existing`) when there's no override —
    // upsertActualStep's patch semantics then leave the stored value alone,
    // which can't go stale the way copying `existing.remarks` here could.
    ...(remarksOverride !== undefined ? { remarks: remarksOverride } : {}),
    assignedMachineId: last.assignedMachineId ?? existing?.assignedMachineId ?? null,
  });
}
