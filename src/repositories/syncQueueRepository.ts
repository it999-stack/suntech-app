// src/repositories/syncQueueRepository.ts
// Durable offline outbox: tracks which checklists have local changes not yet
// confirmed synced to the server. At most one row per checklistId.

import { eq, inArray, or } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilSyncQueue, type PilSyncQueueRow } from '@db/schema';
import { generateId } from '@/utils/helpers';

/**
 * Mark a checklist dirty. Upserts by checklistId — re-enqueuing an
 * already-queued checklist just resets it to pending and bumps enqueuedAt,
 * rather than creating a duplicate row.
 */
export async function enqueueChecklistSync(checklistId: string): Promise<void> {
  const db = await initDb();
  const now = Date.now();
  await db
    .insert(pilSyncQueue)
    .values({
      id: generateId(),
      checklistId,
      status: 'pending',
      attempts: 0,
      lastError: null,
      enqueuedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pilSyncQueue.checklistId,
      set: { status: 'pending', enqueuedAt: now, updatedAt: now },
    });
}

/** Rows ready to be pushed: pending (new/never-tried) or previously failed (retry). */
export async function getFlushBatch(): Promise<PilSyncQueueRow[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilSyncQueue)
    .where(or(eq(pilSyncQueue.status, 'pending'), eq(pilSyncQueue.status, 'failed')))
    .all();
}

/** Live count of dirty checklists — for a Profile screen "N changes pending" indicator. */
export async function getPendingCount(): Promise<number> {
  const rows = await getFlushBatch();
  return rows.length;
}

export async function markSyncing(checklistIds: string[]): Promise<void> {
  if (!checklistIds.length) return;
  const db = await initDb();
  await db
    .update(pilSyncQueue)
    .set({ status: 'syncing', updatedAt: Date.now() })
    .where(inArray(pilSyncQueue.checklistId, checklistIds));
}

/** Success — remove from the queue entirely. */
export async function markSynced(checklistIds: string[]): Promise<void> {
  if (!checklistIds.length) return;
  const db = await initDb();
  await db.delete(pilSyncQueue).where(inArray(pilSyncQueue.checklistId, checklistIds));
}

/** Failure — stays in the queue, retried on the next flush. */
export async function markFailed(checklistId: string, errorMessage: string): Promise<void> {
  const db = await initDb();
  const [existing] = await db
    .select({ attempts: pilSyncQueue.attempts })
    .from(pilSyncQueue)
    .where(eq(pilSyncQueue.checklistId, checklistId))
    .limit(1);
  await db
    .update(pilSyncQueue)
    .set({
      status: 'failed',
      attempts: (existing?.attempts ?? 0) + 1,
      lastError: errorMessage,
      updatedAt: Date.now(),
    })
    .where(eq(pilSyncQueue.checklistId, checklistId));
}
