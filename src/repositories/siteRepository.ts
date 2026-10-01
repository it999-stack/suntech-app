// src/repositories/siteRepository.ts
// Local cache of the site's pile target / completed counters (pil_sites).

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilSites, type NewPilSite, type PilSite } from '@db/schema';

/** Returns the cached counters for a site, or null before the first pull. */
export async function getSiteTargets(siteId: string): Promise<PilSite | null> {
  const db = await initDb();
  const rows = await db.select().from(pilSites).where(eq(pilSites.id, siteId)).limit(1);
  return rows[0] ?? null;
}

/** Upserts the site's counters — the server's values always win. */
export async function saveSiteTargets(row: NewPilSite): Promise<void> {
  const db = await initDb();
  await db
    .insert(pilSites)
    .values(row)
    .onConflictDoUpdate({
      target: pilSites.id,
      set: { siteConfig: row.siteConfig },
    });
}
