// src/repositories/contractorsRepository.ts
// CRUD helpers for pil_contractors in local SQLite — the site-scoped
// contractor master list backing the "Name of Pile Contractor" / "Name of
// Cage Contractor" dropdown fields (see pileMeasurementTriggers.ts). Mirrors
// machinesRepository.ts exactly.

import { eq, inArray, sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilContractors,
  type NewPilContractor,
  type PilContractor,
} from '@db/schema';

/**
 * Upsert a batch of contractors (replace on conflict by primary key).
 * Called by SyncContractorsStep after fetching from the server, and by the
 * steady-state delta pull (deltaPull.ts).
 */
export async function saveContractors(rows: NewPilContractor[]): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();

  await db
    .insert(pilContractors)
    .values(rows)
    .onConflictDoUpdate({
      target: pilContractors.id,
      set: {
        name: sql`excluded.name`,
        isActive: sql`excluded.is_active`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Returns all locally cached contractors for a given site, ordered by name.
 */
export async function getContractorsBySite(siteId: string): Promise<PilContractor[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilContractors)
    .where(eq(pilContractors.siteId, siteId))
    .orderBy(pilContractors.name)
    .all();
}

/**
 * Hard-delete locally cached contractors the server has soft-deleted.
 */
export async function deleteContractorsByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilContractors).where(inArray(pilContractors.id, ids));
}
