// src/repositories/syncCursorRepository.ts
// Local storage for the per-site delta-sync cursor (Phase 3). One row per
// site; established once from bootstrap-history's server_time, then advanced
// after every successful delta pull.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilSyncCursor } from '@db/schema';

/** Returns the persisted cursor for a site, or null if none exists yet (fresh install). */
export async function getCursor(siteId: string): Promise<string | null> {
  const db = await initDb();
  const rows = await db
    .select({ cursorValue: pilSyncCursor.cursorValue })
    .from(pilSyncCursor)
    .where(eq(pilSyncCursor.siteId, siteId))
    .limit(1);
  return rows[0]?.cursorValue ?? null;
}

/** Persists the cursor for a site — upserts by siteId. */
export async function setCursor(siteId: string, cursorValue: string): Promise<void> {
  const db = await initDb();
  const now = Date.now();
  await db
    .insert(pilSyncCursor)
    .values({ siteId, cursorValue, updatedAt: now })
    .onConflictDoUpdate({
      target: pilSyncCursor.siteId,
      set: { cursorValue, updatedAt: now },
    });
}
