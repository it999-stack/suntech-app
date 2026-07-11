// src/repositories/shiftsRepository.ts
// CRUD helpers for piling_shift_types and piling_non_working_windows in local SQLite.

import { eq, and, sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingShiftTypes,
  pilingNonWorkingWindows,
  type NewPilingShiftType,
  type NewPilingNonWorkingWindow,
  type PilingShiftType,
  type PilingNonWorkingWindow,
  type NonWorkingWindowBehavior,
} from '@db/schema';

// ─── Shift Types ──────────────────────────────────────────────────────────────

/**
 * Upsert a batch of shift types (replace on conflict by primary key).
 * Called by SyncShiftsStep after fetching from the server.
 */
export async function saveShiftTypes(rows: NewPilingShiftType[]): Promise<void> {
  if (!rows.length) return;
  const db = await initDb();
  await db
    .insert(pilingShiftTypes)
    .values(rows)
    .onConflictDoUpdate({
      target: pilingShiftTypes.id,
      set: {
        name: sql`excluded.name`,
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Upsert a single shift type. Used by SiteSettingsContext write-through mutations.
 */
export async function upsertShiftType(row: NewPilingShiftType): Promise<void> {
  const db = await initDb();
  await db
    .insert(pilingShiftTypes)
    .values(row)
    .onConflictDoUpdate({
      target: pilingShiftTypes.id,
      set: {
        name: sql`excluded.name`,
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Delete a single shift type and all its non-working windows from SQLite.
 */
export async function deleteShiftType(id: string): Promise<void> {
  const db = await initDb();
  await db.delete(pilingNonWorkingWindows).where(eq(pilingNonWorkingWindows.shiftTypeId, id));
  await db.delete(pilingShiftTypes).where(eq(pilingShiftTypes.id, id));
}

/**
 * Returns all locally cached shift types.
 */
export async function getAllShiftTypes(): Promise<PilingShiftType[]> {
  const db = await initDb();
  return db.select().from(pilingShiftTypes).all();
}

// ─── Non-Working Windows ──────────────────────────────────────────────────────

/**
 * Upsert a batch of non-working windows for a site.
 * Deletes existing rows for the site first to handle server-side deletions.
 */
export async function saveNonWorkingWindows(
  siteId: string,
  rows: NewPilingNonWorkingWindow[],
): Promise<void> {
  const db = await initDb();
  // Replace all windows for this site — handles deletes from the server cleanly.
  await db
    .delete(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.siteId, siteId));
  if (rows.length) {
    const normalized: NewPilingNonWorkingWindow[] = rows.map((r) => ({
      ...r,
      behavior: (r.behavior ?? 'FIXED') as NonWorkingWindowBehavior,
    }));
    await db.insert(pilingNonWorkingWindows).values(normalized);
  }
}

/**
 * Returns all non-working windows for a given site.
 */
export async function getNonWorkingWindowsBySite(
  siteId: string,
): Promise<PilingNonWorkingWindow[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.siteId, siteId))
    .all();
}

/**
 * Upsert a single non-working window. Used by SiteSettingsContext write-through.
 */
export async function upsertNonWorkingWindow(row: NewPilingNonWorkingWindow): Promise<void> {
  const db = await initDb();
  await db
    .insert(pilingNonWorkingWindows)
    .values(row)
    .onConflictDoUpdate({
      target: pilingNonWorkingWindows.id,
      set: {
        label: sql`excluded.label`,
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        behavior: sql`excluded.behavior`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Delete a single non-working window by id.
 */
export async function deleteNonWorkingWindow(id: string): Promise<void> {
  const db = await initDb();
  await db.delete(pilingNonWorkingWindows).where(eq(pilingNonWorkingWindows.id, id));
}

/**
 * Returns all non-working windows for a given site + shift type combo.
 */
export async function getNonWorkingWindowsByShift(
  siteId: string,
  shiftTypeId: string,
): Promise<PilingNonWorkingWindow[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingNonWorkingWindows)
    .where(
      and(
        eq(pilingNonWorkingWindows.siteId, siteId),
        eq(pilingNonWorkingWindows.shiftTypeId, shiftTypeId),
      ),
    )
    .all();
}
