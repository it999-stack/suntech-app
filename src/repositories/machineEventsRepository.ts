// src/repositories/machineEventsRepository.ts
// CRUD helpers for pil_machine_events in local SQLite.

import { and, desc, eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import { apiClient } from '@services/apiClient';
import { generateId } from '@utils/helpers';
import { setMachineStatusLocal } from '@repositories/machinesRepository';
import type { LogMachineEventInput } from '@state/PlanContext';
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
 * Every locally-cached event for one machine, regardless of checklist/pile —
 * unlike getMachineEventsForChecklistPile (scoped to a single pile's day),
 * this is what MachineReportModal needs to find an open BREAKDOWN session
 * (findOpenSession) for a machine reported on outside of any pile's work.
 */
export async function getMachineEventsForMachine(machineId: string): Promise<PilMachineEvent[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilMachineEvents)
    .where(eq(pilMachineEvents.machineId, machineId))
    .orderBy(desc(pilMachineEvents.createdAt))
    .all();
}

/**
 * Records a fleet-level BREAKDOWN/RESUMED report from the Machines screen —
 * not tied to any pile/step (checklistId/pileId both null), unlike
 * PlanContext.logMachineEvent. Online-required, direct apiClient call (same
 * pattern as updateMachineStatus): the server is the source of truth for
 * the created event's id-based idempotency, so this posts first and only
 * mirrors locally (event row + machine status) once that succeeds.
 */
export async function reportMachineEvent(machineId: string, input: LogMachineEventInput): Promise<void> {
  const id = generateId();
  await apiClient.post(`/piling/machines/${machineId}/events`, {
    id,
    track: input.track,
    event_type: input.eventType,
    notes: input.notes,
    occurred_at: input.occurredAt,
  });

  await insertMachineEvent({
    id,
    checklistId: null,
    pileId: null,
    stepId: null,
    track: input.track,
    eventType: input.eventType,
    machineId,
    replacementId: null,
    notes: input.notes,
    occurredAt: input.occurredAt,
  });

  if (input.eventType === 'BREAKDOWN') {
    await setMachineStatusLocal(machineId, 'BREAKDOWN');
  } else if (input.eventType === 'RESUMED') {
    await setMachineStatusLocal(machineId, 'ACTIVE');
  }
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
