// src/repositories/shiftsRepository.ts
// Local SQLite access for piling_shift_types and piling_non_working_windows.

import { eq, inArray, sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingShiftTypes,
  pilingNonWorkingWindows,
  type NewPilingShiftType,
  type NewPilingNonWorkingWindow,
  type PilingShiftType,
  type PilingNonWorkingWindow,
} from '@db/schema';

// ─── Shift Types ──────────────────────────────────────────────────────────────

/**
 * Replace/update shift types from the latest server sync.
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
        siteId: sql`excluded.site_id`,
        name: sql`excluded.name`,
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Returns all locally cached shift types.
 */
export async function getAllShiftTypes(): Promise<PilingShiftType[]> {
  const db = await initDb();
  return db.select().from(pilingShiftTypes).all();
}

/**
 * Hard-delete locally cached shift types the server has soft-deleted.
 * Currently a no-op in practice — no delete endpoint exists server-side yet
 * — but wired for when one does (Phase 3 delta-sync groundwork).
 */
export async function deleteShiftTypesByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingShiftTypes).where(inArray(pilingShiftTypes.id, ids));
}

// ─── Non-Working Windows ──────────────────────────────────────────────────────

/**
 * Upsert non-working windows by id. Was previously a delete-all-then-insert
 * — harmless for bootstrap (table starts empty) but would silently wipe
 * every window not included in a given delta-sync batch, so this must be
 * upsert-by-id to be safe for both callers.
 */
export async function saveNonWorkingWindows(
  rows: NewPilingNonWorkingWindow[],
): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();
  for (const window of rows) {
    await db
      .insert(pilingNonWorkingWindows)
      .values(window)
      .onConflictDoUpdate({
        target: pilingNonWorkingWindows.id,
        set: {
          shiftTypeId: window.shiftTypeId,
          label: window.label,
          startTime: window.startTime,
          endTime: window.endTime,
          behavior: window.behavior,
          syncedAt: window.syncedAt,
          updatedAt: window.updatedAt,
        },
      });
  }
}

/**
 * Hard-delete locally cached non-working windows the server has soft-deleted.
 * Currently a no-op in practice — no delete endpoint exists server-side yet
 * — but wired for when one does (Phase 3 delta-sync groundwork).
 */
export async function deleteNonWorkingWindowsByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingNonWorkingWindows).where(inArray(pilingNonWorkingWindows.id, ids));
}

/**
 * Returns all windows belonging to a shift.
 */
export async function getNonWorkingWindowsByShift(
  shiftTypeId: string,
): Promise<PilingNonWorkingWindow[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.shiftTypeId, shiftTypeId))
    .all();
}

// ─── Combined Query ───────────────────────────────────────────────────────────

/**
 * Shift with its non-working windows embedded.
 */
export type ShiftWithWindows = PilingShiftType & {
  windows: PilingNonWorkingWindow[];
};

/**
 * Returns all shifts for a site with their windows embedded.
 * Used by SiteSettingsContext for read-only display.
 */
export async function getAllShiftsWithWindows(
  siteId: string,
): Promise<ShiftWithWindows[]> {
  const db = await initDb();

  const shifts = await db
    .select()
    .from(pilingShiftTypes)
    .where(eq(pilingShiftTypes.siteId, siteId))
    .all();

  const shiftsWithWindows = await Promise.all(
    shifts.map(async (shift) => ({
      ...shift,
      windows: await getNonWorkingWindowsByShift(shift.id),
    }))
  );

  return shiftsWithWindows;
}