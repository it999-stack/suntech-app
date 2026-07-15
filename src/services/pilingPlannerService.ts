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

import { eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilePlanSteps,
  pilingSteps,
  pilingPiles,
  pilingDimensions,
  pilingStepDurationTemplates,
  pilingShiftTypes,
  pilingNonWorkingWindows,
  type NewPilePlanStep,
  type NonWorkingWindowBehavior,
} from '@db/schema';
import { getChecklistPiles } from '@repositories/checklistRepository';
import { insertPlanSteps, deletePlanStepsForChecklist, type PlanStepWithMeta } from '@repositories/planRepository';
import { getNonWorkingWindowsByShift } from '@repositories/shiftsRepository';
import { timeToMinutes, addMinutes } from '@utils/formatTime';
import { generateId } from '@utils/helpers';

// ─── Public input types ───────────────────────────────────────────────────────

export interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  /** FK into piling_dimensions — dia/depth are looked up from here, not carried separately. */
  dimensionId: string;
  rigId: string;
  craneId: string;
  resumeWork?: { stepId: string; remainingMinutes: number; bufferMinutes?: number };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type EffectiveWindow = {
  id: string;
  behavior: NonWorkingWindowBehavior;
  start: Date;
  end: Date;
};

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

function skipNonWorkingWindows(
  cursor: Date,
  bufferMinutes: number,
  durationMinutes: number,
  windows: EffectiveWindow[],
): { start: Date; end: Date } {
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

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

  const stepEnd = addMinutes(addMinutes(current, bufferMinutes), durationMinutes);
  const spanEnd = new Date(stepEnd);

  for (const w of windows) {
    if (w.behavior !== 'AFTER_CURRENT_STEP') continue;
    if (w.start < spanEnd && w.end > current) {
      const len = w.end.getTime() - w.start.getTime();
      w.start = new Date(stepEnd);
      w.end = new Date(stepEnd.getTime() + len);
    }
  }
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

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

function maxDate(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

// ─── Shared result types ──────────────────────────────────────────────────────

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
  warningPileIds: string[];
}

// ─── Core scheduling engine ───────────────────────────────────────────────────

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
  resumeWork?: PreviewPileInput['resumeWork'],
): Date {
  let cursor = new Date(startFrom);
  for (const step of steps) {
    const tmpl = templateMap.get(`${dimId}|${step.id}`);
    const isResumeStep = resumeWork?.stepId === step.id;
    const durationMinutes = isResumeStep
      ? resumeWork.remainingMinutes
      : (tmpl?.durationMinutes ?? 60);
    const bufferBefore = isResumeStep
      ? (resumeWork.bufferMinutes ?? 0)
      : (tmpl?.bufferBeforeMinutes ?? 0);
    const { start, end } = skipNonWorkingWindows(cursor, bufferBefore, durationMinutes, windows);

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

async function buildPlanRowsForPiles(options: {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
}): Promise<BuildPlanRowsResult> {
  const { piles, planStartTime, siteId, shiftTypeId, selectedStepIds } = options;

  const db = await initDb();

  // FIX: was missing `await` — db.select() returns a Promise on the async
  // expo-sqlite driver, so `.filter()`/mapping below would have thrown.
  const allSteps = await db
    .select()
    .from(pilingSteps)
    .orderBy(pilingSteps.sequenceOrder)
    .all();

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet
    ? allSteps.filter((s) => selectedStepSet.has(s.id))
    : allSteps;

  // FIX: piling_step_duration_templates has no site_id column — it's scoped to
  // a site indirectly through dimensionId -> piling_dimensions.site_id.
  const templateRows = await db
    .select({
      id: pilingStepDurationTemplates.id,
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
      bufferBeforeMinutes: pilingStepDurationTemplates.bufferBeforeMinutes,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(pilingDimensions, eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id))
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  let rawWindows: Array<{ id: string; behavior: string; startTime: string; endTime: string }> = [];
  if (shiftTypeId) {
    rawWindows = await getNonWorkingWindowsByShift(shiftTypeId);
  } else {
    const shiftRows = await db
      .select({ id: pilingShiftTypes.id })
      .from(pilingShiftTypes)
      .where(eq(pilingShiftTypes.siteId, siteId))
      .all();
    const shiftIds = shiftRows.map((s) => s.id);
    if (shiftIds.length > 0) {
      rawWindows = await db
        .select({
          id: pilingNonWorkingWindows.id,
          behavior: pilingNonWorkingWindows.behavior,
          startTime: pilingNonWorkingWindows.startTime,
          endTime: pilingNonWorkingWindows.endTime,
        })
        .from(pilingNonWorkingWindows)
        .where(inArray(pilingNonWorkingWindows.shiftTypeId, shiftIds))
        .all();
    }
  }

  const planRows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];
  const now = Date.now();

  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);

  const rigWindows = resolveWindows(rawWindows, dayBase);
  const craneWindows = resolveWindows(rawWindows, dayBase);

  const rigPool = new Map<string, Date>();
  const cranePool = new Map<string, Date>();
  for (const pile of piles) {
    if (!rigPool.has(pile.rigId)) rigPool.set(pile.rigId, new Date(planStart));
    if (!cranePool.has(pile.craneId)) cranePool.set(pile.craneId, new Date(planStart));
  }

  for (const pile of piles) {
    const { pileIdCode, rigId, craneId, dimensionId } = pile;

    // FIX: dimensionId now comes straight off the pile row — no more
    // dia/depth -> dimensionId reconstruction (piling_piles doesn't carry
    // dia/depth at all anymore, and the lookup was one more thing that could
    // silently mismatch).
    if (!dimensionId) {
      console.warn(`[planner] No dimension set on pile ${pileIdCode}`);
      warningPileIds.push(pile.checklistPileId);
      continue;
    }

    const stepsWithTemplates = pileSteps.filter((s) => templateMap.has(`${dimensionId}|${s.id}`));
    const activeSteps = stepsWithTemplates.length > 0 ? stepsWithTemplates : pileSteps;

    if (stepsWithTemplates.length === 0) {
      console.warn(
        `[planner] No duration templates for pile ${pileIdCode} — using 60min default per step`,
      );
      warningPileIds.push(pile.checklistPileId);
    }

    const resumeOrder = pile.resumeWork
      ? activeSteps.find((step) => step.id === pile.resumeWork!.stepId)?.sequenceOrder
      : undefined;
    const remainingSteps = resumeOrder === undefined
      ? activeSteps
      : activeSteps.filter((step) => step.sequenceOrder >= resumeOrder);

    const rigSteps = remainingSteps.filter((s) => s.track === 'RIG');
    const craneSteps = remainingSteps.filter((s) => s.track === 'CRANE');

    const rigStart = rigPool.get(rigId) ?? new Date(planStart);
    const rigEnd = scheduleMachineSteps(
      rigSteps,
      rigId,
      rigStart,
      dimensionId,
      templateMap,
      rigWindows,
      pile.checklistPileId,
      now,
      planRows,
      rigStart,
      pile.resumeWork,
    );
    rigPool.set(rigId, rigEnd);

    const craneStart = maxDate(cranePool.get(craneId) ?? new Date(planStart), rigEnd);
    const craneEnd = scheduleMachineSteps(
      craneSteps,
      craneId,
      craneStart,
      dimensionId,
      templateMap,
      craneWindows,
      pile.checklistPileId,
      now,
      planRows,
      craneStart,
      pile.resumeWork,
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
  shiftTypeId?: string;
  selectedStepIds?: string[];
}

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
  shiftTypeId?: string;
  selectedStepIds?: string[];
  resumeWorkByPileId?: Record<string, NonNullable<PreviewPileInput['resumeWork']>>;
}

export interface PlanGenerationResult {
  planStepsCreated: number;
  warningPiles: string[];
}

export async function generatePlan(
  options: GeneratePlanOptions,
): Promise<PlanGenerationResult> {
  const { checklistId, planStartTime, siteId, shiftTypeId, selectedStepIds, resumeWorkByPileId } = options;
  const db = await initDb();

  const checklistPilesRows = await getChecklistPiles(checklistId);
  if (!checklistPilesRows.length) {
    throw new Error('No piles in checklist — cannot generate plan.');
  }

  const pileRows = await db.select().from(pilingPiles).all();
  const pileMap = new Map(pileRows.map((p) => [p.id, p]));

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
      // FIX: piling_piles has no dia/depth columns — dimensionId is the
      // direct FK and is all the planner needs.
      dimensionId: pile.dimensionId,
      rigId: cp.rigId,
      craneId: cp.craneId,
      resumeWork: resumeWorkByPileId?.[pile.id],
    });
  }

  await deletePlanStepsForChecklist(checklistId);

  const { planRows, warningPileIds } = await buildPlanRowsForPiles({
    piles: pilesInput,
    planStartTime,
    siteId,
    shiftTypeId,
    selectedStepIds,
  });

  await insertPlanSteps(planRows);

  return {
    planStepsCreated: planRows.length,
    warningPiles: [...unknownPiles, ...warningPileIds],
  };
}