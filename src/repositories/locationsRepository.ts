// src/repositories/locationsRepository.ts
// Local CRUD helpers for site work locations.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilingLocations, type NewPilingLocation, type PilingLocation } from '@db/schema';

/** Return active locations for a site in configured display order. */
export async function getLocationsBySite(siteId: string): Promise<PilingLocation[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingLocations)
    .where(and(eq(pilingLocations.siteId, siteId), eq(pilingLocations.isActive, true)))
    .orderBy(asc(pilingLocations.sortOrder), asc(pilingLocations.name));
}

/**
 * Insert or update all synced site locations.
 */
export async function saveLocations(
  rows: NewPilingLocation[],
): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();

  for (const location of rows) {
    await db
      .insert(pilingLocations)
      .values(location)
      .onConflictDoUpdate({
        target: pilingLocations.id,
        set: {
          siteId: location.siteId,
          name: location.name,
          code: location.code ?? null,
          sortOrder: location.sortOrder ?? 0,
          isActive: location.isActive ?? true,
          updatedAt: location.updatedAt,
        },
      });
  }
}

/** Soft-delete a location so historic pile assignments remain intact. */
export async function deactivateLocation(locationId: string): Promise<void> {
  const db = await initDb();
  await db
    .update(pilingLocations)
    .set({ isActive: false, updatedAt: Date.now() })
    .where(eq(pilingLocations.id, locationId));
}

/**
 * Hard-delete locally cached locations the server has soft-deleted. Currently
 * a no-op in practice — no delete endpoint exists for locations server-side
 * yet — but wired for when one does (Phase 3 delta-sync groundwork).
 */
export async function deleteLocationsByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingLocations).where(inArray(pilingLocations.id, ids));
}
