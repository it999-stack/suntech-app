// src/repositories/syncRepository.ts
// Repository for fetching all checklist data to sync up to the server.

import { and, eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingDailyChecklists,
  pilingChecklistPiles,
  pilingChecklistPersonnel,
  pilePlanSteps,
  pileActualSteps,
  pilMachineEvents,
  type PilingChecklistPile,
  type PilingChecklistPersonnel,
  type PilePlanStep,
  type PileActualStep,
  type PilMachineEvent,
} from '@db/schema';
import type { SyncChecklist, SyncedVersion } from '@sync/SyncAppPlanPayload';

// ─── Internal helpers ───────────────────────────────────────────────────────────

async function getChecklistPiles(checklistId: string): Promise<PilingChecklistPile[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingChecklistPiles)
    .where(eq(pilingChecklistPiles.checklistId, checklistId))
    .orderBy(pilingChecklistPiles.seqNo)
    .all();
}

async function getChecklistPersonnel(checklistId: string): Promise<PilingChecklistPersonnel[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingChecklistPersonnel)
    .where(eq(pilingChecklistPersonnel.checklistId, checklistId))
    .all();
}

async function getPlanSteps(checklistPileIds: string[]): Promise<PilePlanStep[]> {
  if (!checklistPileIds.length) return [];
  const db = await initDb();
  const results: PilePlanStep[] = [];
  for (const cpId of checklistPileIds) {
    const rows = await db
      .select()
      .from(pilePlanSteps)
      .where(eq(pilePlanSteps.checklistPileId, cpId))
      .all();
    results.push(...rows);
  }
  return results;
}

async function getActualSteps(checklistPileIds: string[]): Promise<PileActualStep[]> {
  if (!checklistPileIds.length) return [];
  const db = await initDb();
  const results: PileActualStep[] = [];
  for (const cpId of checklistPileIds) {
    const rows = await db
      .select()
      .from(pileActualSteps)
      .where(eq(pileActualSteps.checklistPileId, cpId))
      .all();
    results.push(...rows);
  }
  return results;
}

async function getMachineEvents(checklistId: string): Promise<PilMachineEvent[]> {
  const db = await initDb();
  return db.select().from(pilMachineEvents).where(eq(pilMachineEvents.checklistId, checklistId)).all();
}

// ─── Public API ───────────────────────────────────────────────────────────────────

/**
 * Get the given checklists (with complete nested data) for pushing to the
 * server. Only reads the checklists named in `checklistIds` — the caller
 * (SyncManager) decides which ones are dirty, so a batch push never re-sends
 * checklists that haven't changed.
 */
export async function getChecklistsForSync(
  siteId: string,
  checklistIds: string[],
): Promise<SyncChecklist[]> {
  if (!checklistIds.length) return [];
  const db = await initDb();

  const checklists = await db
    .select()
    .from(pilingDailyChecklists)
    .where(
      and(
        eq(pilingDailyChecklists.siteId, siteId),
        inArray(pilingDailyChecklists.id, checklistIds),
      ),
    )
    .orderBy(pilingDailyChecklists.date)
    .all();

  const result: SyncChecklist[] = [];

  for (const cl of checklists) {
    const cpIds = (await getChecklistPiles(cl.id)).map((cp) => cp.id);
    
    // Get all related data
    const [piles, personnel, planSteps, actualSteps, machineEvents] = await Promise.all([
      getChecklistPiles(cl.id),
      getChecklistPersonnel(cl.id),
      getPlanSteps(cpIds),
      getActualSteps(cpIds),
      getMachineEvents(cl.id),
    ]);

    // Convert to sync format
    const syncChecklist: SyncChecklist = {
      id: cl.id,
      date: cl.date,
      shift_type_id: cl.shiftTypeId ?? undefined,
      plan_start_time: cl.planStartTime ?? undefined,
      plan_end_time: cl.planEndTime ?? undefined,
      notes: cl.notes ?? undefined,
      status: cl.status,
      // Rows without a role (shouldn't exist post-hydrate, but the local
      // column stays nullable since SQLite can't add NOT NULL retroactively)
      // are dropped rather than sent — the server's role column is NOT NULL.
      personnel: personnel
        .filter((p): p is typeof p & { role: string } => !!p.role)
        .map((p) => ({
          id: p.id,
          personnel_id: p.personnelId,
          role: p.role,
          machine_id: p.machineId,
          shift_slot: p.shiftSlot,
        })),
      piles: piles.map((cp) => ({
        id: cp.id,
        pile_id: cp.pileId,
        seq_no: cp.seqNo,
        rig_id: cp.rigId,
        crane_id: cp.craneId,
        status: cp.status,
        // Verbatim passthrough of the server's own last-known updated_at —
        // never the device's edit clock (cp.updatedAt), which drifts against
        // the server's clock and causes false optimistic-concurrency conflicts.
        updated_at: cp.serverUpdatedAt ?? undefined,
      })),
      plan_steps: planSteps.map((ps) => ({
        id: ps.id,
        checklist_pile_id: ps.checklistPileId,
        step_id: ps.stepId,
        planned_start: ps.plannedStart,
        planned_end: ps.plannedEnd,
        duration_minutes: ps.durationMinutes ?? undefined,
        buffer_minutes: ps.bufferMinutes ?? undefined,
        assigned_machine_id: ps.assignedMachineId ?? undefined,
      })),
      actual_steps: actualSteps.map((as) => ({
        id: as.id,
        checklist_pile_id: as.checklistPileId,
        step_id: as.stepId,
        actual_start: as.actualStart ?? undefined,
        actual_end: as.actualEnd ?? undefined,
        remarks: as.remarks ?? undefined,
        // Verbatim passthrough of the server's own last-known updated_at —
        // never the device's edit clock (as.updatedAt), which drifts against
        // the server's clock and causes false optimistic-concurrency conflicts.
        updated_at: as.serverUpdatedAt ?? undefined,
      })),
      machine_events: machineEvents.map((e) => ({
        id: e.id,
        pile_id: e.pileId,
        step_id: e.stepId ?? undefined,
        track: e.track,
        event_type: e.eventType,
        machine_id: e.machineId ?? undefined,
        replacement_id: e.replacementId ?? undefined,
        notes: e.notes ?? undefined,
        occurred_at: e.occurredAt,
      })),
    };

    result.push(syncChecklist);
  }

  return result;
}

/**
 * Applies the `synced_versions` a push response echoes back — advances the
 * local optimistic-concurrency cache (serverUpdatedAt) for rows the server
 * just wrote, keyed by the id this client submitted them under. Lets the
 * client learn its own write's new version immediately instead of waiting
 * on the next pull, closing the window where a client's own rapid
 * back-to-back edits (e.g. clear an actual time, then set a new one) could
 * otherwise be rejected as a false self-conflict against a stale local cache.
 */
export async function applySyncedVersions(versions: SyncedVersion[]): Promise<void> {
  if (!versions.length) return;
  const db = await initDb();
  for (const v of versions) {
    if (v.entity === 'actual_step') {
      await db
        .update(pileActualSteps)
        .set({ serverUpdatedAt: v.updated_at })
        .where(eq(pileActualSteps.id, v.id));
    } else if (v.entity === 'checklist_pile') {
      await db
        .update(pilingChecklistPiles)
        .set({ serverUpdatedAt: v.updated_at })
        .where(eq(pilingChecklistPiles.id, v.id));
    }
  }
}