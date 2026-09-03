// src/services/resumeWorkService.ts
//
// Live computation of "which step should this pile resume from," derived
// from the actual steps recorded across ALL of the pile's past checklists —
// not just its most recent one, since a pile's progress can straddle more
// than one day/junction row. Replaces the old pile_work_progress table,
// which had no reliable writer in production and could end up pointing at
// the wrong step.
//
// This service only locates the resume point (which step, and whether it
// was genuinely started). It does not estimate remaining duration from
// planned/actual timestamps — elapsed real time doesn't reliably track
// work completed on site (pauses, breakdowns, multi-day continuations).
// The supervisor enters the real remaining duration via
// ResumeTimeConfirmModal before the plan is generated.

import { eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingPiles,
  pilingSteps,
  pilingStepDurationTemplates,
  pilingDimensions,
  type PilingChecklistPile,
} from '@db/schema';
import { getChecklistsBySite, getChecklistPiles } from '@repositories/checklistRepository';
import {
  getActualStepsForChecklist,
  getPlanStepsForChecklist,
  upsertActualStep,
  type ActualStepWithMeta,
} from '@repositories/planRepository';
import { generateId } from '@utils/helpers';

/** One step already completed (actualEnd set) on the pile's most recent past
 * checklist — carries both plan and actual times so callers (Preview, Log
 * Actuals) can display a real historical record instead of just a name. */
export interface CompletedStepInfo {
  stepId: string;
  stepName: string;
  track: string;
  sequenceOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface ResumeWorkInfo {
  pileId: string;
  stepId: string;
  stepName: string;
  remainingMinutes: number;
  lastRigId: string | null;
  lastCraneId: string | null;
  /** True if the incomplete step already has an actualStart — genuinely "in progress", not just unstarted. */
  wasStarted: boolean;
  /** The historical checklist-pile id the in-progress step belongs to — needed to write remarks back. */
  pastChecklistPileId: string;
  pastActualStart: string | null;
  /** Names of steps already completed on the pile's most recent checklist, for display context. */
  completedStepNames: string[];
  /** Same steps as completedStepNames, with plan + actual times — for Preview/Log Actuals display. */
  completedSteps: CompletedStepInfo[];
  /** The step immediately after the in-progress one, if any — used when the
   * supervisor confirms the in-progress step was actually fully completed on
   * the previous day: the resume point advances here (fresh, full duration)
   * instead of re-planning the already-finished step. Null when
   * firstIncomplete was the last applicable step (pile is then fully done in
   * that case). */
  nextStep: { stepId: string; stepName: string; remainingMinutes: number } | null;
  /** The historical checklist this pending work belongs to, and its date —
   * lets a caller (e.g. HomeScreen's "pending from previous day" card) link
   * straight back to that day's Fill Actuals screen. */
  checklistId: string;
  checklistDate: string;
}

export interface ResumeWorkScanResult {
  pendingWorkItems: ResumeWorkInfo[];
  /** Piles whose most recent checklist entry has every applicable step marked
   * complete (actualEnd set) — already fully done, must not be re-offered as
   * assignable in a new plan. */
  completedPileIds: string[];
}

export async function findResumeWorkForPiles(
  siteId: string,
  pileIds: string[],
  beforeDate: string,
): Promise<ResumeWorkScanResult> {
  const empty: ResumeWorkScanResult = { pendingWorkItems: [], completedPileIds: [] };
  if (!pileIds.length) return empty;

  const checklists = (await getChecklistsBySite(siteId))
    .filter((c) => c.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!checklists.length) return empty;

  // Walk newest-to-oldest, collecting EVERY checklist-pile row per pile — a
  // pile's real progress can straddle more than one day/junction row (a new
  // pil_checklist_piles row is created each time a pile carries over into a
  // new plan), and earlier steps completed under an older row must still be
  // recognized as done. The most-recent row per pile is kept separately as
  // the "anchor" — the default rig/crane and the fallback resume point for
  // steps nobody has touched yet.
  const pileIdSet = new Set(pileIds);
  const anchorCpByPile = new Map<string, PilingChecklistPile>();
  const cpRowsByPile = new Map<string, PilingChecklistPile[]>();
  const cpById = new Map<string, PilingChecklistPile>();
  for (const checklist of checklists) {
    const cpRows = await getChecklistPiles(checklist.id);
    for (const cp of cpRows) {
      if (!pileIdSet.has(cp.pileId)) continue;
      cpById.set(cp.id, cp);
      if (!anchorCpByPile.has(cp.pileId)) anchorCpByPile.set(cp.pileId, cp);
      const list = cpRowsByPile.get(cp.pileId) ?? [];
      list.push(cp);
      cpRowsByPile.set(cp.pileId, list);
    }
  }
  if (!anchorCpByPile.size) return empty;

  const checklistDateById = new Map(checklists.map((c) => [c.id, c.date]));

  // Fetch actual + plan steps once per distinct checklist involved.
  const checklistIds = new Set([...cpById.values()].map((cp) => cp.checklistId));
  const actualStepsByCpId = new Map<string, ActualStepWithMeta[]>();
  const planStepByCpAndStepId = new Map<string, Map<string, { plannedStart: string; plannedEnd: string | null }>>();
  for (const checklistId of checklistIds) {
    const actualSteps = await getActualStepsForChecklist(checklistId);
    for (const a of actualSteps) {
      const list = actualStepsByCpId.get(a.checklistPileId) ?? [];
      list.push(a);
      actualStepsByCpId.set(a.checklistPileId, list);
    }

    const planSteps = await getPlanStepsForChecklist(checklistId);
    for (const p of planSteps) {
      const map = planStepByCpAndStepId.get(p.checklistPileId) ?? new Map();
      map.set(p.stepId, { plannedStart: p.plannedStart, plannedEnd: p.plannedEnd });
      planStepByCpAndStepId.set(p.checklistPileId, map);
    }
  }

  // Applicable step catalog per pile's dimension — checked in full, not just
  // whatever happened to get a pile_plan_steps row, so steps the planner
  // never reached (e.g. cut off by the end-of-window rule) still surface as
  // pending next time.
  const db = await initDb();
  const pileRows = await db
    .select()
    .from(pilingPiles)
    .where(inArray(pilingPiles.id, [...anchorCpByPile.keys()]))
    .all();
  const pileById = new Map(pileRows.map((p) => [p.id, p]));

  const allSteps = await db.select().from(pilingSteps).orderBy(pilingSteps.sequenceOrder).all();

  const templateRows = await db
    .select({
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(pilingDimensions, eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id))
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t.durationMinutes]));

  const pendingWorkItems: ResumeWorkInfo[] = [];
  const completedPileIds: string[] = [];
  for (const [pileId, anchorCp] of anchorCpByPile) {
    const dimensionId = pileById.get(pileId)?.dimensionId;
    const applicableSteps = dimensionId
      ? allSteps.filter((s) => templateMap.has(`${dimensionId}|${s.id}`))
      : [];
    const referenceSteps = applicableSteps.length > 0 ? applicableSteps : allSteps;

    // Merge actual steps across EVERY checklist-pile row this pile has ever
    // had (not just its most recent one) — a step completed under an older
    // row must still count as done. A given step should only ever be
    // actioned under one row; if it somehow appears under more than one,
    // prefer whichever record is actually completed.
    const actualByStepId = new Map<string, ActualStepWithMeta>();
    for (const cp of cpRowsByPile.get(pileId) ?? [anchorCp]) {
      for (const a of actualStepsByCpId.get(cp.id) ?? []) {
        const existing = actualByStepId.get(a.stepId);
        if (!existing || (!existing.actualEnd && a.actualEnd)) actualByStepId.set(a.stepId, a);
      }
    }

    const firstIncomplete = referenceSteps.find((s) => !actualByStepId.get(s.id)?.actualEnd);
    if (!firstIncomplete) {
      completedPileIds.push(pileId); // fully done — exclude from re-assignment
      continue;
    }

    const actualStep = actualByStepId.get(firstIncomplete.id);
    // The checklist-pile row to resume into: wherever firstIncomplete's own
    // (in-progress) actual record lives, or the anchor row as a fallback
    // when the step hasn't been touched at all yet.
    const resolvedCp = (actualStep && cpById.get(actualStep.checklistPileId)) || anchorCp;
    // Remaining duration is never derived from the historical plan/actual
    // timestamps — only the step's canonical template duration seeds the
    // supervisor's confirmation modal; they enter the real remaining time.
    const remainingMinutes = (dimensionId ? templateMap.get(`${dimensionId}|${firstIncomplete.id}`) : undefined) ?? 60;

    const completedStepNames = referenceSteps
      .filter((s) => actualByStepId.get(s.id)?.actualEnd)
      .map((s) => s.stepName);

    const completedSteps: CompletedStepInfo[] = referenceSteps
      .filter((s) => actualByStepId.get(s.id)?.actualEnd)
      .map((s) => {
        const a = actualByStepId.get(s.id)!;
        const p = planStepByCpAndStepId.get(a.checklistPileId)?.get(s.id);
        return {
          stepId: s.id,
          stepName: s.stepName,
          track: s.track,
          sequenceOrder: s.sequenceOrder,
          plannedStart: p?.plannedStart ?? null,
          plannedEnd: p?.plannedEnd ?? null,
          actualStart: a.actualStart,
          actualEnd: a.actualEnd,
        };
      });

    // The step right after the in-progress one — used if the supervisor later
    // confirms firstIncomplete was actually fully finished on the previous
    // day, so the resume point can advance instead of re-planning a finished
    // step.
    const nextIdx = referenceSteps.findIndex((s) => s.id === firstIncomplete.id) + 1;
    const nextStepDef = nextIdx > 0 ? referenceSteps[nextIdx] : undefined;
    const nextStep = nextStepDef
      ? {
          stepId: nextStepDef.id,
          stepName: nextStepDef.stepName,
          remainingMinutes:
            (dimensionId ? templateMap.get(`${dimensionId}|${nextStepDef.id}`) : undefined) ?? 60,
        }
      : null;

    pendingWorkItems.push({
      pileId,
      stepId: firstIncomplete.id,
      stepName: firstIncomplete.stepName,
      remainingMinutes,
      lastRigId: resolvedCp.rigId,
      lastCraneId: resolvedCp.craneId,
      wasStarted: !!actualStep?.actualStart,
      pastChecklistPileId: resolvedCp.id,
      pastActualStart: actualStep?.actualStart ?? null,
      completedStepNames,
      completedSteps,
      nextStep,
      checklistId: resolvedCp.checklistId,
      checklistDate: checklistDateById.get(resolvedCp.checklistId) ?? beforeDate,
    });
  }

  return { pendingWorkItems, completedPileIds };
}

/**
 * Close out the historical (paused) actual-step row a pile is resuming from,
 * writing the real time it stopped (partially completed) or finished (fully
 * completed) on the previous day, plus an optional remarks note.
 * `pastActualStart` must be passed through unchanged — upsertActualStep
 * overwrites actualStart/actualEnd/remarks together, not a partial patch.
 */
export async function closeOutResumeStep(
  pastChecklistPileId: string,
  stepId: string,
  pastActualStart: string | null,
  actualEnd: string,
  remarks?: string,
): Promise<void> {
  await upsertActualStep({
    id: generateId(),
    checklistPileId: pastChecklistPileId,
    stepId,
    actualStart: pastActualStart,
    actualEnd,
    remarks: remarks || null,
  });
}
