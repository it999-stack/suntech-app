// src/repositories/targetPeriodRepository.ts
// Local SQLite cache of pil_site_target_periods (DAILY/WEEKLY/MONTHLY rows
// only — OVERALL stays covered by siteRepository.ts's flattened counters).
// Lets the app look up the target for a specific calendar date instead of
// only "the current one".

import { and, eq, gte, lte } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilSiteTargetPeriods,
  type NewPilSiteTargetPeriod,
  type PilSiteTargetPeriod,
  type TargetPeriodType,
} from '@db/schema';

/**
 * The DAILY/WEEKLY/MONTHLY row covering `date` ("YYYY-MM-DD") for a site —
 * for DAILY this is an exact match (period_start === period_end === date),
 * for WEEKLY/MONTHLY it's whichever row's range contains the date. Returns
 * undefined if nothing has synced for that window yet.
 */
export async function getTargetPeriodByDate(
  siteId: string,
  periodType: TargetPeriodType,
  date: string,
): Promise<PilSiteTargetPeriod | undefined> {
  const db = await initDb();
  const rows = await db
    .select()
    .from(pilSiteTargetPeriods)
    .where(
      and(
        eq(pilSiteTargetPeriods.siteId, siteId),
        eq(pilSiteTargetPeriods.periodType, periodType),
        lte(pilSiteTargetPeriods.periodStart, date),
        gte(pilSiteTargetPeriods.periodEnd, date),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Shared by both sync entry points (bootstrap history + delta pull) — same
 *  raw shape (SyncTargetPeriodOut) comes back from both endpoints. */
export function mapRawTargetPeriod(
  raw: {
    id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    target_piles: number | null;
    completed_piles: number;
  },
  siteId: string,
  syncedAt: number,
): NewPilSiteTargetPeriod {
  return {
    id: raw.id,
    siteId,
    periodType: raw.period_type as TargetPeriodType,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    targetPiles: raw.target_piles ?? null,
    completedPiles: raw.completed_piles ?? 0,
    syncedAt,
  };
}

/**
 * Upserts a batch of target-period rows from the server. Pure upsert, no
 * deletes: unlike most synced entities, pil_site_target_periods rows are
 * never removed server-side — a period "rolls over" by the server adding a
 * new row, never touching the old one.
 */
export async function saveTargetPeriods(periods: NewPilSiteTargetPeriod[]): Promise<void> {
  if (periods.length === 0) return;

  const db = await initDb();
  for (const period of periods) {
    await db
      .insert(pilSiteTargetPeriods)
      .values(period)
      .onConflictDoUpdate({
        target: pilSiteTargetPeriods.id,
        set: {
          siteId: period.siteId,
          periodType: period.periodType,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          targetPiles: period.targetPiles,
          completedPiles: period.completedPiles,
          syncedAt: period.syncedAt,
        },
      });
  }
}
