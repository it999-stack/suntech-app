// src/services/pilingPlannerService.ts
// Local plan generation — ported from server's pilingPlannerService.js.
//
// Generates pile_plan_steps for a checklist entirely from local SQLite data.
// No server calls needed — all required data is already synced locally:
//   piling_piles, piling_steps, piling_step_duration_templates,
//   piling_dimensions, piling_non_working_windows
//
// Algorithm — free-pool, greedy-by-availability, driven purely by sequence_order:
//   Each machine (rig/crane/compressor, keyed by track) maintains its own `freeAt`
//   timestamp per machine id. Piles are scheduled greedily: at each step, whichever
//   not-yet-scheduled pile's next step can start soonest goes next — not input order.
//   For each pile (in that greedy order), its steps are walked in a single pass in
//   piling_steps.sequence_order (no per-track batching): each step starts at
//   max(its assigned machine's freeAt, this pile's own previous-step-end), then that
//   machine's freeAt and the pile's cursor both advance to the step's end.
//   There is no hardcoded "RIG before CRANE" rule — ordering comes entirely from
//   sequence_order, so any track (including COMPRESSOR) slots in wherever its steps
//   are ordered relative to the others for that pile.

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
  type PilingStep,
} from '@db/schema';
import { getChecklistPiles } from '@repositories/checklistRepository';
import { insertPlanSteps, deletePlanStepsForChecklist, type PlanStepWithMeta } from '@repositories/planRepository';
import { getNonWorkingWindowsByShift } from '@repositories/shiftsRepository';
import { timeToMinutes, addMinutes, toLocalIsoString } from '@utils/formatTime';
import { generateId, isContinuingStep } from '@utils/helpers';
import { planEndTime } from '@/types/plan';

// ─── Public input types ───────────────────────────────────────────────────────

export interface PreviewPileInput {
  checklistPileId: string;
  pileId: string;
  pileIdCode: string;
  /** FK into piling_dimensions — dia/depth are looked up from here, not carried separately. */
  dimensionId: string;
  rigId: string;
  craneId: string;
  /** Optional third track's machine. Undefined until compressor assignment UI exists. */
  compressorId?: string;
  resumeWork?: { stepId: string; remainingMinutes: number; bufferMinutes?: number };
  /** Step ids whose CRANE-track step should run on the Rig instead for this pile — a Rig can
   * perform any CRANE step, never the reverse. One-off per plan generation, not persisted. */
  stepTrackOverrides?: string[];
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type EffectiveWindow = {
  id: string;
  label: string;
  behavior: NonWorkingWindowBehavior;
  start: Date;
  end: Date;
};

function resolveWindows(
  raw: Array<{ id: string; label: string; behavior: string; startTime: string; endTime: string }>,
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
      return {
        id: w.id,
        label: w.label,
        behavior: w.behavior as NonWorkingWindowBehavior,
        start: wStart,
        end: wEnd,
      };
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

/** Which PreviewPileInput field holds the assigned machine for a given step's track. */
const TRACK_MACHINE_FIELD: Record<string, keyof PreviewPileInput> = {
  RIG: 'rigId',
  CRANE: 'craneId',
  COMPRESSOR: 'compressorId',
};

function machineForTrack(pile: PreviewPileInput, track: string): string | undefined {
  const field = TRACK_MACHINE_FIELD[track];
  return field ? (pile[field] as string | undefined) : undefined;
}

/**
 * The step definition's own track (`businessTrack`) and "which machine actually executes
 * this step" (`executionTrack`/`assignedMachineId`) are different concepts that happen to
 * coincide unless overridden. This is the ONLY place override logic — and the only caller
 * of machineForTrack() — lives: everything past Pass 1 below reads the already-resolved
 * assignedMachineId/executionTrack and never re-derives them.
 */
function resolveStepExecution(
  pile: PreviewPileInput,
  step: { id: string; track: string },
): { businessTrack: string; executionTrack: string; assignedMachineId: string | undefined } {
  const executionTrack =
    step.track === 'CRANE' && pile.stepTrackOverrides?.includes(step.id) ? 'RIG' : step.track;
  return {
    businessTrack: step.track,
    executionTrack,
    assignedMachineId: machineForTrack(pile, executionTrack),
  };
}

// ─── Shared result types ──────────────────────────────────────────────────────

export interface PreviewPlanStep
  extends Omit<NewPilePlanStep, 'durationMinutes' | 'bufferMinutes' | 'assignedMachineId' | 'plannedEnd'>,
    Pick<
      PlanStepWithMeta,
      | 'stepName'
      | 'track'
      | 'sequenceOrder'
      | 'durationMinutes'
      | 'bufferMinutes'
      | 'assignedMachineId'
    > {
  // Always set by scheduleOneStep — never left undefined like the insert type allows.
  plannedEnd: string | null;
  /** The step definition's own nominal track — distinct from `track` (the execution
   * track, i.e. which machine actually ran it) once an override is in play. Lets the
   * Preview UI keep offering the Rig/Crane choice tiles even after a step's `track`
   * has flipped to 'RIG'. Not present on persisted/synced rows (see PlanStepWithMeta). */
  businessTrack: string;
}

/** A non-working window resolved to its actual effective placement for one machine. */
export interface EffectivePlanWindow {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface BuildPlanRowsResult {
  planRows: PreviewPlanStep[];
  warningPileIds: string[];
  /** Non-working windows actually applied per machine, keyed by machineId. */
  windowsByMachineId: Record<string, EffectivePlanWindow[]>;
  /** Feed this back in as the next call's `scheduleCache` option — see PlanScheduleCache. */
  scheduleCache: PlanScheduleCache;
}

/**
 * Lets a caller that repeatedly recomputes the same plan (e.g. the Preview step, on every
 * Rig/Crane track-override toggle) skip rescheduling piles that couldn't possibly have
 * changed. Piles are partitioned into machine-sharing "components" (see
 * partitionIntoComponents()) — each component's schedule is provably independent of every
 * other's, so when only a track override changed, only the component(s) containing an
 * affected pile need to actually re-run Pass 2; every other component's rows are reused as-is.
 *
 * `fingerprint` covers every scheduling input EXCEPT stepTrackOverrides (plan start time,
 * site/shift, selected steps, and each pile's id/dimension/machine-assignment/resumeWork in
 * order). A mismatch means component membership itself may have changed (pile added/removed,
 * rig/crane reassigned, resumeWork changed, reorder, etc.) — in that case the whole cache is
 * discarded and every component is rescheduled from scratch, same as if no cache were passed
 * at all. This is intentionally an all-or-nothing gate: it is never partially trusted.
 */
export interface PlanScheduleCache {
  fingerprint: string;
  componentResults: Record<
    string,
    {
      /** Fingerprint of just this component's piles' stepTrackOverrides — a mismatch means
       * this specific component needs rescheduling even though the overall fingerprint matched. */
      overridesFingerprint: string;
      rows: PreviewPlanStep[];
      warningPileIds: string[];
      windowsByMachineId: Record<string, EffectivePlanWindow[]>;
    }
  >;
}

// ─── Core scheduling engine ───────────────────────────────────────────────────

function scheduleOneStep(
  step: { id: string; stepName: string; sequenceOrder: number },
  businessTrack: string,
  executionTrack: string,
  machineId: string,
  startFrom: Date,
  dimId: string,
  templateMap: Map<string, { durationMinutes: number; bufferBeforeMinutes: number }>,
  windows: EffectiveWindow[],
  checklistPileId: string,
  now: number,
  planRows: PreviewPlanStep[],
  expectedFreeAt: Date,
  planEnd: Date,
  resumeWork?: PreviewPileInput['resumeWork'],
): Date {
  const tmpl = templateMap.get(`${dimId}|${step.id}`);
  const isResumeStep = resumeWork?.stepId === step.id;
  const durationMinutes = isResumeStep
    ? resumeWork.remainingMinutes
    : (tmpl?.durationMinutes ?? 60);
  const bufferBefore = isResumeStep
    ? (resumeWork.bufferMinutes ?? 0)
    : (tmpl?.bufferBeforeMinutes ?? 0);
  const { start, end } = skipNonWorkingWindows(startFrom, bufferBefore, durationMinutes, windows);

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
    plannedStart: toLocalIsoString(start),
    // A step whose natural end runs past the plan window is "continuing" —
    // no committed end time is persisted for it (see isContinuingStep).
    plannedEnd: end.getTime() > planEnd.getTime() ? null : toLocalIsoString(end),
    durationMinutes,
    bufferMinutes: bufferBefore,
    assignedMachineId: machineId,
    createdAt: now,
    stepName: step.stepName,
    track: executionTrack,
    businessTrack,
    sequenceOrder: step.sequenceOrder,
  });
  return end;
}

// ─── Machine-sharing components (for PlanScheduleCache) ───────────────────────
// Piles that never share a rig/crane/compressor with each other are provably independent
// under this scheduler: Pass 2 only ever compares readyAt values sourced from a pile's own
// assigned machines, so their relative processing order — and hence their computed times —
// can never affect one another. Grouping piles this way lets a repeated recompute (e.g. one
// track-override toggle) skip rescheduling every component except the one(s) actually touched.

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Deterministic for a given `piles` array (same order, same machine assignments) — the same
 * group of piles always resolves to the same component id, which is all a same-call cache
 * lookup needs (component ids are never persisted or compared across different fingerprints). */
function partitionIntoComponents(piles: PreviewPileInput[]): Map<string, string> {
  const uf = new UnionFind();
  for (const pile of piles) {
    const pileNode = `p:${pile.checklistPileId}`;
    for (const machineId of [pile.rigId, pile.craneId, pile.compressorId]) {
      if (!machineId) continue;
      uf.union(pileNode, `m:${machineId}`);
    }
  }
  const componentIdByPileId = new Map<string, string>();
  for (const pile of piles) {
    componentIdByPileId.set(pile.checklistPileId, uf.find(`p:${pile.checklistPileId}`));
  }
  return componentIdByPileId;
}

/** Everything that affects scheduling EXCEPT stepTrackOverrides — see PlanScheduleCache. */
function computeFingerprint(
  piles: PreviewPileInput[],
  planStartTime: string,
  siteId: string,
  shiftTypeId: string | undefined,
  selectedStepIds: string[] | undefined,
): string {
  return JSON.stringify({
    planStartTime,
    siteId,
    shiftTypeId: shiftTypeId ?? null,
    selectedStepIds: selectedStepIds ?? null,
    piles: piles.map((p) => ({
      checklistPileId: p.checklistPileId,
      pileId: p.pileId,
      dimensionId: p.dimensionId,
      rigId: p.rigId,
      craneId: p.craneId,
      compressorId: p.compressorId ?? null,
      resumeWork: p.resumeWork ?? null,
    })),
  });
}

/** Just one component's piles' stepTrackOverrides — order-independent (sorted) since taps can
 * append/remove ids in any order without changing what's actually being scheduled. */
function computeOverridesFingerprint(piles: PreviewPileInput[]): string {
  return JSON.stringify(
    piles.map((p) => [p.checklistPileId, [...(p.stepTrackOverrides ?? [])].sort()]),
  );
}

// ─── Reference-data fetches ───────────────────────────────────────────────────
// Split out so a caller (e.g. the plan-generation wizard) can fetch these once
// per session and pass them back in via buildPlanRowsForPiles's `referenceData`
// option — piling_steps, duration templates, and non-working windows are 100%
// static for the duration of a wizard session; nothing about them changes just
// because the user picked a different Rig/Crane tile.

export interface PlanTemplateRow {
  id: string;
  stepId: string;
  dimensionId: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
}

export interface PlanRawWindow {
  id: string;
  label: string;
  behavior: string;
  startTime: string;
  endTime: string;
}

type Db = Awaited<ReturnType<typeof initDb>>;

// FIX: piling_step_duration_templates has no site_id column — it's scoped to
// a site indirectly through dimensionId -> piling_dimensions.site_id.
async function fetchTemplateRows(db: Db, siteId: string): Promise<PlanTemplateRow[]> {
  return db
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
}

async function fetchRawWindows(db: Db, siteId: string, shiftTypeId?: string): Promise<PlanRawWindow[]> {
  if (shiftTypeId) {
    return getNonWorkingWindowsByShift(shiftTypeId);
  }
  const shiftRows = await db
    .select({ id: pilingShiftTypes.id })
    .from(pilingShiftTypes)
    .where(eq(pilingShiftTypes.siteId, siteId))
    .all();
  const shiftIds = shiftRows.map((s) => s.id);
  if (shiftIds.length === 0) return [];
  return db
    .select({
      id: pilingNonWorkingWindows.id,
      label: pilingNonWorkingWindows.label,
      behavior: pilingNonWorkingWindows.behavior,
      startTime: pilingNonWorkingWindows.startTime,
      endTime: pilingNonWorkingWindows.endTime,
    })
    .from(pilingNonWorkingWindows)
    .where(inArray(pilingNonWorkingWindows.shiftTypeId, shiftIds))
    .all();
}

/** Fetches the two reference-data pieces that are cheap to cache for a whole
 * wizard session (step definitions are already loaded separately by callers
 * like GeneratePlanScreen, via getSteps() — no need to duplicate that here). */
export async function fetchPlanReferenceData(options: {
  siteId: string;
  shiftTypeId?: string;
}): Promise<{ templateRows: PlanTemplateRow[]; rawWindows: PlanRawWindow[] }> {
  const db = await initDb();
  const [templateRows, rawWindows] = await Promise.all([
    fetchTemplateRows(db, options.siteId),
    fetchRawWindows(db, options.siteId, options.shiftTypeId),
  ]);
  return { templateRows, rawWindows };
}

/**
 * Schedules ONE machine-sharing component's piles in total isolation — Pass 1 (resolve each
 * pile's steps to concrete assignedMachineIds) followed by Pass 2 (greedily schedule whichever
 * unscheduled pile's next step is ready soonest). Calling this with every pile in the plan
 * reproduces the full-recompute result exactly; calling it with just one component's piles
 * (see partitionIntoComponents()) produces exactly the same rows for those piles as the full
 * run would, since a component never shares a machine with any pile outside it. `piles` must
 * be a filtered (not re-sorted) slice of the original array — Pass 2's tie-break when two
 * piles are ready at the exact same instant is "first in original order wins", which only
 * holds if relative order is preserved.
 */
function scheduleComponent(
  piles: PreviewPileInput[],
  pileSteps: PilingStep[],
  templateMap: Map<string, { durationMinutes: number; bufferBeforeMinutes: number }>,
  rawWindows: PlanRawWindow[],
  dayBase: Date,
  planStart: Date,
  planEnd: Date,
  now: number,
): { rows: PreviewPlanStep[]; warningPileIds: string[]; windowsByMachineId: Record<string, EffectivePlanWindow[]> } {
  const rows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];

  // ── Pass 1: resolve each pile's applicable/remaining steps up front, all the way
  // to a concrete assignedMachineId (never just a track name) — see
  // resolveStepExecution() above. Everything past this point schedules machines,
  // not tracks, and never re-derives an override.
  interface PileScheduleData {
    pile: PreviewPileInput;
    dimensionId: string;
    remainingSteps: ResolvedPileStep[];
  }

  interface ResolvedPileStep {
    step: { id: string; stepName: string; sequenceOrder: number };
    /** The step definition's nominal track — kept for traceability/logging only. */
    businessTrack: string;
    /** Which track actually executes this step — feeds the pushed row's `track`. */
    executionTrack: string;
    assignedMachineId: string;
  }

  const perPileData: PileScheduleData[] = [];

  for (const pile of piles) {
    const { pileIdCode, dimensionId } = pile;

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
    const applicableSteps = resumeOrder === undefined
      ? activeSteps
      : activeSteps.filter((step) => step.sequenceOrder >= resumeOrder);

    const remainingSteps: ResolvedPileStep[] = [];
    for (const step of applicableSteps) {
      const { businessTrack, executionTrack, assignedMachineId } = resolveStepExecution(pile, step);
      if (!assignedMachineId) {
        console.warn(
          `[planner] Pile ${pile.pileIdCode} has no machine assigned for track ${executionTrack} ` +
            `(step "${step.stepName}") — skipping this step.`,
        );
        warningPileIds.push(pile.checklistPileId);
        continue;
      }
      remainingSteps.push({
        step: { id: step.id, stepName: step.stepName, sequenceOrder: step.sequenceOrder },
        businessTrack,
        executionTrack,
        assignedMachineId,
      });
    }

    perPileData.push({
      pile,
      dimensionId,
      remainingSteps,
    });
  }

  // machineId -> next-free timestamp — a single flat pool. Every resolved step
  // already carries its own assignedMachineId, so there's no need to group by
  // track anymore; seed it (and one non-working-window set per physical machine —
  // skipNonWorkingWindows mutates AFTER_CURRENT_STEP windows in place, and two
  // different machines must not observe each other's mutations) from whichever
  // machines actually turned up across all piles' resolved steps.
  const machinePools = new Map<string, Date>();
  const machineWindows = new Map<string, EffectiveWindow[]>();
  for (const { remainingSteps } of perPileData) {
    for (const rs of remainingSteps) {
      if (!machinePools.has(rs.assignedMachineId)) machinePools.set(rs.assignedMachineId, new Date(planStart));
      if (!machineWindows.has(rs.assignedMachineId)) {
        machineWindows.set(rs.assignedMachineId, resolveWindows(rawWindows, dayBase));
      }
    }
  }

  // ── Pass 2: greedily schedule whichever pile's next step can start soonest ─

  // Once less than this much time is left in the plan's 24h window, don't start
  // any further step for a pile — it's deferred to tomorrow's plan and picked up
  // there by resumeWorkService from whatever actualStart/actualEnd gets logged
  // on site. A step already past this cutoff when it starts is still scheduled
  // to its full natural length (may run past planEnd) rather than being cut off
  // mid-step.
  const NO_NEW_STEP_CUTOFF_MINUTES = 30;

  const unscheduled = [...perPileData];
  const readyAt = (p: PileScheduleData): Date => {
    const next = p.remainingSteps[0];
    if (!next) return new Date(planStart);
    return machinePools.get(next.assignedMachineId) ?? new Date(planStart);
  };

  while (unscheduled.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < unscheduled.length; i++) {
      if (readyAt(unscheduled[i]).getTime() < readyAt(unscheduled[bestIdx]).getTime()) {
        bestIdx = i;
      }
    }
    const { pile, dimensionId, remainingSteps } = unscheduled.splice(bestIdx, 1)[0];

    // Walk this pile's steps in sequence_order across all machines in one pass —
    // no "finish RIG before starting CRANE" special case. Each step starts at
    // max(its own machine's free time, this pile's previous-step end).
    let pileCursor = new Date(planStart);
    for (const resolvedStep of remainingSteps) {
      const { step, businessTrack, executionTrack, assignedMachineId } = resolvedStep;
      const poolFreeAt = machinePools.get(assignedMachineId) ?? new Date(planStart);
      const stepStart = maxDate(poolFreeAt, pileCursor);

      const minutesLeftInWindow = (planEnd.getTime() - stepStart.getTime()) / 60000;
      if (minutesLeftInWindow <= NO_NEW_STEP_CUTOFF_MINUTES) {
        // Not enough of the window left to start another step — stop planning
        // this pile here; remaining steps carry over to the next planning cycle.
        break;
      }

      const stepEnd = scheduleOneStep(
        step,
        businessTrack,
        executionTrack,
        assignedMachineId,
        stepStart,
        dimensionId,
        templateMap,
        machineWindows.get(assignedMachineId)!,
        pile.checklistPileId,
        now,
        rows,
        poolFreeAt,
        planEnd,
        pile.resumeWork,
      );
      machinePools.set(assignedMachineId, stepEnd);
      pileCursor = stepEnd;
    }
  }

  const windowsByMachineId: Record<string, EffectivePlanWindow[]> = {};
  for (const [machineId, windows] of machineWindows) {
    windowsByMachineId[machineId] = windows
      .map((w) => ({
        id: w.id,
        label: w.label,
        start: toLocalIsoString(w.start),
        end: toLocalIsoString(w.end),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  return { rows, warningPileIds, windowsByMachineId };
}

async function buildPlanRowsForPiles(options: {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
  /** Pre-fetched, session-cached reference data — see fetchPlanReferenceData().
   * Any field left out falls back to fetching it here, so existing callers
   * that don't pass this at all keep working unchanged. */
  referenceData?: {
    allSteps?: PilingStep[];
    templateRows?: PlanTemplateRow[];
    rawWindows?: PlanRawWindow[];
  };
  /** Previous call's result, reused for any component whose piles' stepTrackOverrides didn't
   * change — see PlanScheduleCache. Pass null/undefined to always force a full recompute (the
   * one-shot persist path in generatePlan() does this — no repeated-recompute need there). */
  scheduleCache?: PlanScheduleCache | null;
}): Promise<BuildPlanRowsResult> {
  const { piles, planStartTime, siteId, shiftTypeId, selectedStepIds, referenceData, scheduleCache } = options;

  const db = await initDb();

  // These three are mutually independent (none reads another's result), and
  // 100% static for a whole wizard session — fetched in parallel, and skipped
  // entirely for whichever pieces the caller already has cached.
  const [allSteps, templateRows, rawWindows] = await Promise.all([
    referenceData?.allSteps
      ? Promise.resolve(referenceData.allSteps)
      : db.select().from(pilingSteps).orderBy(pilingSteps.sequenceOrder).all(),
    referenceData?.templateRows
      ? Promise.resolve(referenceData.templateRows)
      : fetchTemplateRows(db, siteId),
    referenceData?.rawWindows
      ? Promise.resolve(referenceData.rawWindows)
      : fetchRawWindows(db, siteId, shiftTypeId),
  ]);

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet
    ? allSteps.filter((s) => selectedStepSet.has(s.id))
    : allSteps;

  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  const now = Date.now();
  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);
  const planEnd = new Date(planEndTime(planStart.toISOString()));

  // Partition into machine-sharing components once per call (cheap — O(piles), never itself
  // cached) — see partitionIntoComponents(). A fingerprint match means every component's
  // membership and non-override inputs are unchanged from the cached run, so only the
  // component(s) whose piles' overrides actually differ need to be rescheduled.
  const componentIdByPileId = partitionIntoComponents(piles);
  const pilesByComponent = new Map<string, PreviewPileInput[]>();
  for (const pile of piles) {
    const componentId = componentIdByPileId.get(pile.checklistPileId)!;
    const list = pilesByComponent.get(componentId);
    if (list) list.push(pile);
    else pilesByComponent.set(componentId, [pile]);
  }

  const fingerprint = computeFingerprint(piles, planStartTime, siteId, shiftTypeId, selectedStepIds);
  const cacheUsable = scheduleCache?.fingerprint === fingerprint;

  const planRows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];
  const windowsByMachineId: Record<string, EffectivePlanWindow[]> = {};
  const componentResults: PlanScheduleCache['componentResults'] = {};

  for (const [componentId, componentPiles] of pilesByComponent) {
    const overridesFingerprint = computeOverridesFingerprint(componentPiles);
    const cached = cacheUsable ? scheduleCache!.componentResults[componentId] : undefined;
    const result =
      cached?.overridesFingerprint === overridesFingerprint
        ? cached
        : {
            overridesFingerprint,
            ...scheduleComponent(componentPiles, pileSteps, templateMap, rawWindows, dayBase, planStart, planEnd, now),
          };
    componentResults[componentId] = result;
    planRows.push(...result.rows);
    warningPileIds.push(...result.warningPileIds);
    Object.assign(windowsByMachineId, result.windowsByMachineId);
  }

  // Dev-time sanity check (design invariant: at most one continuing step per pile per day, and
  // it's always the last one by sequenceOrder). Structurally guaranteed by scheduleComponent's
  // loop — this is cheap insurance against a future regression, not required for correctness
  // today. Runs once over the final merged rows regardless of which components were cache
  // hits vs freshly computed — it's inherently per-pile, so this is correct either way and also
  // re-validates cached piles against a future bug in the merge/reuse logic itself.
  const rowsByPile = new Map<string, PreviewPlanStep[]>();
  for (const row of planRows) {
    const list = rowsByPile.get(row.checklistPileId);
    if (list) list.push(row);
    else rowsByPile.set(row.checklistPileId, [row]);
  }
  for (const [pileId, rows] of rowsByPile) {
    const continuingRows = rows.filter((r) => isContinuingStep(r));
    if (continuingRows.length > 1) {
      console.warn(`[planner] Pile ${pileId} has more than one continuing step — expected at most one.`);
      continue;
    }
    if (continuingRows.length === 1) {
      const maxSequenceOrder = Math.max(...rows.map((r) => r.sequenceOrder));
      if (continuingRows[0].sequenceOrder !== maxSequenceOrder) {
        console.warn(
          `[planner] Pile ${pileId}'s continuing step is not its last step by sequenceOrder.`,
        );
      }
    }
  }

  return { planRows, warningPileIds, windowsByMachineId, scheduleCache: { fingerprint, componentResults } };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratePlanPreviewOptions {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
  /** Pre-fetched, session-cached reference data — see fetchPlanReferenceData(). */
  referenceData?: {
    allSteps?: PilingStep[];
    templateRows?: PlanTemplateRow[];
    rawWindows?: PlanRawWindow[];
  };
  /** Previous call's BuildPlanRowsResult.scheduleCache — reused for any machine-sharing
   * component whose piles' stepTrackOverrides didn't change since that call. See
   * PlanScheduleCache. Omit to always fully recompute. */
  scheduleCache?: PlanScheduleCache | null;
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