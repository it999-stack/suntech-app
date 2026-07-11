// src/repositories/planRepository.ts
// CRUD helpers for pile_plan_steps and pile_actual_steps in local SQLite.

import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilePlanSteps,
  pileActualSteps,
  pilingChecklistPiles,
  pilingSteps,
  pilingMachines,
  type PilePlanStep,
  type NewPilePlanStep,
  type PileActualStep,
  type NewPileActualStep,
} from '@db/schema';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Fetch all checklist-pile ids for a checklist (shared by multiple queries). */
async function getChecklistPileIds(checklistId: string): Promise<string[]> {
  const db = await initDb();
  const rows = await db
    .select({ id: pilingChecklistPiles.id })
    .from(pilingChecklistPiles)
    .where(eq(pilingChecklistPiles.checklistId, checklistId))
    .all();
  return rows.map((r) => r.id);
}

// ─── Plan Steps ───────────────────────────────────────────────────────────────

/**
 * Insert a batch of plan steps.
 * Uses INSERT OR REPLACE to handle regeneration cleanly.
 */
export async function insertPlanSteps(steps: NewPilePlanStep[]): Promise<void> {
  if (!steps.length) return;
  const db = await initDb();
  for (const step of steps) {
    await db
      .insert(pilePlanSteps)
      .values(step)
      .onConflictDoUpdate({
        target: [pilePlanSteps.checklistPileId, pilePlanSteps.stepId],
        set: {
          plannedStart: step.plannedStart,
          plannedEnd: step.plannedEnd,
          durationMinutes: step.durationMinutes ?? null,
          bufferMinutes: step.bufferMinutes ?? null,
          assignedMachineId: step.assignedMachineId ?? null,
          createdAt: step.createdAt,
        },
      });
  }
}

/**
 * Delete all plan steps for a given checklist.
 * Used when regenerating a plan from scratch.
 */
export async function deletePlanStepsForChecklist(checklistId: string): Promise<void> {
  const db = await initDb();
  const cpIds = await getChecklistPileIds(checklistId);
  for (const cpId of cpIds) {
    await db.delete(pilePlanSteps).where(eq(pilePlanSteps.checklistPileId, cpId));
  }
}

/**
 * Get all plan steps for a single checklist-pile entry.
 */
export async function getPlanStepsForChecklistPile(
  checklistPileId: string,
): Promise<PilePlanStep[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilePlanSteps)
    .where(eq(pilePlanSteps.checklistPileId, checklistPileId))
    .all();
}

/**
 * Get all plan steps for an entire checklist, joined with step metadata.
 */
export type PlanStepWithMeta = PilePlanStep & {
  stepName: string;
  track: string;
  sequenceOrder: number;
  /** Pure working minutes — stored by the planner, excludes break time. Null for legacy rows. */
  durationMinutes: number | null;
  /** Buffer before minutes for this step. Null for legacy rows; treat as 0. */
  bufferMinutes: number | null;
  /** Machine assigned to this step by the planner. Null for legacy rows. */
  assignedMachineId: string | null;
  /** Machine number label (e.g. "R-01") — joined from piling_machines. */
  assignedMachineNo: string;
};

export async function getPlanStepsForChecklist(
  checklistId: string,
): Promise<PlanStepWithMeta[]> {
  const db = await initDb();
  const cpIds = await getChecklistPileIds(checklistId);
  if (!cpIds.length) return [];

  const results: PlanStepWithMeta[] = [];
  for (const cpId of cpIds) {
    const rows = await db
      .select({
        id: pilePlanSteps.id,
        checklistPileId: pilePlanSteps.checklistPileId,
        stepId: pilePlanSteps.stepId,
        plannedStart: pilePlanSteps.plannedStart,
        plannedEnd: pilePlanSteps.plannedEnd,
        durationMinutes: pilePlanSteps.durationMinutes,
        bufferMinutes: pilePlanSteps.bufferMinutes,
        assignedMachineId: pilePlanSteps.assignedMachineId,
        createdAt: pilePlanSteps.createdAt,
        stepName: pilingSteps.stepName,
        track: pilingSteps.track,
        sequenceOrder: pilingSteps.sequenceOrder,
        assignedMachineNo: pilingMachines.machineNo,
      })
      .from(pilePlanSteps)
      .leftJoin(pilingSteps, eq(pilePlanSteps.stepId, pilingSteps.id))
      .leftJoin(pilingMachines, eq(pilePlanSteps.assignedMachineId, pilingMachines.id))
      .where(eq(pilePlanSteps.checklistPileId, cpId))
      .orderBy(pilingSteps.sequenceOrder)
      .all();

    for (const r of rows) {
      results.push({
        id: r.id,
        checklistPileId: r.checklistPileId,
        stepId: r.stepId,
        plannedStart: r.plannedStart,
        plannedEnd: r.plannedEnd,
        durationMinutes: r.durationMinutes ?? null,
        bufferMinutes: r.bufferMinutes ?? null,
        assignedMachineId: r.assignedMachineId ?? null,
        assignedMachineNo: r.assignedMachineNo ?? '',
        createdAt: r.createdAt,
        stepName: r.stepName ?? '',
        track: r.track ?? '',
        sequenceOrder: r.sequenceOrder ?? 0,
      });
    }
  }

  return results;
}

// ─── Actual Steps ─────────────────────────────────────────────────────────────

/**
 * Upsert an actual step (insert or update on conflict by checklist_pile_id + step_id).
 */
export async function upsertActualStep(
  entry: Omit<NewPileActualStep, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const db = await initDb();
  const now = Date.now();
  await db
    .insert(pileActualSteps)
    .values({ ...entry, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [pileActualSteps.checklistPileId, pileActualSteps.stepId],
      set: {
        actualStart: entry.actualStart,
        actualEnd: entry.actualEnd,
        remarks: entry.remarks,
        updatedAt: now,
      },
    });
}

/**
 * Get all actual steps for a single checklist-pile entry.
 */
export async function getActualStepsForChecklistPile(
  checklistPileId: string,
): Promise<PileActualStep[]> {
  const db = await initDb();
  return db
    .select()
    .from(pileActualSteps)
    .where(eq(pileActualSteps.checklistPileId, checklistPileId))
    .all();
}

/**
 * Get all actual steps for an entire checklist, joined with step metadata.
 */
export type ActualStepWithMeta = PileActualStep & {
  stepName: string;
  track: string;
  sequenceOrder: number;
};

export async function getActualStepsForChecklist(
  checklistId: string,
): Promise<ActualStepWithMeta[]> {
  const db = await initDb();
  const cpIds = await getChecklistPileIds(checklistId);
  if (!cpIds.length) return [];

  const results: ActualStepWithMeta[] = [];
  for (const cpId of cpIds) {
    const rows = await db
      .select({
        id: pileActualSteps.id,
        checklistPileId: pileActualSteps.checklistPileId,
        stepId: pileActualSteps.stepId,
        actualStart: pileActualSteps.actualStart,
        actualEnd: pileActualSteps.actualEnd,
        remarks: pileActualSteps.remarks,
        createdAt: pileActualSteps.createdAt,
        updatedAt: pileActualSteps.updatedAt,
        stepName: pilingSteps.stepName,
        track: pilingSteps.track,
        sequenceOrder: pilingSteps.sequenceOrder,
      })
      .from(pileActualSteps)
      .leftJoin(pilingSteps, eq(pileActualSteps.stepId, pilingSteps.id))
      .where(eq(pileActualSteps.checklistPileId, cpId))
      .orderBy(pilingSteps.sequenceOrder)
      .all();

    for (const r of rows) {
      results.push({
        id: r.id,
        checklistPileId: r.checklistPileId,
        stepId: r.stepId,
        actualStart: r.actualStart,
        actualEnd: r.actualEnd,
        remarks: r.remarks,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        stepName: r.stepName ?? '',
        track: r.track ?? '',
        sequenceOrder: r.sequenceOrder ?? 0,
      });
    }
  }

  return results;
}

/**
 * Delete all actual steps for a given checklist (via checklist_pile_id).
 */
export async function deleteActualStepsForChecklist(checklistId: string): Promise<void> {
  const db = await initDb();
  const cpIds = await getChecklistPileIds(checklistId);
  for (const cpId of cpIds) {
    await db.delete(pileActualSteps).where(eq(pileActualSteps.checklistPileId, cpId));
  }
}
