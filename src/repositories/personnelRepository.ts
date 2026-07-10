// src/repositories/personnelRepository.ts
// CRUD helpers for piling_personnel in local SQLite.

import { eq } from 'drizzle-orm';
import { initDb } from '../db/client';
import {
  pilingPersonnel,
  type NewPilingPersonnel,
  type PilingPersonnel,
} from '../db/schema';

/**
 * Upsert a batch of personnel (replace on conflict by primary key).
 * Called by SyncPersonnelStep after fetching from the server.
 */
export async function savePersonnel(rows: NewPilingPersonnel[]): Promise<void> {
  if (!rows.length) return;
  const db = await initDb();
  await db
    .insert(pilingPersonnel)
    .values(rows)
    .onConflictDoUpdate({
      target: pilingPersonnel.id,
      set: {
        name: pilingPersonnel.name,
        designation: pilingPersonnel.designation,
        phone: pilingPersonnel.phone,
        email: pilingPersonnel.email,
        employeeCode: pilingPersonnel.employeeCode,
        isActive: pilingPersonnel.isActive,
        syncedAt: pilingPersonnel.syncedAt,
      },
    });
}

/**
 * Returns all locally cached personnel for a given site, ordered by name.
 */
export async function getPersonnelBySite(siteId: string): Promise<PilingPersonnel[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingPersonnel)
    .where(eq(pilingPersonnel.siteId, siteId))
    .orderBy(pilingPersonnel.name)
    .all();
}
