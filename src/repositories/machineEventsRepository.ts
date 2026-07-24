// src/repositories/machineEventsRepository.ts
// CRUD helpers for pil_machine_events in local SQLite.

import { and, eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilMachineEvents,
  pilingChecklistPiles,
  type NewPilMachineEvent,
  type PilMachineEvent,
} from '@db/schema';

export async function insertMachineEvent(
  entry: Omit<NewPilMachineEvent, 'createdAt'>,
): Promise<void> {
  const db = await initDb();
  await db.insert(pilMachineEvents).values({ ...entry, createdAt: Date.now() });
}

/**
 * History log for a single checklist-pile — resolves its physical pileId
 * first, since pil_machine_events is keyed by (checklistId, pileId), not
 * checklistPileId.
 */
export async function getMachineEventsForChecklistPile(
  checklistPileId: string,
): Promise<PilMachineEvent[]> {
  const db = await initDb();
  const cp = await db
    .select({ checklistId: pilingChecklistPiles.checklistId, pileId: pilingChecklistPiles.pileId })
    .from(pilingChecklistPiles)
    .where(eq(pilingChecklistPiles.id, checklistPileId))
    .get();
  if (!cp) return [];

  const rows = await db
    .select()
    .from(pilMachineEvents)
    .where(
      and(eq(pilMachineEvents.checklistId, cp.checklistId), eq(pilMachineEvents.pileId, cp.pileId)),
    )
    .all();

  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** All machine events for an entire checklist — used by the sync push path. */
export async function getMachineEventsForChecklist(checklistId: string): Promise<PilMachineEvent[]> {
  const db = await initDb();
  return db.select().from(pilMachineEvents).where(eq(pilMachineEvents.checklistId, checklistId)).all();
}
