// src/repositories/planRepository.ts
// CRUD helpers for pile_plan_steps and pile_actual_steps in local SQLite.

import { and, eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilePlanSteps,
  pileActualSteps,
  pilingChecklistPiles,
  pilingDailyChecklists,
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
 * Callers always delete existing steps for the checklist first (regeneration
 * is wholesale), so this is a plain insert rather than an upsert.
 */
export async function insertPlanSteps(steps: NewPilePlanStep[]): Promise<void> {
  if (!steps.length) return;
  const db = await initDb();
  for (const step of steps) {
    await db.insert(pilePlanSteps).values(step);
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
  /** The step definition's own nominal track (piling_steps.track), distinct from
   * `track` (the currently assigned machine's type) once overridden by a runtime
   * replacement or a generation-time stepTrackOverride. Fixed for the step's
   * lifetime — use this, not `track`, for anything that must survive a machine
   * swap (e.g. MachineReplaceModal's eligibility rule). Populated both on live
   * wizard-preview rows (pilingPlannerService.ts) and on persisted/synced rows
   * (getPlanStepsForChecklist above). */
  businessTrack?: string;
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
        updatedAt: pilePlanSteps.updatedAt,
        stepName: pilingSteps.stepName,
        track: pilingSteps.track,
        sequenceOrder: pilingSteps.sequenceOrder,
        assignedMachineNo: pilingMachines.machineNo,
        // Which type the CURRENTLY assigned machine actually is — the ground truth of
        // what executed this step. Falls back to the step definition's own track when
        // unassigned (legacy rows, or a step nobody has scheduled a machine for yet).
        assignedMachineType: pilingMachines.type,
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
        updatedAt: r.updatedAt,
        stepName: r.stepName ?? '',
        track: r.assignedMachineType ?? r.track ?? '',
        businessTrack: r.track ?? '',
        sequenceOrder: r.sequenceOrder ?? 0,
      });
    }
  }

  return results;
}

/**
 * Reassign the machine for every step currently on `currentMachineId`, whose step
 * definition's nominal track is `businessTrack`, from `fromSequenceOrder` onward
 * (inclusive) — the "applies to this step onward" scope of a machine swap. Steps
 * before fromSequenceOrder (already done) are never touched, preserving their
 * historical assignedMachineId.
 *
 * Both conditions matter together: matching on `currentMachineId` alone would also
 * sweep along any *other* business track that machine happens to be covering on this
 * same pile (e.g. a Rig doing its own Casing/Boring steps *and* temporarily covering
 * a broken Crane's step) — replacing the borrowed crane work would then wrongly move
 * the Rig's own steps too. Matching on `businessTrack` alone would miss the step
 * being replaced the moment it's no longer on its nominal track's machine type (e.g.
 * re-replacing a Crane-track step that's currently running on a Rig after an earlier
 * swap) — see MachineReplaceModal.tsx / eventLabels.ts's isEligibleReplacementType.
 */
export async function reassignMachineFromStep(
  checklistPileId: string,
  currentMachineId: string | null | undefined,
  businessTrack: string,
  fromSequenceOrder: number,
  newMachineId: string,
): Promise<void> {
  const db = await initDb();
  const rows = await db
    .select({
      id: pilePlanSteps.id,
      sequenceOrder: pilingSteps.sequenceOrder,
      assignedMachineId: pilePlanSteps.assignedMachineId,
      track: pilingSteps.track,
    })
    .from(pilePlanSteps)
    .leftJoin(pilingSteps, eq(pilePlanSteps.stepId, pilingSteps.id))
    .where(eq(pilePlanSteps.checklistPileId, checklistPileId))
    .all();

  const targetIds = rows
    .filter(
      (r) =>
        r.assignedMachineId === currentMachineId &&
        r.track === businessTrack &&
        (r.sequenceOrder ?? 0) >= fromSequenceOrder,
    )
    .map((r) => r.id);

  for (const id of targetIds) {
    await db.update(pilePlanSteps).set({ assignedMachineId: newMachineId }).where(eq(pilePlanSteps.id, id));
  }
}

// ─── Actual Steps ─────────────────────────────────────────────────────────────

/**
 * Upsert an actual step for a checklist-pile + step pair.
 *
 * Implemented as select-then-branch rather than an INSERT ... ON CONFLICT
 * upsert: for composite (multi-column) conflict targets, this version of
 * drizzle-orm's SQLite dialect renders the target as table-qualified columns
 * (`"pil_actual_steps"."checklist_pile_id"`), which SQLite's ON CONFLICT
 * clause rejects with "does not match any PRIMARY KEY or UNIQUE constraint"
 * even though the matching unique index genuinely exists — confirmed by
 * inspecting the generated SQL directly. Sidestepping the ON CONFLICT
 * codegen entirely avoids the bug. Matched on both checklistPileId AND
 * stepId (not stepId alone) — stepId is a shared step-definition id reused
 * across every pile, so matching on it alone would conflate different
 * piles' actuals for the "same" step.
 */
export async function upsertActualStep(
  entry: Omit<NewPileActualStep, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const db = await initDb();
  const now = Date.now();

  const existing = await db
    .select({ id: pileActualSteps.id })
    .from(pileActualSteps)
    .where(
      and(
        eq(pileActualSteps.checklistPileId, entry.checklistPileId),
        eq(pileActualSteps.stepId, entry.stepId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    // Deliberately does not touch serverUpdatedAt — that column is the
    // last-known-server version for optimistic concurrency and must only
    // ever be set by hydrateChecklistFromServer from a real server payload,
    // never from a local edit's device clock.
    await db
      .update(pileActualSteps)
      .set({
        actualStart: entry.actualStart,
        actualEnd: entry.actualEnd,
        remarks: entry.remarks,
        updatedAt: now,
      })
      .where(eq(pileActualSteps.id, existing[0].id));
  } else {
    await db.insert(pileActualSteps).values({
      ...entry,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ─── Steps for one pile on a specific day ──────────────────────────────────
//
// A pile has at most one checklist-pile row per date — pil_daily_checklists
// is unique per (site_id, date) and pil_checklist_piles unique per
// (checklist_id, pile_id) — so (pileId, date) alone identifies the row.
// Powers PileStepsModal from the Piles list screen, where a tapped pile's
// relevant day (its Completed/In Progress date) isn't necessarily today.

export type PileStepRow = {
  id: string;
  name: string;
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  actualStart: string;
  actualEnd: string;
};

/** Completed steps (both actualStart and actualEnd recorded) for one pile on one day. */
export async function getCompletedStepsForPileOnDate(pileId: string, date: string): Promise<PileStepRow[]> {
  const db = await initDb();

  const checklistPile = await db
    .select({ id: pilingChecklistPiles.id })
    .from(pilingChecklistPiles)
    .innerJoin(pilingDailyChecklists, eq(pilingChecklistPiles.checklistId, pilingDailyChecklists.id))
    .where(and(eq(pilingChecklistPiles.pileId, pileId), eq(pilingDailyChecklists.date, date)))
    .limit(1);
  const checklistPileId = checklistPile[0]?.id;
  if (!checklistPileId) return [];

  const rows = await db
    .select({
      id: pileActualSteps.id,
      stepName: pilingSteps.stepName,
      track: pilingSteps.track,
      sequenceOrder: pilingSteps.sequenceOrder,
      actualStart: pileActualSteps.actualStart,
      actualEnd: pileActualSteps.actualEnd,
    })
    .from(pileActualSteps)
    .leftJoin(pilingSteps, eq(pileActualSteps.stepId, pilingSteps.id))
    .where(eq(pileActualSteps.checklistPileId, checklistPileId))
    .orderBy(pilingSteps.sequenceOrder);

  return rows
    .filter((r): r is typeof r & { actualStart: string; actualEnd: string } => !!r.actualStart && !!r.actualEnd)
    .map((r) => ({
      id: r.id,
      name: r.stepName ?? '',
      track: (r.track ?? 'RIG') as PileStepRow['track'],
      actualStart: r.actualStart,
      actualEnd: r.actualEnd,
    }));
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
        serverUpdatedAt: pileActualSteps.serverUpdatedAt,
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
        serverUpdatedAt: r.serverUpdatedAt,
        stepName: r.stepName ?? '',
        track: r.track ?? '',
        sequenceOrder: r.sequenceOrder ?? 0,
      });
    }
  }

  return results;
}
