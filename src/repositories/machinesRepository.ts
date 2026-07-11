// src/repositories/machinesRepository.ts
// CRUD helpers for piling_machines in local SQLite.

import { eq, and } from 'drizzle-orm';
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
export async function saveMachines(rows: NewPilingMachine[]): Promise<void> {
  if (!rows.length) return;
  const db = await initDb();
  await db
    .insert(pilingMachines)
    .values(rows)
    .onConflictDoUpdate({
      target: pilingMachines.id,
      set: {
        machineNo: pilingMachines.machineNo,
        type: pilingMachines.type,
        status: pilingMachines.status,
        syncedAt: pilingMachines.syncedAt,
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
 * Returns machines for a site filtered by type ("RIG" or "CRANE").
 */
export async function getMachinesByType(
  siteId: string,
  type: 'RIG' | 'CRANE',
): Promise<PilingMachine[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingMachines)
    .where(and(eq(pilingMachines.siteId, siteId), eq(pilingMachines.type, type)))
    .all();
}
