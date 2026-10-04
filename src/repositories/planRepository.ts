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
  /** piling_steps.is_splittable — whether the scheduler may pause this step for a
   * non-working window. Undefined on live wizard-preview rows, which don't need it:
   * those carry the scheduler's own already-relocated windows, so a non-splittable
   * step's break is correctly absent from them. Persisted rows do need it, because
   * their break labels are re-derived from windows at their NOMINAL positions —
   * see splitStepByInternalWindows. */
  isSplittable?: boolean;
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
        isSplittable: pilingSteps.isSplittable,
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
 * Reassign the machine for exactly ONE step — the one the swap was performed on.
 * Deliberately does NOT cascade to any other step: a swap is a correction/decision
 * about this step alone, and every later step keeps whatever machine its own plan
 * row already names until someone explicitly changes it too.
 *
 * Patches both sides of this one step: the PLAN row (if any — an unplanned step
 * has none), and the ACTUAL row (if one is already recorded — already finished or
 * paused, not currently running). Without the latter, a swap on an already-logged
 * step would move the PLAN row to the new machine while the ACTUAL row — what the
 * server and every report trust as "who really did it" — silently kept crediting
 * the departing machine. The currently running step is left alone here: its
 * handover already goes through segments (pauseStep + syncActualRollupFromSegments,
 * called by the caller before this), which already moves its roll-up to
 * `newMachineId`.
 */
export async function reassignMachineFromStep(
  checklistPileId: string,
  stepId: string,
  newMachineId: string,
  filledBy?: string | null,
): Promise<void> {
  const db = await initDb();

  const planRows = await db
    .select({ id: pilePlanSteps.id })
    .from(pilePlanSteps)
    .where(and(eq(pilePlanSteps.checklistPileId, checklistPileId), eq(pilePlanSteps.stepId, stepId)))
    .limit(1);
  if (planRows.length) {
    await db
      .update(pilePlanSteps)
      .set({ assignedMachineId: newMachineId })
      .where(eq(pilePlanSteps.id, planRows[0].id));
  }

  const actuals = await getActualStepsForChecklistPile(checklistPileId);
  const actual = actuals.find((a) => a.stepId === stepId);
  if (actual) {
    await upsertActualStep({
      id: actual.id,
      checklistPileId,
      stepId,
      assignedMachineId: newMachineId,
      filledBy,
    });
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
 *
 * `actualStart`, `actualEnd`, `remarks` and `assignedMachineId` are all PATCH
 * fields: omitting one (i.e. leaving it `undefined`) leaves whatever is
 * already stored in THAT COLUMN untouched, where passing `null` clears it.
 * This matters beyond convenience — a caller that wants to change only one
 * field must never "preserve" the others by copying them in from its own
 * in-memory snapshot (e.g. React state read at the top of a handler), because
 * that snapshot can already be stale by the time this runs if another write
 * to the same row happened earlier in the same handler (its state update
 * hasn't necessarily been reflected back into that closure yet). Omitting the
 * field here instead reads the true current value straight from the row
 * being updated, which can never be stale. Two upsertActualStep calls in a
 * row for the same step — e.g. "set actualEnd" immediately followed by "set
 * remarks" from the same Stop-work action — is exactly the case this
 * protects: each call must only touch the one field it actually means to
 * change.
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
    //
    // Every field spread conditionally rather than passed through as
    // undefined — the patch semantics above are then explicit here instead
    // of resting on the query builder happening to drop undefined keys.
    await db
      .update(pileActualSteps)
      .set({
        ...(entry.actualStart !== undefined ? { actualStart: entry.actualStart } : {}),
        ...(entry.actualEnd !== undefined ? { actualEnd: entry.actualEnd } : {}),
        ...(entry.remarks !== undefined ? { remarks: entry.remarks } : {}),
        ...(entry.assignedMachineId !== undefined
          ? { assignedMachineId: entry.assignedMachineId }
          : {}),
        ...(entry.filledBy !== undefined ? { filledBy: entry.filledBy } : {}),
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
        assignedMachineId: pileActualSteps.assignedMachineId,
        filledBy: pileActualSteps.filledBy,
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
        assignedMachineId: r.assignedMachineId,
        filledBy: r.filledBy,
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
