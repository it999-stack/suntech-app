// src/repositories/dimensionsRepository.ts
// Local SQLite access for cached piling_dimensions data.

import { eq } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import { pilingDimensions, type NewPilingDimension, type PilingDimension } from '@db/schema';

/**
 * Replace all dimensions for a site with a fresh batch from the server.
 * Uses upsert so existing rows are updated rather than duplicated.
 */
export async function saveDimensions(dimensions: NewPilingDimension[]): Promise<void> {
  if (dimensions.length === 0) return;

  const db = await initDb();
  for (const dimension of dimensions) {
    await db
      .insert(pilingDimensions)
      .values(dimension)
      .onConflictDoUpdate({
        target: pilingDimensions.id,
        set: {
          siteId: dimension.siteId,
          dia: dimension.dia,
          depth: dimension.depth,
          label: dimension.label,
          syncedAt: dimension.syncedAt,
        },
      });
  }
}

/**
 * Get all locally cached dimensions for a given site.
 */
export async function getDimensionsBySite(siteId: string): Promise<PilingDimension[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId));
}

/**
 * Delete all locally cached dimensions for a site (e.g., on logout or re-assign).
 */
export async function clearDimensionsBySite(siteId: string): Promise<void> {
  const db = await initDb();
  await db.delete(pilingDimensions).where(eq(pilingDimensions.siteId, siteId));
}

// ─── Live query for useLiveQuery ───────────────────────────────────────────────

/**
 * Live query for useLiveQuery - returns unexecuted query for dimensions by site.
 * The db instance must be initialized before calling this (via initDb() in App.tsx).
 */
export function dimensionsBySiteLiveQuery(siteId: string) {
  return db.select().from(pilingDimensions).where(eq(pilingDimensions.siteId, siteId));
}
