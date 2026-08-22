// src/repositories/pilesRepository.ts
// Local SQLite access for cached piling_piles data.

import { and, asc, eq, inArray, isNull, like, notInArray, sql } from 'drizzle-orm';
import { initDb, db } from '@db/client';
import {
  pilingPiles,
  pilingDimensions,
  pilingChecklistPiles,
  pilingDailyChecklists,
  pilePlanSteps,
  pileActualSteps,
  type NewPilingPile,
  type PilingPile,
  type PilingDimension,
} from '@db/schema';

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

// ─── Site-wide pile status (Piles list screen) ─────────────────────────────
//
// pil_checklist_piles.status is NOT a reliable source of truth — nothing on
// the device ever writes IN_PROGRESS/COMPLETED into it locally (the only
// local mutator, updateChecklistPileStatus() in checklistRepository.ts, has
// no call sites), and hydrateChecklistFromServer only mirrors whatever the
// server last reported, which can go stale between syncs. The real status —
// same source the server-side dashboard's own "Completed" reflects — comes
// from actual step completion: pil_plan_steps (what was planned) vs
// pil_actual_steps (what was actually started/finished). This mirrors
// derivePileStatus() in utils/helpers.ts, computed at the SQL layer instead
// so it can roll up every day a pile has ever appeared on, not just today.
//
// A pile can carry several checklist-pile rows across different days
// (planned one day, resumed another) — no single "current status" column
// exists on pil_piles itself, so it's rolled up here: a pile is COMPLETED if
// it was EVER completed on any day (sticky/historical — once done, it stays
// done), else IN_PROGRESS if any day currently has an open (started, not
// finished) step, else NOT_STARTED.

export type PileStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

type Db = Awaited<ReturnType<typeof initDb>>;

/** Per checklist-pile: how many steps were planned for it. */
function planStepCountSubquery(database: Db) {
  return database
    .select({
      checklistPileId: pilePlanSteps.checklistPileId,
      planCount: sql<number>`count(*)`.as('plan_count'),
    })
    .from(pilePlanSteps)
    .groupBy(pilePlanSteps.checklistPileId)
    .as('plan_count_agg');
}

/** Per checklist-pile: how many of its steps have a recorded finish, and whether any is currently open (started, not finished). */
function actualStepAggSubquery(database: Db) {
  return database
    .select({
      checklistPileId: pileActualSteps.checklistPileId,
      finishedCount: sql<number>`count(case when ${pileActualSteps.actualEnd} is not null then 1 end)`.as('finished_count'),
      hasOpen: sql<number>`max(case when ${pileActualSteps.actualStart} is not null and ${pileActualSteps.actualEnd} is null then 1 else 0 end)`.as('has_open'),
    })
    .from(pileActualSteps)
    .groupBy(pileActualSteps.checklistPileId)
    .as('actual_agg');
}

/**
 * Per (pile, checklist day): that day's status, derived from actual step
 * completion — exactly derivePileStatus()'s logic (open step wins over
 * completed; completed requires every planned step finished), just run in
 * SQL against every day at once instead of one in-memory day via PlanContext.
 */
function dayStatusSubquery(database: Db, siteId: string) {
  const planAgg = planStepCountSubquery(database);
  const actualAgg = actualStepAggSubquery(database);
  return database
    .select({
      pileId: pilingChecklistPiles.pileId,
      date: pilingDailyChecklists.date,
      dayStatus: sql<PileStatus>`case
        when coalesce(${actualAgg.hasOpen}, 0) = 1 then 'IN_PROGRESS'
        when coalesce(${planAgg.planCount}, 0) > 0 and coalesce(${actualAgg.finishedCount}, 0) = ${planAgg.planCount} then 'COMPLETED'
        else 'NOT_STARTED'
      end`.as('day_status'),
    })
    .from(pilingChecklistPiles)
    .innerJoin(pilingDailyChecklists, eq(pilingChecklistPiles.checklistId, pilingDailyChecklists.id))
    .leftJoin(planAgg, eq(pilingChecklistPiles.id, planAgg.checklistPileId))
    .leftJoin(actualAgg, eq(pilingChecklistPiles.id, actualAgg.checklistPileId))
    .where(eq(pilingDailyChecklists.siteId, siteId))
    .as('day_status_agg');
}

function pileStatusAggSubquery(database: Db, siteId: string) {
  const dayStatus = dayStatusSubquery(database, siteId);
  return database
    .select({
      pileId: dayStatus.pileId,
      hasCompleted: sql<number>`max(case when ${dayStatus.dayStatus} = 'COMPLETED' then 1 else 0 end)`.as('has_completed'),
      hasInProgress: sql<number>`max(case when ${dayStatus.dayStatus} = 'IN_PROGRESS' then 1 else 0 end)`.as('has_in_progress'),
      // Latest completion date, earliest start date, most recent planned date —
      // the natural reading of "Completed on" / "Started on" / "Planned for".
      completedDate: sql<string | null>`max(case when ${dayStatus.dayStatus} = 'COMPLETED' then ${dayStatus.date} end)`.as('completed_date'),
      startedDate: sql<string | null>`min(case when ${dayStatus.dayStatus} = 'IN_PROGRESS' then ${dayStatus.date} end)`.as('started_date'),
      plannedDate: sql<string | null>`max(case when ${dayStatus.dayStatus} = 'NOT_STARTED' then ${dayStatus.date} end)`.as('planned_date'),
    })
    .from(dayStatus)
    .groupBy(dayStatus.pileId)
    .as('status_agg');
}

type PileStatusAgg = ReturnType<typeof pileStatusAggSubquery>;

// A pile with zero checklist rows ever (left-joined) has null hasCompleted/
// hasInProgress — coalesce to 0 so it resolves to NOT_STARTED instead of NULL.
function statusExpr(agg: PileStatusAgg) {
  return sql<PileStatus>`case
    when coalesce(${agg.hasCompleted}, 0) = 1 then 'COMPLETED'
    when coalesce(${agg.hasInProgress}, 0) = 1 then 'IN_PROGRESS'
    else 'NOT_STARTED'
  end`;
}
function statusDateExpr(agg: PileStatusAgg) {
  return sql<string | null>`coalesce(${agg.completedDate}, ${agg.startedDate}, ${agg.plannedDate})`;
}

export interface PilesFilterParams {
  siteId: string;
  /** Substring match against pileIdCode, case-insensitive. Empty/undefined = no filter. */
  search?: string;
  /** Multi-select Area filter — pilingLocations.id[] (pilingPiles.area is a separate free-text column). Empty/undefined = no filter. */
  locationIds?: string[];
  /** Multi-select status filter. Empty/undefined = no filter. */
  statuses?: PileStatus[];
  excludeIds?: string[];
}

function buildFilterConditions(
  { siteId, search, locationIds, excludeIds = [] }: PilesFilterParams,
  agg: PileStatusAgg,
  statuses?: PileStatus[],
) {
  const q = search?.trim();
  const conditions = [eq(pilingPiles.siteId, siteId)];
  if (q) conditions.push(like(pilingPiles.pileIdCode, `%${q}%`));
  if (locationIds && locationIds.length > 0) conditions.push(inArray(pilingPiles.locationId, locationIds));
  if (excludeIds.length > 0) conditions.push(notInArray(pilingPiles.id, excludeIds));
  if (statuses && statuses.length > 0) {
    conditions.push(sql`${statusExpr(agg)} in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`);
  }
  return and(...conditions);
}

export interface PilesFilteredPageParams extends PilesFilterParams {
  /** 1-based page number. */
  page: number;
  pageSize: number;
}

export interface PileWithStatus extends PileWithDimension {
  status: PileStatus;
  /** 'YYYY-MM-DD', or null if the pile has never appeared on any checklist. */
  statusDate: string | null;
}

export interface PilesFilteredPageResult {
  items: PileWithStatus[];
  total: number;
}

/**
 * Paginated + filtered pile list for the Piles list screen — extends
 * getPilesBySiteWithDimensionsPage with multi-select area and status
 * filters, sorted by pileIdCode. Filtering, sorting, limiting, and counting
 * all happen in SQL.
 */
export async function getPilesBySiteFiltered({
  siteId,
  search,
  locationIds,
  statuses,
  excludeIds = [],
  page,
  pageSize,
}: PilesFilteredPageParams): Promise<PilesFilteredPageResult> {
  const database = await initDb();
  const agg = pileStatusAggSubquery(database, siteId);
  const where = buildFilterConditions({ siteId, search, locationIds, excludeIds }, agg, statuses);

  // The status_agg leftJoin is added to BOTH queries below — if these ever
  // drift apart, `total` will silently disagree with `items`.
  const [items, countRows] = await Promise.all([
    database
      .select({ ...pileWithDimensionColumns, status: statusExpr(agg), statusDate: statusDateExpr(agg) })
      .from(pilingPiles)
      .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
      .leftJoin(agg, eq(pilingPiles.id, agg.pileId))
      .where(where)
      .orderBy(asc(pilingPiles.pileIdCode), pilingPiles.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database
      .select({ total: sql<number>`count(*)` })
      .from(pilingPiles)
      .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
      .leftJoin(agg, eq(pilingPiles.id, agg.pileId))
      .where(where),
  ]);

  return { items, total: countRows[0]?.total ?? 0 };
}

export interface PileStatusStats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

/**
 * Site-wide status counts for the Piles list screen's stat tiles. Respects
 * search/area filters but deliberately ignores any status filter — toggling
 * one status checkbox shouldn't zero out the other three tiles, matching
 * getPileCountsByLocationForSite's facet-count precedent.
 */
export async function getPileStatusStatsForSite(
  params: Omit<PilesFilterParams, 'statuses'>,
): Promise<PileStatusStats> {
  const database = await initDb();
  const agg = pileStatusAggSubquery(database, params.siteId);
  const where = buildFilterConditions(params, agg, undefined);

  const rows = await database
    .select({ status: statusExpr(agg), count: sql<number>`count(*)` })
    .from(pilingPiles)
    .innerJoin(pilingDimensions, eq(pilingPiles.dimensionId, pilingDimensions.id))
    .leftJoin(agg, eq(pilingPiles.id, agg.pileId))
    .where(where)
    .groupBy(statusExpr(agg));

  const stats: PileStatusStats = { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status === 'COMPLETED') stats.completed = row.count;
    else if (row.status === 'IN_PROGRESS') stats.inProgress = row.count;
    else stats.notStarted = row.count;
  }
  return stats;
}
