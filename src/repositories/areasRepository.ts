// src/repositories/areasRepository.ts
// Local CRUD helpers for site work areas.

import { and, asc, eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilingAreas, type NewPilingArea, type PilingArea } from '@db/schema';

/** Return active areas for a site in configured display order. */
export async function getAreasBySite(siteId: string): Promise<PilingArea[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingAreas)
    .where(and(eq(pilingAreas.siteId, siteId), eq(pilingAreas.isActive, true)))
    .orderBy(asc(pilingAreas.sortOrder), asc(pilingAreas.name));
}

/**
 * Insert or update all synced site areas.
 */
export async function saveAreas(
  rows: NewPilingArea[],
): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();

  for (const area of rows) {
    await db
      .insert(pilingAreas)
      .values(area)
      .onConflictDoUpdate({
        target: pilingAreas.id,
        set: {
          siteId: area.siteId,
          name: area.name,
          code: area.code ?? null,
          sortOrder: area.sortOrder ?? 0,
          isActive: area.isActive ?? true,
          updatedAt: area.updatedAt,
        },
      });
  }
}

/** Soft-delete an area so historic pile assignments remain intact. */
export async function deactivateArea(areaId: string): Promise<void> {
  const db = await initDb();
  await db
    .update(pilingAreas)
    .set({ isActive: false, updatedAt: Date.now() })
    .where(eq(pilingAreas.id, areaId));
}
