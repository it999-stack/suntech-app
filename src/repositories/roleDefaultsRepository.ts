// src/repositories/roleDefaultsRepository.ts
// CRUD helpers for pil_role_defaults in local SQLite.
//
// The server is the sole writer of this data (see checklist_personnel_service
// .replace_checklist_personnel_and_defaults on the backend) — the app never
// computes a default locally, only reads it once at draft-init time to
// pre-fill a new plan's role pickers. Wholesale delete+insert per sync,
// same "server response is the full authoritative set" semantics as
// hydrateChecklistFromServer, rather than a real onConflictDoUpdate — this
// sidesteps needing to target one of three different partial unique indexes
// on the expo-sqlite dialect.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingSiteRoleDefaults,
  type NewPilingSiteRoleDefault,
  type PilingSiteRoleDefault,
} from '@db/schema';

/**
 * Replace all role defaults for a site with the server's current set.
 */
export async function replaceRoleDefaultsForSite(
  siteId: string,
  rows: NewPilingSiteRoleDefault[],
): Promise<void> {
  const db = await initDb();
  await db.delete(pilingSiteRoleDefaults).where(eq(pilingSiteRoleDefaults.siteId, siteId));
  if (rows.length) {
    await db.insert(pilingSiteRoleDefaults).values(rows);
  }
}

/**
 * Returns all locally cached role defaults for a given site.
 */
export async function getRoleDefaultsBySite(siteId: string): Promise<PilingSiteRoleDefault[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingSiteRoleDefaults)
    .where(eq(pilingSiteRoleDefaults.siteId, siteId))
    .all();
}
