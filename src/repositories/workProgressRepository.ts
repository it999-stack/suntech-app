// Cross-day pending work for physical piles.

import { and, eq, inArray } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import { pileWorkProgress, type NewPileWorkProgress, type PileWorkProgress } from '@db/schema';

export async function getPendingWorkForPileIds(pileIds: string[]): Promise<PileWorkProgress[]> {
  if (!pileIds.length) return [];
  const db = await initDb();
  return db
    .select()
    .from(pileWorkProgress)
    .where(inArray(pileWorkProgress.pileId, pileIds));
}

export async function savePendingWork(
  entry: Omit<NewPileWorkProgress, 'createdAt' | 'updatedAt' | 'status'>,
): Promise<void> {
  const db = await initDb();
  const now = Date.now();
  await db
    .insert(pileWorkProgress)
    .values({ ...entry, status: 'PENDING_RESUME', createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: pileWorkProgress.pileId,
      set: {
        stepId: entry.stepId,
        remainingMinutes: entry.remainingMinutes,
        status: 'PENDING_RESUME',
        lastChecklistPileId: entry.lastChecklistPileId ?? null,
        lastRigId: entry.lastRigId ?? null,
        lastCraneId: entry.lastCraneId ?? null,
        updatedAt: now,
      },
    });
}

export async function clearPendingWork(pileId: string, stepId: string): Promise<void> {
  const db = await initDb();
  await db.delete(pileWorkProgress).where(and(eq(pileWorkProgress.pileId, pileId), eq(pileWorkProgress.stepId, stepId)));
}

// ─── Live query for useLiveQuery ───────────────────────────────────────────────

/**
 * Live query for useLiveQuery - returns unexecuted query for pending work by pile IDs.
 * The db instance must be initialized before calling this (via initDb() in App.tsx).
 */
export function pendingWorkLiveQuery(pileIds: string[]) {
  if (!pileIds.length) return null;
  return db
    .select()
    .from(pileWorkProgress)
    .where(inArray(pileWorkProgress.pileId, pileIds));
}
