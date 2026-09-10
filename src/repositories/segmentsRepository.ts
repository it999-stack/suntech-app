// src/repositories/segmentsRepository.ts
//
// Local reads/writes for pil_actual_step_segments — one row per work session
// on a step. See pileActualStepSegments in db/schema.ts for why the table has
// no segment number and no unique index.
//
// Deletion is always soft. The sync push sends the whole checklist subtree, so
// a hard delete here would be invisible to the server and to other devices —
// worse, a device that had never seen a session would erase it just by pushing.

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { initDb } from '@db/client';
import {
  pileActualStepSegments,
  type NewPileActualStepSegment,
  type PileActualStepSegment,
} from '@db/schema';
import { generateId } from '@utils/helpers';

/** Every live session for a checklist's piles, oldest first.
 *
 * Ordered here rather than by the caller because "the last session" decides
 * the step's whole state (running vs paused vs done) — leaving that to each
 * consumer is how the answer starts differing between screens. */
export async function getSegmentsForChecklistPiles(
  checklistPileIds: string[],
): Promise<PileActualStepSegment[]> {
  if (!checklistPileIds.length) return [];
  const db = await initDb();
  const rows = await db
    .select()
    .from(pileActualStepSegments)
    .where(
      and(
        inArray(pileActualStepSegments.checklistPileId, checklistPileIds),
        isNull(pileActualStepSegments.deletedAt),
      ),
    );
  // Sorted in JS, not SQL: startedAt is an ISO string so lexicographic order
  // is chronological, and this keeps the ordering rule in one place alongside
  // the id tiebreak (two devices can produce sessions with the same start).
  return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
}

export async function getSegmentsForStep(
  checklistPileId: string,
  stepId: string,
): Promise<PileActualStepSegment[]> {
  const db = await initDb();
  const rows = await db
    .select()
    .from(pileActualStepSegments)
    .where(
      and(
        eq(pileActualStepSegments.checklistPileId, checklistPileId),
        eq(pileActualStepSegments.stepId, stepId),
        isNull(pileActualStepSegments.deletedAt),
      ),
    );
  return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
}

export async function insertSegment(
  entry: Omit<NewPileActualStepSegment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<string> {
  const db = await initDb();
  const now = Date.now();
  const id = entry.id ?? generateId();
  await db.insert(pileActualStepSegments).values({ ...entry, id, createdAt: now, updatedAt: now });
  return id;
}

/**
 * Patch one session. Only the fields passed are written — omitting a field
 * leaves it alone, matching upsertActualStep's `assignedMachineId` semantics.
 *
 * Deliberately never touches serverUpdatedAt: that column is the last-known
 * SERVER version for optimistic concurrency and must only ever be set from a
 * real server payload, never from a local edit's device clock.
 */
export async function updateSegment(
  id: string,
  patch: Partial<
    Pick<
      NewPileActualStepSegment,
      | 'startedAt'
      | 'endedAt'
      | 'assignedMachineId'
      | 'outcome'
      | 'stopReason'
      | 'remainingMinutes'
      | 'notes'
      | 'machineEventId'
    >
  >,
): Promise<void> {
  const db = await initDb();
  await db
    .update(pileActualStepSegments)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(pileActualStepSegments.id, id));
}

/** Soft delete — see the file header for why this is never a real delete. */
export async function softDeleteSegment(id: string): Promise<void> {
  const db = await initDb();
  const now = Date.now();
  await db
    .update(pileActualStepSegments)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(pileActualStepSegments.id, id));
}

/**
 * Make sure a step that already has recorded work has a session covering it,
 * before its first split.
 *
 * Every step recorded before this feature existed — and everything the web
 * dashboard writes — has an actual row and no sessions. The moment such a step
 * is paused, the work already done needs a session of its own, or the roll-up
 * recompute would move its start forward to the pause and silently drop the
 * elapsed time. (The server's `min(existing, first)` clause is the backstop
 * for this; doing it properly here is what keeps the segments themselves
 * truthful rather than merely non-destructive.)
 *
 * `machineId` must be the FULLY RESOLVED machine — plan ?? actual ?? the
 * pile's own rig/crane for the track — not the raw actual row's column, which
 * is null on legacy rows whose plan row held the answer.
 *
 * Returns the open baseline session's id, or null when the step has sessions
 * already (or was never started, so there is nothing to back-fill).
 */
export async function ensureBaselineSegment(args: {
  checklistPileId: string;
  stepId: string;
  actualStartIso?: string;
  machineId?: string;
}): Promise<string | null> {
  const existing = await getSegmentsForStep(args.checklistPileId, args.stepId);
  if (existing.length > 0) return null;
  if (!args.actualStartIso) return null;

  return insertSegment({
    checklistPileId: args.checklistPileId,
    stepId: args.stepId,
    startedAt: args.actualStartIso,
    // Left open on purpose: the work it represents was in progress right up to
    // the moment being recorded, and the caller closes it as part of the same
    // action (pause, hand off, or finish).
    endedAt: null,
    assignedMachineId: args.machineId ?? null,
    outcome: null,
    stopReason: null,
    remainingMinutes: null,
    notes: null,
    machineEventId: null,
    deletedAt: null,
    serverUpdatedAt: null,
  });
}

/** Hard-deletes rows for the given checklist-piles. Used only by the hydrate
 * path, which replaces a checklist's whole subtree with the server's copy —
 * NOT a user-facing delete (that is softDeleteSegment above). */
export async function deleteSegmentsForChecklistPiles(checklistPileIds: string[]): Promise<void> {
  if (!checklistPileIds.length) return;
  const db = await initDb();
  await db
    .delete(pileActualStepSegments)
    .where(inArray(pileActualStepSegments.checklistPileId, checklistPileIds));
}
