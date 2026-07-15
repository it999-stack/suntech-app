// src/repositories/shiftsRepository.ts
// Local SQLite access for piling_shift_types and piling_non_working_windows.

import { eq, sql } from 'drizzle-orm';
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

// ─── Non-Working Windows ──────────────────────────────────────────────────────

/**
 * Replaces all cached non-working windows with the latest server copy.
 */
export async function saveNonWorkingWindows(
  rows: NewPilingNonWorkingWindow[],
): Promise<void> {
  const db = await initDb();
  await db.delete(pilingNonWorkingWindows);

  if (!rows.length) return;

  await db.insert(pilingNonWorkingWindows).values(rows);
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