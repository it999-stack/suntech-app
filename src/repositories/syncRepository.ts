// src/repositories/syncRepository.ts
// Repository for fetching all checklist data to sync up to the server.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingDailyChecklists,
  pilingChecklistPiles,
  pilingChecklistPersonnel,
  pilePlanSteps,
  pileActualSteps,
  type PilingChecklistPile,
  type PilingChecklistPersonnel,
  type PilePlanStep,
  type PileActualStep,
} from '@db/schema';
import type { SyncChecklist } from '@sync/SyncAppPlanPayload';

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

// ─── Public API ───────────────────────────────────────────────────────────────────

/**
 * Get all checklists for a site with complete data for syncing.
 * Returns checklists that have either plan steps, actual steps, or personnel assigned.
 */
export async function getChecklistsForSync(
  siteId: string,
): Promise<SyncChecklist[]> {
  const db = await initDb();
  
  // Fetch all checklists for this site
  const checklists = await db
    .select()
    .from(pilingDailyChecklists)
    .where(eq(pilingDailyChecklists.siteId, siteId))
    .orderBy(pilingDailyChecklists.date)
    .all();

  const result: SyncChecklist[] = [];

  for (const cl of checklists) {
    const cpIds = (await getChecklistPiles(cl.id)).map((cp) => cp.id);
    
    // Get all related data
    const [piles, personnel, planSteps, actualSteps] = await Promise.all([
      getChecklistPiles(cl.id),
      getChecklistPersonnel(cl.id),
      getPlanSteps(cpIds),
      getActualSteps(cpIds),
    ]);

    // Convert to sync format
    const syncChecklist: SyncChecklist = {
      id: cl.id,
      date: cl.date,
      shift_type_id: cl.shiftTypeId ?? undefined,
      plan_start_time: cl.planStartTime ?? undefined,
      plan_end_time: cl.planEndTime ?? undefined,
      supervisor_id: cl.supervisorId ?? undefined,
      supervisor_id_2: cl.supervisorId2 ?? undefined,
      notes: cl.notes ?? undefined,
      status: cl.status,
      personnel_ids: personnel.map((p) => p.personnelId),
      piles: piles.map((cp) => ({
        id: cp.id,
        pile_id: cp.pileId,
        seq_no: cp.seqNo,
        rig_id: cp.rigId,
        crane_id: cp.craneId,
        status: cp.status,
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
      })),
    };

    result.push(syncChecklist);
  }

  return result;
}