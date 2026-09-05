// src/repositories/pileMeasurementsRepository.ts
// CRUD helpers for pil_pile_measurements in local SQLite — the fixed set of
// one-time engineering measurements captured per *physical* pile (E.G.L.,
// Pile Contractor, Cage Contractor, Pile Length, Cage Weight, C.T.L., C.O.L.,
// Bore Depth, Hook Length, F.L., Concrete Qty). Keyed by pileId, not
// checklistPileId — a pile only ever has one of each of these regardless of
// how many daily checklists it appears on.

import { eq, inArray, sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilPileMeasurements,
  type NewPilPileMeasurement,
  type PilPileMeasurement,
} from '@db/schema';
import { generateId } from '@utils/helpers';

/** Fields a local edit (or the server) may patch — everything but the row's
 * own identity/bookkeeping columns. */
export type PileMeasurementPatch = Partial<
  Omit<NewPilPileMeasurement, 'id' | 'pileId' | 'createdAt' | 'updatedAt'>
>;

/** Shape of one row as it arrives from the server (delta pull's flat
 * `pile_measurements` array, or bootstrap-history's nested `measurements`) —
 * everything but the row's own local id/timestamps, which this repository
 * generates. */
export type PileMeasurementSyncRow = Omit<NewPilPileMeasurement, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Hard-delete the measurement rows for the given physical piles.
 *
 * Called when a day's plan is deleted — the server soft-deletes those
 * measurements (see soft_delete_checklist) and reports the affected pile ids
 * in the delta pull's `deleted_measurement_pile_ids`. Local rows are removed
 * outright rather than flagged: this table is a cache of server state, exactly
 * like purgeChecklistsByIds treats checklists.
 *
 * Keyed by pileId, not by the server's measurement id — saveMeasurementsBatch
 * mints its own local ids and upserts on pileId, so a server id would not
 * match anything here.
 */
export async function deletePileMeasurementsByPileIds(pileIds: string[]): Promise<void> {
  if (!pileIds.length) return;
  const db = await initDb();
  await db.delete(pilPileMeasurements).where(inArray(pilPileMeasurements.pileId, pileIds));
}

/**
 * Get one physical pile's measurements row, or undefined if nothing has been
 * recorded for it yet.
 */
export async function getPileMeasurements(pileId: string): Promise<PilPileMeasurement | undefined> {
  const db = await initDb();
  const rows = await db
    .select()
    .from(pilPileMeasurements)
    .where(eq(pilPileMeasurements.pileId, pileId))
    .limit(1);
  return rows[0];
}

/**
 * Get measurements for a batch of physical piles, keyed by pileId — used to
 * attach `measurements` onto each PileGroup (see usePileGroups.ts) and to
 * build the push payload's per-checklist `pile_measurements` array (see
 * syncRepository.ts). Piles with nothing recorded yet simply have no entry.
 */
export async function getPileMeasurementsByPileIds(
  pileIds: string[],
): Promise<Map<string, PilPileMeasurement>> {
  if (!pileIds.length) return new Map();
  const db = await initDb();
  const rows = await db
    .select()
    .from(pilPileMeasurements)
    .where(inArray(pilPileMeasurements.pileId, pileIds))
    .all();
  return new Map(rows.map((r) => [r.pileId, r]));
}

/**
 * Upsert a partial patch of measurement fields for one physical pile — merges
 * onto whatever's already recorded, never clearing an untouched field. Same
 * low-friction, field-at-a-time pattern as setRemarks/upsertActualStep in
 * planRepository.ts. Select-then-branch rather than an ON CONFLICT upsert —
 * see upsertActualStep's comment in planRepository.ts for why a composite
 * target isn't the concern here, but the pattern is kept consistent anyway.
 */
export async function upsertPileMeasurements(pileId: string, patch: PileMeasurementPatch): Promise<void> {
  const db = await initDb();
  const now = Date.now();

  const existing = await db
    .select({ id: pilPileMeasurements.id })
    .from(pilPileMeasurements)
    .where(eq(pilPileMeasurements.pileId, pileId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pilPileMeasurements)
      .set({ ...patch, updatedAt: now })
      .where(eq(pilPileMeasurements.pileId, pileId));
  } else {
    await db.insert(pilPileMeasurements).values({
      id: generateId(),
      pileId,
      ...patch,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Batch upsert from server data (delta pull's `pile_measurements` array, or
 * bootstrap-history's nested per-pile `measurements`, via
 * hydrateChecklistFromServer) — wholesale replace of every named field for
 * each row, since the server always sends its full current state for a pile,
 * never a partial delta. No delete path: pile measurements are never
 * independently hard-deleted (see the server contract).
 */
export async function saveMeasurementsBatch(rows: PileMeasurementSyncRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await initDb();
  const now = Date.now();

  await db
    .insert(pilPileMeasurements)
    .values(rows.map((r) => ({ ...r, id: generateId(), createdAt: now, updatedAt: now })))
    .onConflictDoUpdate({
      target: pilPileMeasurements.pileId,
      set: {
        eglM: sql`excluded.egl_m`,
        pileContractorId: sql`excluded.pile_contractor_id`,
        cageContractorId: sql`excluded.cage_contractor_id`,
        pileLengthM: sql`excluded.pile_length_m`,
        cageWeightKg: sql`excluded.cage_weight_kg`,
        ctlM: sql`excluded.ctl_m`,
        colM: sql`excluded.col_m`,
        boreDepthM: sql`excluded.bore_depth_m`,
        hookLengthM: sql`excluded.hook_length_m`,
        flM: sql`excluded.fl_m`,
        plannedQtyM3: sql`excluded.planned_qty_m3`,
        actualQtyM3: sql`excluded.actual_qty_m3`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
