// src/repositories/pilesRepository.ts
// Local SQLite access for cached piling_piles data.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilingPiles, type NewPilingPile, type PilingPile } from '@db/schema';

/**
 * Replace all piles for a site with a fresh batch from the server.
 * Uses upsert so existing rows are updated rather than duplicated.
 */
export async function savePiles(piles: NewPilingPile[]): Promise<void> {
  if (piles.length === 0) return;
  const db = await initDb();
  for (const pile of piles) {
    await db
      .insert(pilingPiles)
      .values(pile)
      .onConflictDoUpdate({
        target: pilingPiles.id,
        set: {
          siteId: pile.siteId,
          pileIdCode: pile.pileIdCode,
          areaLocation: pile.areaLocation,
          dia: pile.dia,
          depth: pile.depth,
          notes: pile.notes,
          syncedAt: pile.syncedAt,
        },
      });
  }
}

/**
 * Get all locally cached piles for a given site.
 */
export async function getPilesBySite(siteId: string): Promise<PilingPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPiles)
    .where(eq(pilingPiles.siteId, siteId));
}

/**
 * Get the timestamp of the last successful sync for a site.
 * Returns null if no piles have been synced yet.
 */
export async function getLastSyncTime(siteId: string): Promise<number | null> {
  const db = await initDb();
  const rows = await db
    .select({ syncedAt: pilingPiles.syncedAt })
    .from(pilingPiles)
    .where(eq(pilingPiles.siteId, siteId))
    .limit(1);
  return rows[0]?.syncedAt ?? null;
}

/**
 * Delete all locally cached piles for a site (e.g., on logout or re-assign).
 */
export async function clearPilesBySite(siteId: string): Promise<void> {
  const db = await initDb();
  await db.delete(pilingPiles).where(eq(pilingPiles.siteId, siteId));
}
