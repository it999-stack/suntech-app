// src/repositories/pilesRepository.ts
// Local SQLite access for cached piling_piles data.

import { and, eq, inArray, isNull, like, notInArray, sql } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import { pilingPiles, pilingDimensions, type NewPilingPile, type PilingPile, type PilingDimension } from '@db/schema';

/**
 * Replace all piles for a site with a fresh batch from the server.
 * Uses upsert so existing rows are updated rather than duplicated.
 */
export async function savePiles(piles: NewPilingPile[]): Promise<void> {
  if (piles.length === 0) return;
  const db = await initDb();
  await db.transaction(async (tx) => {
    for (const pile of piles) {
      await tx
        .insert(pilingPiles)
        .values(pile)
        .onConflictDoUpdate({
          target: pilingPiles.id,
          set: {
            siteId: pile.siteId,
            locationId: pile.locationId,
            pileIdCode: pile.pileIdCode,
            area: pile.area,
            dimensionId: pile.dimensionId,
            notes: pile.notes,
            syncedAt: pile.syncedAt,
          },
        });
    }
  });
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

/** Get all piles assigned to one location within a site. */
export async function getPilesByLocation(siteId: string, locationId: string): Promise<PilingPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPiles)
    .where(and(eq(pilingPiles.siteId, siteId), eq(pilingPiles.locationId, locationId)));
}

/** Get piles that have not yet been assigned to any location. */
export async function getUnassignedPilesBySite(siteId: string): Promise<PilingPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPiles)
    .where(and(eq(pilingPiles.siteId, siteId), isNull(pilingPiles.locationId)));
}

/** Assign a pile to a location, or clear the assignment by passing null. */
export async function setPileLocation(pileId: string, locationId: string | null): Promise<void> {
  const db = await initDb();
  await db.update(pilingPiles).set({ locationId }).where(eq(pilingPiles.id, pileId));
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
  locationId: string | null;
  pileIdCode: string;
  area: string | null;
  dimensionId: string;
  notes: string | null;
  syncedAt: number;
  dia: number;
  depth: number;
}

const pileWithDimensionColumns = {
  id: pilingPiles.id,
  siteId: pilingPiles.siteId,
  locationId: pilingPiles.locationId,
  pileIdCode: pilingPiles.pileIdCode,
  area: pilingPiles.area,
  dimensionId: pilingPiles.dimensionId,
  notes: pilingPiles.notes,
  syncedAt: pilingPiles.syncedAt,
  dia: pilingDimensions.dia,
  depth: pilingDimensions.depth,
};

/**
 * Get all piles for a site with dia/depth from the dimensions table.
 * This replaces direct access to pilingPiles.dia/pilingPiles.depth which no longer exist.
 */
export async function getPilesBySiteWithDimensions(siteId: string): Promise<PileWithDimension[]> {
  const database = await initDb();
  const rows = await database
    .select(pileWithDimensionColumns)
    .from(pilingPiles)
    .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
    .where(eq(pilingPiles.siteId, siteId));
  return rows;
}

export interface PilesPageParams {
  siteId: string;
  /** Substring match against pileIdCode, case-insensitive. Empty/undefined = no filter. */
  search?: string;
  /** Restrict to one location. Undefined/'all' = no location filter. */
  locationId?: string;
  /** Pile ids to exclude from results (e.g. piles already in today's plan). */
  excludeIds?: string[];
  /** 1-based page number. */
  page: number;
  pageSize: number;
}

export interface PilesPageResult {
  items: PileWithDimension[];
  total: number;
}

/**
 * Paginated + searchable variant of getPilesBySiteWithDimensions, for pickers
 * that must stay responsive on sites with thousands of piles. Filtering,
 * limiting, and counting all happen in SQL — only one page is ever loaded
 * into memory.
 */
export async function getPilesBySiteWithDimensionsPage({
  siteId,
  search,
  locationId,
  excludeIds = [],
  page,
  pageSize,
}: PilesPageParams): Promise<PilesPageResult> {
  const database = await initDb();
  const q = search?.trim();

  const conditions = [eq(pilingPiles.siteId, siteId)];
  if (q) conditions.push(like(pilingPiles.pileIdCode, `%${q}%`));
  if (locationId && locationId !== 'all') conditions.push(eq(pilingPiles.locationId, locationId));
  if (excludeIds.length > 0) conditions.push(notInArray(pilingPiles.id, excludeIds));
  const where = and(...conditions);

  const [items, countRows] = await Promise.all([
    database
      .select(pileWithDimensionColumns)
      .from(pilingPiles)
      .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
      .where(where)
      .orderBy(pilingPiles.pileIdCode, pilingPiles.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database
      .select({ total: sql<number>`count(*)` })
      .from(pilingPiles)
      .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
      .where(where),
  ]);

  return { items, total: countRows[0]?.total ?? 0 };
}

export interface LocationPileCount {
  locationId: string | null;
  count: number;
}

/**
 * Pile counts grouped by location, for labeling a location-filter pill row
 * without loading the site's full pile list into memory. Independent of any
 * search text — mirrors PilesScreen.tsx's existing dimension-count behavior,
 * where facet counts don't react to the active search query.
 */
export async function getPileCountsByLocationForSite(
  siteId: string,
  excludeIds: string[] = [],
): Promise<LocationPileCount[]> {
  const database = await initDb();

  const conditions = [eq(pilingPiles.siteId, siteId)];
  if (excludeIds.length > 0) conditions.push(notInArray(pilingPiles.id, excludeIds));

  return database
    .select({ locationId: pilingPiles.locationId, count: sql<number>`count(*)` })
    .from(pilingPiles)
    .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
    .where(and(...conditions))
    .groupBy(pilingPiles.locationId);
}
