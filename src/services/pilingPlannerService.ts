// src/services/pilingPlannerService.ts
// Local plan generation — ported from server's pilingPlannerService.js.
//
// Generates pile_plan_steps for a checklist entirely from local SQLite data.
// No server calls needed — all required data is already synced locally:
//   piling_piles, piling_steps, piling_step_duration_templates,
//   piling_dimensions, piling_non_working_windows
//
// Algorithm — free-pool, first-available:
//   Each selected rig and crane maintains its own `freeAt` timestamp.
//   Piles are processed in the user-defined order (seq_no / selectedPileIds order).
//   For each pile:
//     1. Assign the earliest-free rig → schedule its RIG steps.
//     2. Assign the earliest-free crane (that is also >= rig end) → schedule CRANE steps.
//     3. Update both machines' freeAt to the end of their last step on this pile.
//   This maximises machine utilisation and eliminates idle gaps between piles.

import { eq } from 'drizzle-orm';
import { initDb } from '../db/client';
import {
  pilingSteps,
  pilingStepDurationTemplates,
  pilingDimensions,
  pilingNonWorkingWindows,
  pilingChecklistPiles,
  pilingPiles,
  pilePlanSteps,
} from '../db/schema';
import type { NewPilePlanStep } from '../db/schema';
import {
  getChecklistById,
  getChecklistPiles,
} from '../repositories/checklistRepository';
import {
  deletePlanStepsForChecklist,
  insertPlanSteps,
  type PlanStepWithMeta,
} from '../repositories/planRepository';
import { timeToMinutes, addMinutes } from '../utils/formatTime';

export interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  dia: number;
  depth: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Advance proposedStart past any non-working windows.
 * Re-checks after each skip because skipping one window might land in another.
 */
function skipNonWorkingWindows(
  proposedStart: Date,
  durationMinutes: number,
  windows: Array<{ startTime: string; endTime: string }>,
  dayBase: Date,
): { start: Date; end: Date } {
  const resolveDay = (base: Date) =>
    windows.map((w) => {
      const wStartMin = timeToMinutes(w.startTime);
      const wEndMin = timeToMinutes(w.endTime);
      const wStart = new Date(base);
      wStart.setHours(Math.floor(wStartMin / 60), wStartMin % 60, 0, 0);
      const wEnd = new Date(base);
      wEnd.setHours(Math.floor(wEndMin / 60), wEndMin % 60, 0, 0);
      if (wEndMin <= wStartMin) wEnd.setDate(wEnd.getDate() + 1);
      return { start: wStart, end: wEnd };
    });

  const prevDay = new Date(dayBase);
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(dayBase);
  nextDay.setDate(nextDay.getDate() + 1);

  const allWindows = [
    ...resolveDay(prevDay),
    ...resolveDay(dayBase),
    ...resolveDay(nextDay),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  // If proposedStart itself falls inside a break, jump past it first.
  let current = new Date(proposedStart);
  let moved = true;
  while (moved) {
    moved = false;
    for (const w of allWindows) {
      if (current >= w.start && current < w.end) {
        current = new Date(w.end);
        moved = true;
        break;
      }
    }
  }
  const start = new Date(current);

  // Consume `remaining` minutes of actual work, pausing at each break.
  let remaining = durationMinutes;
  while (remaining > 0) {
    const projectedEnd = addMinutes(current, remaining);
    const nextWindow = allWindows
      .filter((w) => w.start >= current && w.start < projectedEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

    if (!nextWindow) {
      current = projectedEnd;
      remaining = 0;
    } else {
      const workBeforeBreak = (nextWindow.start.getTime() - current.getTime()) / 60000;
      remaining -= workBeforeBreak;
      current = new Date(nextWindow.end);
    }
  }

  return { start, end: current };
}

/** Pick the machine with the earliest freeAt timestamp from a pool. */
function pickEarliestFree(pool: Map<string, Date>): { machineId: string; freeAt: Date } {
  let best: { machineId: string; freeAt: Date } | null = null;
  for (const [id, freeAt] of pool) {
    if (!best || freeAt < best.freeAt) {
      best = { machineId: id, freeAt };
    }
  }
  if (!best) throw new Error('[planner] Empty machine pool — cannot pick machine.');
  return best;
}

/** Generate a simple UUID-like string for plan step ids. */
function generateId(): string {
  return 'ps_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

// ─── Shared row type for preview path ─────────────────────────────────────────

interface PreviewPlanStep extends Omit<NewPilePlanStep, 'durationMinutes' | 'bufferMinutes' | 'assignedMachineId'>,
  Pick<PlanStepWithMeta, 'stepName' | 'track' | 'sequenceOrder' | 'durationMinutes' | 'bufferMinutes' | 'assignedMachineId'> {}

export interface BuildPlanRowsResult {
  planRows: PreviewPlanStep[];
  /** checklistPileId of piles that had no dimension match or no duration templates. */
  warningPileIds: string[];
}

// ─── Core scheduling engine ───────────────────────────────────────────────────

/**
 * Schedule RIG steps for a pile using the given rigPool.
 * Returns end time of the last rig step.
 */
function scheduleMachineSteps(
  steps: Array<{ id: string; stepName: string; track: string; sequenceOrder: number }>,
  machineId: string,
  startFrom: Date,
  dimId: string,
  templateMap: Map<string, { durationMinutes: number; bufferBeforeMinutes: number }>,
  windows: Array<{ startTime: string; endTime: string }>,
  dayBase: Date,
  checklistPileId: string,
  now: number,
  planRows: Array<PreviewPlanStep | NewPilePlanStep>,
): Date {
  let cursor = new Date(startFrom);
  for (const step of steps) {
    const tmpl = templateMap.get(`${dimId}|${step.id}`);
    const durationMinutes = tmpl?.durationMinutes ?? 60;
    const bufferBefore = tmpl?.bufferBeforeMinutes ?? 0;
    let proposedStart = new Date(cursor);
    if (bufferBefore > 0) proposedStart = addMinutes(proposedStart, bufferBefore);
    const { start, end } = skipNonWorkingWindows(proposedStart, durationMinutes, windows, dayBase);
    (planRows as PreviewPlanStep[]).push({
      id: generateId(),
      checklistPileId,
      stepId: step.id,
      plannedStart: start.toISOString(),
      plannedEnd: end.toISOString(),
      durationMinutes,
      bufferMinutes: bufferBefore,
      assignedMachineId: machineId,
      createdAt: now,
      stepName: step.stepName,
      track: step.track,
      sequenceOrder: step.sequenceOrder,
    });
    cursor = end;
  }
  return cursor;
}

async function buildPlanRowsForPiles(options: {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  selectedStepIds?: string[];
  /** Active rig machine ids — each gets its own freeAt cursor. */
  rigMachineIds: string[];
  /** Active crane machine ids — each gets its own freeAt cursor. */
  craneMachineIds: string[];
}): Promise<BuildPlanRowsResult> {
  const { piles, planStartTime, siteId, selectedStepIds, rigMachineIds, craneMachineIds } = options;
  const db = await initDb();

  const allSteps = db
    .select()
    .from(pilingSteps)
    .orderBy(pilingSteps.sequenceOrder)
    .all();

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet ? allSteps.filter((s) => selectedStepSet.has(s.id)) : allSteps;

  const dimensionRows = db
    .select()
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
  const dimByDiaDepth = new Map(dimensionRows.map((d) => [`${d.dia}|${d.depth}`, d.id]));

  const templateRows = db.select().from(pilingStepDurationTemplates).all();
  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  const allWindows = db
    .select()
    .from(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.siteId, siteId))
    .all();

  const planRows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];
  const now = Date.now();

  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);

  // ── Machine pools — each machine has its own freeAt cursor ─────────────────
  const rigPool = new Map<string, Date>(
    (rigMachineIds.length ? rigMachineIds : ['__default_rig__']).map((id) => [id, new Date(planStart)]),
  );
  const cranePool = new Map<string, Date>(
    (craneMachineIds.length ? craneMachineIds : ['__default_crane__']).map((id) => [id, new Date(planStart)]),
  );

  for (const pile of piles) {
    const { dia, depth, pileIdCode } = pile;
    const dimId = dimByDiaDepth.get(`${dia}|${depth}`);

    if (!dimId) {
      console.warn(`[planner] No dimension found for pile ${pileIdCode} (${dia}mm/${depth}m)`);
      warningPileIds.push(pile.checklistPileId);
      continue;
    }

    const stepsWithTemplates = pileSteps.filter((s) => templateMap.has(`${dimId}|${s.id}`));
    const activeSteps = stepsWithTemplates.length > 0 ? stepsWithTemplates : pileSteps;
    const usingDefaultDuration = stepsWithTemplates.length === 0;

    if (usingDefaultDuration) {
      console.warn(`[planner] No duration templates for pile ${pileIdCode} — using 60min default per step`);
      warningPileIds.push(pile.checklistPileId);
    }

    const rigSteps = activeSteps.filter((s) => s.track === 'RIG');
    const craneSteps = activeSteps.filter((s) => s.track === 'CRANE');

    // Pick earliest-free rig for this pile
    const { machineId: rigId, freeAt: rigStart } = pickEarliestFree(rigPool);
    const rigEnd = scheduleMachineSteps(
      rigSteps, rigId, rigStart, dimId, templateMap, allWindows, dayBase,
      pile.checklistPileId, now, planRows,
    );
    rigPool.set(rigId, rigEnd);

    // Pick earliest-free crane that is also >= rigEnd (crane must wait for rig)
    // Find crane whose max(freeAt, rigEnd) is earliest overall
    let bestCraneId = '';
    let bestCraneStart = new Date(8640000000000000); // max date
    for (const [id, freeAt] of cranePool) {
      const effectiveStart = freeAt > rigEnd ? freeAt : rigEnd;
      if (effectiveStart < bestCraneStart) {
        bestCraneStart = effectiveStart;
        bestCraneId = id;
      }
    }
    const craneEnd = scheduleMachineSteps(
      craneSteps, bestCraneId, bestCraneStart, dimId, templateMap, allWindows, dayBase,
      pile.checklistPileId, now, planRows,
    );
    cranePool.set(bestCraneId, craneEnd);
  }

  return { planRows, warningPileIds };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratePlanPreviewOptions {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  selectedStepIds?: string[];
  /** Active rig machine ids for the plan (first-free assignment). */
  rigMachineIds: string[];
  /** Active crane machine ids for the plan (first-free assignment). */
  craneMachineIds: string[];
}

/**
 * In-memory preview of the plan — does NOT write to SQLite.
 */
export async function generatePlanPreview(
  options: GeneratePlanPreviewOptions,
): Promise<BuildPlanRowsResult> {
  return buildPlanRowsForPiles(options);
}

// ─── Persist path ─────────────────────────────────────────────────────────────

export interface GeneratePlanOptions {
  checklistId: string;
  planStartTime: string;
  siteId: string;
  selectedStepIds?: string[];
  rigMachineIds: string[];
  craneMachineIds: string[];
}

export interface PlanGenerationResult {
  planStepsCreated: number;
  warningPiles: string[];
}

/**
 * Generate pile_plan_steps for all piles in a checklist and persist to SQLite.
 * Deletes any existing plan steps first (idempotent).
 */
export async function generatePlan(
  options: GeneratePlanOptions,
): Promise<PlanGenerationResult> {
  const { checklistId, planStartTime, siteId, selectedStepIds, rigMachineIds, craneMachineIds } = options;
  const db = await initDb();

  const checklistPilesRows = await getChecklistPiles(checklistId);
  if (!checklistPilesRows.length) {
    throw new Error('No piles in checklist — cannot generate plan.');
  }

  const allSteps = await db
    .select()
    .from(pilingSteps)
    .orderBy(pilingSteps.sequenceOrder)
    .all();

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet ? allSteps.filter((s) => selectedStepSet.has(s.id)) : allSteps;

  const pileRows = await db.select().from(pilingPiles).all();
  const pileMap = new Map(pileRows.map((p) => [p.id, p]));

  const dimensionRows = await db
    .select()
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
  const dimByDiaDepth = new Map(dimensionRows.map((d) => [`${d.dia}|${d.depth}`, d.id]));

  const templateRows = db.select().from(pilingStepDurationTemplates).all();
  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  const allWindows = db
    .select()
    .from(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.siteId, siteId))
    .all();

  await deletePlanStepsForChecklist(checklistId);

  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);

  // ── Machine pools ───────────────────────────────────────────────────────────
  const rigPool = new Map<string, Date>(
    (rigMachineIds.length ? rigMachineIds : ['__default_rig__']).map((id) => [id, new Date(planStart)]),
  );
  const cranePool = new Map<string, Date>(
    (craneMachineIds.length ? craneMachineIds : ['__default_crane__']).map((id) => [id, new Date(planStart)]),
  );

  const planRows: NewPilePlanStep[] = [];
  const warningPiles: string[] = [];
  const now = Date.now();

  for (const cp of checklistPilesRows) {
    const pile = pileMap.get(cp.pileId);
    if (!pile) { warningPiles.push(cp.pileId); continue; }

    const { dia, depth, pileIdCode } = pile;
    const dimId = dimByDiaDepth.get(`${dia}|${depth}`);

    if (!dimId) {
      console.warn(`[planner] No dimension found for pile ${pileIdCode} (${dia}mm/${depth}m)`);
      warningPiles.push(pileIdCode);
      continue;
    }

    const stepsWithTemplates = pileSteps.filter((s) => templateMap.has(`${dimId}|${s.id}`));
    const activeSteps = stepsWithTemplates.length > 0 ? stepsWithTemplates : pileSteps;
    if (stepsWithTemplates.length === 0) {
      console.warn(`[planner] No duration templates for pile ${pileIdCode} — using 60min default per step`);
      warningPiles.push(pileIdCode);
    }

    const rigSteps = activeSteps.filter((s) => s.track === 'RIG');
    const craneSteps = activeSteps.filter((s) => s.track === 'CRANE');

    // Pick earliest-free rig
    const { machineId: rigId, freeAt: rigStart } = pickEarliestFree(rigPool);
    let rigCursor = new Date(rigStart);
    for (const step of rigSteps) {
      const tmpl = templateMap.get(`${dimId}|${step.id}`);
      const durationMinutes = tmpl?.durationMinutes ?? 60;
      const bufferBefore = tmpl?.bufferBeforeMinutes ?? 0;
      let proposedStart = new Date(rigCursor);
      if (bufferBefore > 0) proposedStart = addMinutes(proposedStart, bufferBefore);
      const { start, end } = skipNonWorkingWindows(proposedStart, durationMinutes, allWindows, dayBase);
      planRows.push({
        id: generateId(),
        checklistPileId: cp.id,
        stepId: step.id,
        plannedStart: start.toISOString(),
        plannedEnd: end.toISOString(),
        durationMinutes,
        bufferMinutes: bufferBefore,
        assignedMachineId: rigId,
        createdAt: now,
      });
      rigCursor = end;
    }
    rigPool.set(rigId, rigCursor);

    // Pick best crane: max(cranePool[id], rigEnd) minimised
    const rigEnd = rigCursor;
    let bestCraneId = '';
    let bestCraneStart = new Date(8640000000000000);
    for (const [id, freeAt] of cranePool) {
      const effectiveStart = freeAt > rigEnd ? freeAt : rigEnd;
      if (effectiveStart < bestCraneStart) {
        bestCraneStart = effectiveStart;
        bestCraneId = id;
      }
    }
    let craneCursor = new Date(bestCraneStart);
    for (const step of craneSteps) {
      const tmpl = templateMap.get(`${dimId}|${step.id}`);
      const durationMinutes = tmpl?.durationMinutes ?? 60;
      const bufferBefore = tmpl?.bufferBeforeMinutes ?? 0;
      let proposedStart = new Date(craneCursor);
      if (bufferBefore > 0) proposedStart = addMinutes(proposedStart, bufferBefore);
      const { start, end } = skipNonWorkingWindows(proposedStart, durationMinutes, allWindows, dayBase);
      planRows.push({
        id: generateId(),
        checklistPileId: cp.id,
        stepId: step.id,
        plannedStart: start.toISOString(),
        plannedEnd: end.toISOString(),
        durationMinutes,
        bufferMinutes: bufferBefore,
        assignedMachineId: bestCraneId,
        createdAt: now,
      });
      craneCursor = end;
    }
    cranePool.set(bestCraneId, craneCursor);
  }

  await insertPlanSteps(planRows);

  return { planStepsCreated: planRows.length, warningPiles };
}