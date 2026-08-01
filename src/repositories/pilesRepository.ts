// src/repositories/pilesRepository.ts
// Local SQLite access for cached piling_piles data.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import { pilingPiles, pilingDimensions, type NewPilingPile, type PilingPile, type PilingDimension } from '@db/schema';

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
          areaId: pile.areaId,
          pileIdCode: pile.pileIdCode,
          areaLocation: pile.areaLocation,
          dimensionId: pile.dimensionId,
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

/** Get all piles assigned to one area within a site. */
export async function getPilesByArea(siteId: string, areaId: string): Promise<PilingPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPiles)
    .where(and(eq(pilingPiles.siteId, siteId), eq(pilingPiles.areaId, areaId)));
}

/** Get piles that have not yet been assigned to any area. */
export async function getUnassignedPilesBySite(siteId: string): Promise<PilingPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPiles)
    .where(and(eq(pilingPiles.siteId, siteId), isNull(pilingPiles.areaId)));
}

/** Assign a pile to an area, or clear the assignment by passing null. */
export async function setPileArea(pileId: string, areaId: string | null): Promise<void> {
  const db = await initDb();
  await db.update(pilingPiles).set({ areaId }).where(eq(pilingPiles.id, pileId));
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

/**
 * Hard-delete locally cached piles the server has soft-deleted. The app
 * never owns this data, so there's no local soft-delete concept to mirror —
 * a server-reported deletion just means "purge it from the local cache."
 */
export async function deletePilesByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await initDb();
  await db.delete(pilingPiles).where(inArray(pilingPiles.id, ids));
}

// ─── Live query for useLiveQuery ───────────────────────────────────────────────

/**
 * Live query for useLiveQuery - returns unexecuted query for piles by site.
 * The db instance must be initialized before calling this (via initDb() in App.tsx).
 */
export function pilesBySiteLiveQuery(siteId: string) {
  return db.select().from(pilingPiles).where(eq(pilingPiles.siteId, siteId));
}

// ─── Joined queries for dimension data ─────────────────────────────────────────

/**
 * Pile row with dimension data (dia/depth) included.
 * Used when UI needs to display dimensions alongside pile info.
 * This is a flat structure for convenience - dia/depth come from the joined dimensions table.
 */
export interface PileWithDimension {
  id: string;
  siteId: string;
  areaId: string | null;
  pileIdCode: string;
  areaLocation: string | null;
  dimensionId: string;
  notes: string | null;
  syncedAt: number;
  dia: number;
  depth: number;
}

/**
 * Get all piles for a site with dia/depth from the dimensions table.
 * This replaces direct access to pilingPiles.dia/pilingPiles.depth which no longer exist.
 */
export async function getPilesBySiteWithDimensions(siteId: string): Promise<PileWithDimension[]> {
  const database = await initDb();
  const rows = await database
    .select({
      id: pilingPiles.id,
      siteId: pilingPiles.siteId,
      areaId: pilingPiles.areaId,
      pileIdCode: pilingPiles.pileIdCode,
      areaLocation: pilingPiles.areaLocation,
      dimensionId: pilingPiles.dimensionId,
      notes: pilingPiles.notes,
      syncedAt: pilingPiles.syncedAt,
      dia: pilingDimensions.dia,
      depth: pilingDimensions.depth,
    })
    .from(pilingPiles)
    .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
    .where(eq(pilingPiles.siteId, siteId));
  return rows;
}
