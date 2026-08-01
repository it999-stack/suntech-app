// src/repositories/dimensionsRepository.ts
// Local SQLite access for cached piling_dimensions data.

import { asc, eq, inArray } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import { pilingDimensions, type NewPilingDimension, type PilingDimension } from '@db/schema';

/** Return all cached dimensions for a site, diameter ascending. */
export async function getDimensionsBySite(siteId: string): Promise<PilingDimension[]> {
  const database = await initDb();
  return database
    .select()
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId))
    .orderBy(asc(pilingDimensions.dia), asc(pilingDimensions.depth));
}

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
 * Delete all locally cached dimensions for a site (e.g., on logout or re-assign).
 */
export async function clearDimensionsBySite(siteId: string): Promise<void> {
  const db = await initDb();
  await db.delete(pilingDimensions).where(eq(pilingDimensions.siteId, siteId));
}

/**
 * Hard-delete locally cached dimensions the server has soft-deleted. Currently
 * a no-op in practice — no delete endpoint exists for dimensions server-side
 * yet — but wired for when one does (Phase 3 delta-sync groundwork).
 */
export async function deleteDimensionsByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingDimensions).where(inArray(pilingDimensions.id, ids));
}

// ─── Live query for useLiveQuery ───────────────────────────────────────────────

/**
 * Live query for useLiveQuery - returns unexecuted query for dimensions by site.
 * The db instance must be initialized before calling this (via initDb() in App.tsx).
 */
export function dimensionsBySiteLiveQuery(siteId: string) {
  return db.select().from(pilingDimensions).where(eq(pilingDimensions.siteId, siteId));
}
