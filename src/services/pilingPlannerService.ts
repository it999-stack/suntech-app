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
import { initDb } from '@db/client';
import {
  pilingChecklistPiles,
  pilePlanSteps,
  pileActualSteps,
  pilingSteps,
  pilingPiles,
  pilingDimensions,
  pilingStepDurationTemplates,
  pilingNonWorkingWindows,
  type PilingChecklistPile,
  type PilePlanStep,
  type PileActualStep,
  type PilingStep,
  type NewPilePlanStep,
  type NonWorkingWindowBehavior,
} from '@db/schema';
import { getChecklistPiles } from '@repositories/checklistRepository';
import { getPlanStepsForChecklist, getActualStepsForChecklist, insertPlanSteps, upsertActualStep, deletePlanStepsForChecklist, deleteActualStepsForChecklist, type PlanStepWithMeta } from '@repositories/planRepository';
import { timeToMinutes, addMinutes } from '@utils/formatTime';

// ─── Public input types ───────────────────────────────────────────────────────

export interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  dia: number;
  depth: number;
  /** Rig assigned to this pile (pilingMachines.id, type=RIG). Scheduling is exclusive to this machine. */
  rigId: string;
  /** Crane assigned to this pile (pilingMachines.id, type=CRANE). Scheduling is exclusive to this machine. */
  craneId: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** A non-working window resolved to absolute Date objects for one scheduling pass. */
type EffectiveWindow = {
  id: string;
  behavior: NonWorkingWindowBehavior;
  start: Date;
  end: Date;
};

/**
 * Resolve raw site windows (with behavior) into absolute Date objects for the
 * prev/base/next day around `dayBase`. Returns a fresh, mutable, sorted array —
 * callers may shift AFTER_CURRENT_STEP windows in place during scheduling.
 */
function resolveWindows(
  raw: Array<{ id: string; behavior: string; startTime: string; endTime: string }>,
  dayBase: Date,
): EffectiveWindow[] {
  const resolveDay = (base: Date) =>
    raw.map((w) => {
      const wStartMin = timeToMinutes(w.startTime);
      const wEndMin = timeToMinutes(w.endTime);
      const wStart = new Date(base);
      wStart.setHours(Math.floor(wStartMin / 60), wStartMin % 60, 0, 0);
      const wEnd = new Date(base);
      wEnd.setHours(Math.floor(wEndMin / 60), wEndMin % 60, 0, 0);
      if (wEndMin <= wStartMin) wEnd.setDate(wEnd.getDate() + 1);
      return { id: w.id, behavior: w.behavior as NonWorkingWindowBehavior, start: wStart, end: wEnd };
    });

  const prevDay = new Date(dayBase);
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(dayBase);
  nextDay.setDate(nextDay.getDate() + 1);

  return [
    ...resolveDay(prevDay),
    ...resolveDay(dayBase),
    ...resolveDay(nextDay),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Schedule `bufferMinutes + durationMinutes` of work starting at `cursor`
 * (the end of the previous step), honouring non-working windows.
 *
 * - FIXED windows are never moved: if a step spans one, work pauses and resumes
 *   after it (the step is split).
 * - AFTER_CURRENT_STEP windows: if this step's full continuous span
 *   [cursor, cursor + buffer + duration] overlaps the window, the step runs
 *   straight through and the window is deferred to start right after the step
 *   ends. The windows array is mutated in place so subsequent steps on the same
 *   machine track observe the shifted break.
 *
 * `windows` is mutated for AFTER_CURRENT_STEP entries and kept sorted by start.
 */
function skipNonWorkingWindows(
  cursor: Date,
  bufferMinutes: number,
  durationMinutes: number,
  windows: EffectiveWindow[],
): { start: Date; end: Date } {
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Phase 1 — escape any window we currently sit inside (FIXED or already-shifted).
  let current = new Date(cursor);
  let moved = true;
  while (moved) {
    moved = false;
    for (const w of windows) {
      if (current >= w.start && current < w.end) {
        current = new Date(w.end);
        moved = true;
        break;
      }
    }
  }

  // Full continuous span of this step (setup buffer + work), used to decide
  // whether an AFTER_CURRENT_STEP break is "in progress" during the step.
  const spanStart = new Date(current);
  const stepEnd = addMinutes(addMinutes(current, bufferMinutes), durationMinutes);
  const spanEnd = new Date(stepEnd);

  // Phase 2 — AFTER_CURRENT_STEP: defer the window to right after the step.
  for (const w of windows) {
    if (w.behavior !== 'AFTER_CURRENT_STEP') continue;
    if (w.start < spanEnd && w.end > spanStart) {
      const len = w.end.getTime() - w.start.getTime();
      w.start = new Date(stepEnd);
      w.end = new Date(stepEnd.getTime() + len);
    }
  }
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Phase 3 — consume buffer + duration, pausing ONLY at FIXED windows.
  let remaining = bufferMinutes + durationMinutes;
  let cursor2 = new Date(current);
  while (remaining > 0) {
    const projectedEnd = addMinutes(cursor2, remaining);
    let nextFixed: EffectiveWindow | null = null;
    for (const w of windows) {
      if (w.behavior !== 'FIXED') continue;
      if (w.start >= cursor2 && w.start < projectedEnd) {
        if (!nextFixed || w.start.getTime() < nextFixed.start.getTime()) {
          nextFixed = w;
        }
      }
    }
    if (!nextFixed) {
      cursor2 = projectedEnd;
      remaining = 0;
    } else {
      const workBeforeBreak = (nextFixed.start.getTime() - cursor2.getTime()) / 60000;
      remaining -= workBeforeBreak;
      cursor2 = new Date(nextFixed.end);
    }
  }

  return { start: current, end: cursor2 };
}

/** Return the later of two Dates. */
function maxDate(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

/** Generate a simple UUID-like string for plan step ids. */
function generateId(): string {
  return 'ps_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

// ─── Shared result types ──────────────────────────────────────────────────────

/** A plan row that carries step metadata (used by the preview path). */
interface PreviewPlanStep
  extends Omit<NewPilePlanStep, 'durationMinutes' | 'bufferMinutes' | 'assignedMachineId'>,
    Pick<
      PlanStepWithMeta,
      | 'stepName'
      | 'track'
      | 'sequenceOrder'
      | 'durationMinutes'
      | 'bufferMinutes'
      | 'assignedMachineId'
    > {}

export interface BuildPlanRowsResult {
  planRows: PreviewPlanStep[];
  /** checklistPileId values for piles that had no dimension match or no duration templates. */
  warningPileIds: string[];
}

// ─── Core scheduling engine ───────────────────────────────────────────────────

/**
 * Schedule all steps for one machine track on a single pile.
 * Pushes rows into `planRows` and returns the cursor position (end of last step).
 */
function scheduleMachineSteps(
  steps: Array<{ id: string; stepName: string; track: string; sequenceOrder: number }>,
  machineId: string,
  startFrom: Date,
  dimId: string,
  templateMap: Map<string, { durationMinutes: number; bufferBeforeMinutes: number }>,
  windows: EffectiveWindow[],
  checklistPileId: string,
  now: number,
  planRows: PreviewPlanStep[],
  expectedFreeAt: Date,
): Date {
  let cursor = new Date(startFrom);
  for (const step of steps) {
    const tmpl = templateMap.get(`${dimId}|${step.id}`);
    const durationMinutes = tmpl?.durationMinutes ?? 60;
    const bufferBefore = tmpl?.bufferBeforeMinutes ?? 0;
    const { start, end } = skipNonWorkingWindows(cursor, bufferBefore, durationMinutes, windows);

    // Defensive guard: a machine must never be scheduled before it becomes free.
    // Catches any regression that would double-book the same resource.
    if (start.getTime() < expectedFreeAt.getTime()) {
      throw new Error(
        `[planner] Resource conflict on ${machineId}: step scheduled at ` +
          `${start.toISOString()} is before its available time ${expectedFreeAt.toISOString()}.`,
      );
    }

    planRows.push({
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

/**
 * Shared scheduling engine used by both the preview and persist paths.
 * Accepts an ordered list of pile inputs and returns plan rows + warning ids.
 * Does NOT write to SQLite.
 */
async function buildPlanRowsForPiles(options: {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  selectedStepIds?: string[];
}): Promise<BuildPlanRowsResult> {
  const { piles, planStartTime, siteId, selectedStepIds } = options;
  const db = await initDb();

  // ── Load reference data ────────────────────────────────────────────────────
  const allSteps = db
    .select()
    .from(pilingSteps)
    .orderBy(pilingSteps.sequenceOrder)
    .all();

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet
    ? allSteps.filter((s) => selectedStepSet.has(s.id))
    : allSteps;

  const dimensionRows = db
    .select()
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
  const dimByDiaDepth = new Map(dimensionRows.map((d) => [`${d.dia}|${d.depth}`, d.id]));

  const templateRows = db.select().from(pilingStepDurationTemplates).all();
  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  const rawWindows = db
    .select()
    .from(pilingNonWorkingWindows)
    .where(eq(pilingNonWorkingWindows.siteId, siteId))
    .all();

  // ── Initialise scheduling state ────────────────────────────────────────────
  const planRows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];
  const now = Date.now();

  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);

  // Per-track effective windows. AFTER_CURRENT_STEP breaks are shifted in place
  // during scheduling, so the RIG and CRANE tracks keep independent copies.
  const rigWindows = resolveWindows(rawWindows, dayBase);
  const craneWindows = resolveWindows(rawWindows, dayBase);

  // Per-machine "next free" timestamp. One entry per assigned rig/crane across
  // all piles. Each pile is scheduled on its OWN assigned rig/crane, and the
  // machine's freeAt is advanced so the same machine is never double-booked
  // when it is reused on a later pile.
  const rigPool = new Map<string, Date>();
  const cranePool = new Map<string, Date>();
  for (const pile of piles) {
    if (!rigPool.has(pile.rigId)) rigPool.set(pile.rigId, new Date(planStart));
    if (!cranePool.has(pile.craneId)) cranePool.set(pile.craneId, new Date(planStart));
  }

  // ── Schedule each pile ─────────────────────────────────────────────────────
  for (const pile of piles) {
    const { dia, depth, pileIdCode, rigId, craneId } = pile;
    const dimId = dimByDiaDepth.get(`${dia}|${depth}`);

    if (!dimId) {
      console.warn(`[planner] No dimension found for pile ${pileIdCode} (${dia}mm/${depth}m)`);
      warningPileIds.push(pile.checklistPileId);
      continue;
    }

    const stepsWithTemplates = pileSteps.filter((s) => templateMap.has(`${dimId}|${s.id}`));
    const activeSteps = stepsWithTemplates.length > 0 ? stepsWithTemplates : pileSteps;

    if (stepsWithTemplates.length === 0) {
      console.warn(
        `[planner] No duration templates for pile ${pileIdCode} — using 60min default per step`,
      );
      warningPileIds.push(pile.checklistPileId);
    }

    const rigSteps = activeSteps.filter((s) => s.track === 'RIG');
    const craneSteps = activeSteps.filter((s) => s.track === 'CRANE');

    // RIG — this pile's assigned rig, serialised after its previous work.
    const rigStart = rigPool.get(rigId) ?? new Date(planStart);
    const rigEnd = scheduleMachineSteps(
      rigSteps,
      rigId,
      rigStart,
      dimId,
      templateMap,
      rigWindows,
      pile.checklistPileId,
      now,
      planRows,
      rigStart,
    );
    rigPool.set(rigId, rigEnd);

    // CRANE — this pile's assigned crane, must start no earlier than the rig ends.
    const craneStart = maxDate(cranePool.get(craneId) ?? new Date(planStart), rigEnd);
    const craneEnd = scheduleMachineSteps(
      craneSteps,
      craneId,
      craneStart,
      dimId,
      templateMap,
      craneWindows,
      pile.checklistPileId,
      now,
      planRows,
      craneStart,
    );
    cranePool.set(craneId, craneEnd);
  }

  return { planRows, warningPileIds };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratePlanPreviewOptions {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  selectedStepIds?: string[];
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
}

export interface PlanGenerationResult {
  planStepsCreated: number;
  warningPiles: string[];
}

/**
 * Generate pile_plan_steps for all piles in a checklist and persist to SQLite.
 * Deletes any existing plan steps first (idempotent).
 *
 * Reuses the shared `buildPlanRowsForPiles` engine — no scheduling logic is
 * duplicated here.
 */
export async function generatePlan(
  options: GeneratePlanOptions,
): Promise<PlanGenerationResult> {
  const { checklistId, planStartTime, siteId, selectedStepIds } = options;
  const db = await initDb();

  // Load checklist piles and resolve full pile details
  const checklistPilesRows = await getChecklistPiles(checklistId);
  if (!checklistPilesRows.length) {
    throw new Error('No piles in checklist — cannot generate plan.');
  }

  const pileRows = await db.select().from(pilingPiles).all();
  const pileMap = new Map(pileRows.map((p) => [p.id, p]));

  // Convert checklist pile rows → PreviewPileInput (shared engine format)
  const pilesInput: PreviewPileInput[] = [];
  const unknownPiles: string[] = [];
  for (const cp of checklistPilesRows) {
    const pile = pileMap.get(cp.pileId);
    if (!pile) {
      unknownPiles.push(cp.pileId);
      continue;
    }
    pilesInput.push({
      checklistPileId: cp.id,
      pileId: pile.id,
      pileIdCode: pile.pileIdCode,
      dia: pile.dia,
      depth: pile.depth,
      rigId: cp.rigId,
      craneId: cp.craneId,
    });
  }

  // Delete existing plan steps before regenerating (idempotent)
  await deletePlanStepsForChecklist(checklistId);

  // Run shared scheduling engine
  const { planRows, warningPileIds } = await buildPlanRowsForPiles({
    piles: pilesInput,
    planStartTime,
    siteId,
    selectedStepIds,
  });

  // Persist to SQLite
  await insertPlanSteps(planRows);

  return {
    planStepsCreated: planRows.length,
    warningPiles: [...unknownPiles, ...warningPileIds],
  };
}
