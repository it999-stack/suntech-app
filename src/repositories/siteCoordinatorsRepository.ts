// src/repositories/siteCoordinatorsRepository.ts
// CRUD helpers for pil_site_coordinators in local SQLite.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilSiteCoordinators, type NewPilSiteCoordinator, type PilSiteCoordinator } from '@db/schema';

/**
 * Replaces every locally cached coordinator for a site with the given rows —
 * the server always sends the site's full current list (not a delta), since
 * it's a small, derived join with no reliable per-row change signal to diff
 * against. A delete-then-insert here (rather than upsert-by-id) is what
 * actually drops a coordinator locally once they're reassigned/deactivated
 * server-side — an upsert alone would leave that stale row behind forever.
 * Called by both SyncSiteCoordinatorsStep (bootstrap) and deltaPull.
 */
export async function replaceSiteCoordinators(siteId: string, rows: NewPilSiteCoordinator[]): Promise<void> {
  const db = await initDb();
  await db.delete(pilSiteCoordinators).where(eq(pilSiteCoordinators.siteId, siteId));
  if (rows.length) {
    await db.insert(pilSiteCoordinators).values(rows);
  }
}

/**
 * Returns all locally cached site coordinators for a given site, ordered by name.
 */
export async function getSiteCoordinatorsBySite(siteId: string): Promise<PilSiteCoordinator[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilSiteCoordinators)
    .where(eq(pilSiteCoordinators.siteId, siteId))
    .orderBy(pilSiteCoordinators.name)
    .all();
}
