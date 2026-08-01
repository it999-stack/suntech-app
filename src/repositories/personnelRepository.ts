// src/repositories/personnelRepository.ts
// CRUD helpers for piling_site_personnel in local SQLite.

import { eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingSitePersonnel,
  type NewPilingSitePersonnel,
  type PilingSitePersonnel,
} from '@db/schema';

/**
 * Upsert a batch of personnel (replace on conflict by primary key).
 * Called by SyncPersonnelStep after fetching from the server.
 */
export async function savePersonnel(rows: NewPilingSitePersonnel[]): Promise<void> {
  if (!rows.length) return;
  const db = await initDb();
  await db
    .insert(pilingSitePersonnel)
    .values(rows)
    .onConflictDoUpdate({
      target: pilingSitePersonnel.id,
      set: {
        name: pilingSitePersonnel.name,
        designation: pilingSitePersonnel.designation,
        phone: pilingSitePersonnel.phone,
        email: pilingSitePersonnel.email,
        employeeCode: pilingSitePersonnel.employeeCode,
        isActive: pilingSitePersonnel.isActive,
        syncedAt: pilingSitePersonnel.syncedAt,
      },
    });
}

/**
 * Returns all locally cached personnel for a given site, ordered by name.
 */
export async function getPersonnelBySite(siteId: string): Promise<PilingSitePersonnel[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingSitePersonnel)
    .where(eq(pilingSitePersonnel.siteId, siteId))
    .orderBy(pilingSitePersonnel.name)
    .all();
}

/**
 * Hard-delete locally cached personnel the server has soft-deleted.
 */
export async function deletePersonnelByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingSitePersonnel).where(inArray(pilingSitePersonnel.id, ids));
}

/**
 * Returns personnel with the given ids.
 */
export async function getPersonnelByIds(ids: string[]): Promise<PilingSitePersonnel[]> {
  if (ids.length === 0) return [];
  const db = await initDb();
  // Build OR conditions for each id
  const { or } = await import('drizzle-orm');
  const conditions = ids.map((id) => eq(pilingSitePersonnel.id, id));
  return db
    .select()
    .from(pilingSitePersonnel)
    .where(or(...conditions))
    .all();
}
