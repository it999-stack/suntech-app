// src/repositories/machinesRepository.ts

import { eq, and, inArray, sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingMachines,
  type NewPilingMachine,
  type PilingMachine,
} from '@db/schema';

/**
 * Upsert a batch of machines (replace on conflict by primary key).
 * Called by SyncMachinesStep after fetching from the server.
 */
export async function saveMachines(
  rows: NewPilingMachine[]
): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();

  await db
    .insert(pilingMachines)
    .values(rows)
    .onConflictDoUpdate({
      target: pilingMachines.id,
      set: {
        machineNo: sql`excluded.machine_no`,
        type: sql`excluded.type`,
        status: sql`excluded.status`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * Returns all locally cached machines for a given site.
 */
export async function getMachinesBySite(siteId: string): Promise<PilingMachine[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingMachines)
    .where(eq(pilingMachines.siteId, siteId))
    .all();
}

/**
 * Optimistic local status flip (e.g. to 'BREAKDOWN' right after logging a
 * machine event) — offline UX only. The server is authoritative; the next
 * syncMachines pull reconciles this on every device, including this one.
 */
export async function setMachineStatusLocal(machineId: string, status: string): Promise<void> {
  const db = await initDb();
  await db.update(pilingMachines).set({ status }).where(eq(pilingMachines.id, machineId));
}

/**
 * Hard-delete locally cached machines the server has soft-deleted.
 */
export async function deleteMachinesByIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await initDb();
  await db.delete(pilingMachines).where(inArray(pilingMachines.id, ids));
}

/**
 * Returns machines for a site filtered by type ("RIG", "CRANE", or "COMPRESSOR").
 */
export async function getMachinesByType(
  siteId: string,
  type: 'RIG' | 'CRANE' | 'COMPRESSOR',
): Promise<PilingMachine[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingMachines)
    .where(and(eq(pilingMachines.siteId, siteId), eq(pilingMachines.type, type)))
    .all();
}
