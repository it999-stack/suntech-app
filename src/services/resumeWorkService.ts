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
  pilingMachines,
  type PilingChecklistPile,
  type PileActualStepSegment,
} from '@db/schema';
import { getChecklistsBySite, getChecklistPiles } from '@repositories/checklistRepository';
import {
  getActualStepsForChecklist,
  getActualStepsForChecklistPile,
  getPlanStepsForChecklist,
  upsertActualStep,
  type ActualStepWithMeta,
} from '@repositories/planRepository';
import { getSegmentsForChecklistPiles } from '@repositories/segmentsRepository';
import { enqueueChecklistSync } from '@repositories/syncQueueRepository';
import {
  closeLastLiveSegment,
  syncActualRollupFromSegments,
} from '@services/stepSegmentActions';
import {
  buildTemplateMinutesMap,
  getApplicableSteps,
  templateKey,
} from '@/services/pileApplicableSteps';
import type { PendingCloseOut } from '@app-types/plan';
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

/** One previous-day work session on the step being resumed — enough to render
 * it, not the full row. Machine number is resolved here so the modal doesn't
 * need its own machine lookup. */
export interface CarriedSegment {
  id: string;
  startedAt: string;
  endedAt: string | null;
  machineNo: string | null;
  outcome: 'PARTIAL' | 'FINAL' | null;
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
  /** The in-progress step's own work sessions from the previous day(s), oldest
   * first. Empty for a step that was never split between machines — its
   * pastActualStart alone is then the whole record. */
  carriedSegments: CarriedSegment[];
  /** Minutes actually worked across those sessions, EXCLUDING the gaps
   * between them. Undefined when there are no sessions to total. */
  workedMinutes?: number;
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
  /** That checklist's plan window — bounds a close-out time to the day it
   * actually belongs to. Null on legacy checklists generated before the
   * window was persisted; callers must treat it as "unbounded", not as zero. */
  pastPlanStartTime: string | null;
  pastPlanEndTime: string | null;
}

/** Minutes actually worked across a step's sessions, EXCLUDING the gaps
 * between them. An open session contributes nothing — it has no settled
 * length, and guessing one would silently inflate "work already done" and so
 * deflate the remaining-time seed. */
function sumCarriedMinutes(segments: CarriedSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    if (!seg.endedAt) continue;
    total += Math.round(
      (new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()) / 60000,
    );
  }
  return total;
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
  const planWindowById = new Map(
    checklists.map((c) => [c.id, { start: c.planStartTime, end: c.planEndTime }]),
  );

  const checklistIds = new Set([...cpById.values()].map((cp) => cp.checklistId));
  // Work sessions for every checklist-pile row these piles have ever had,
  // keyed `${checklistPileId}:${stepId}` — the same key PlanContext uses, so
  // the two never drift into disagreeing about what a session belongs to.
  const segmentsByStepKey = new Map<string, PileActualStepSegment[]>();
  for (const seg of await getSegmentsForChecklistPiles([...cpById.keys()])) {
    const key = `${seg.checklistPileId}:${seg.stepId}`;
    const list = segmentsByStepKey.get(key) ?? [];
    list.push(seg);
    segmentsByStepKey.set(key, list);
  }
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

  const db = await initDb();
  const pileRows = await db
    .select()
    .from(pilingPiles)
    .where(inArray(pilingPiles.id, [...anchorCpByPile.keys()]))
    .all();
  const pileById = new Map(pileRows.map((p) => [p.id, p]));

  const allSteps = await db.select().from(pilingSteps).orderBy(pilingSteps.sequenceOrder).all();

  // Machine numbers for labelling the carried sessions. Loaded once for the
  // whole scan rather than per pile — a site has a handful of machines and
  // this runs over every pile being considered for a new plan.
  const machineRows = await db
    .select({ id: pilingMachines.id, machineNo: pilingMachines.machineNo })
    .from(pilingMachines)
    .where(eq(pilingMachines.siteId, siteId))
    .all();
  const machineNoById = new Map(machineRows.map((m) => [m.id, m.machineNo]));

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
  const templateMap = buildTemplateMinutesMap(templateRows);

  const pendingWorkItems: ResumeWorkInfo[] = [];
  const completedPileIds: string[] = [];
  for (const [pileId, anchorCp] of anchorCpByPile) {
    const dimensionId = pileById.get(pileId)?.dimensionId;
    // The pile's applicable step set — catalog ∩ templates for its dimension,
    // shared with usePileGroups/AddPileModal (see pileApplicableSteps.ts).
    const referenceSteps = getApplicableSteps(allSteps, dimensionId, templateMap);

    // No applicable steps at all (unknown dimension, or a dimension with no
    // duration templates configured). Deliberately neither "pending" nor
    // "completed": reporting it complete would silently drop the pile from
    // every future plan, and there is no step to resume from either. It stays
    // assignable, and plan generation reports the missing templates for real
    // (see findMissingTemplateCoverage / planScheduler's warningPileIds).
    if (!referenceSteps.length) continue;

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
      completedPileIds.push(pileId);
      continue;
    }

    const actualStep = actualByStepId.get(firstIncomplete.id);

    // The in-progress step's own work sessions from the previous day(s).
    // Read off the checklist-pile row the step's actual record actually lives
    // on — the same row `resolvedCp` resolves to below — because a pile that
    // carried over more than once has several, and the sessions belong to
    // whichever one recorded the work.
    const carriedSegments: CarriedSegment[] = (
      actualStep
        ? (segmentsByStepKey.get(`${actualStep.checklistPileId}:${firstIncomplete.id}`) ?? [])
        : []
    ).map((seg) => ({
      id: seg.id,
      startedAt: seg.startedAt,
      endedAt: seg.endedAt,
      machineNo: (seg.assignedMachineId && machineNoById.get(seg.assignedMachineId)) || null,
      outcome: seg.outcome ?? null,
    }));
    // The checklist-pile row to resume into: wherever firstIncomplete's own
    // (in-progress) actual record lives, or the anchor row as a fallback
    // when the step hasn't been touched at all yet.
    const resolvedCp = (actualStep && cpById.get(actualStep.checklistPileId)) || anchorCp;
    // The step's whole expected length. Still a picker SEED the supervisor can
    // overwrite, not a scheduling input — unlike planScheduler, where the same
    // default was removed outright.
    const templateMinutes =
      (dimensionId ? templateMap.get(templateKey(dimensionId, firstIncomplete.id)) : undefined) ?? 60;

    // Once a step has recorded work sessions, how much was actually done is
    // known — so the seed is what is LEFT rather than the whole step. Without
    // this the supervisor is offered the full duration for a step that is
    // already most of the way done, and has to correct it every time.
    //
    // Still only a seed: the sessions say how long the machines ran, not how
    // much of the pile that got through. Floored at 5 because a step being
    // resumed at all has work remaining by definition.
    const workedMinutes = carriedSegments.length ? sumCarriedMinutes(carriedSegments) : undefined;
    const remainingMinutes =
      workedMinutes !== undefined ? Math.max(5, templateMinutes - workedMinutes) : templateMinutes;

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
          // Same seed-not-input reasoning as remainingMinutes above.
          remainingMinutes:
            (dimensionId ? templateMap.get(templateKey(dimensionId, nextStepDef.id)) : undefined) ?? 60,
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
      carriedSegments,
      workedMinutes,
      completedStepNames,
      completedSteps,
      nextStep,
      checklistId: resolvedCp.checklistId,
      checklistDate: checklistDateById.get(resolvedCp.checklistId) ?? beforeDate,
      pastPlanStartTime: planWindowById.get(resolvedCp.checklistId)?.start ?? null,
      pastPlanEndTime: planWindowById.get(resolvedCp.checklistId)?.end ?? null,
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
/**
 * Writes every close-out the wizard accumulated, once the plan it belongs to
 * has actually been generated. Call this ONLY after generation succeeds — the
 * whole point of deferring is that abandoning the wizard leaves the historical
 * checklist untouched (see PendingCloseOut).
 *
 * Sequential rather than concurrent: these are SQLite writes through the same
 * connection, and the enqueue is deduped across piles because several piles
 * confirmed in one session commonly share a single historical checklist —
 * previously each confirmation enqueued it again.
 */
export async function flushResumeCloseOuts(closeOuts: PendingCloseOut[]): Promise<void> {
  const checklistIds = new Set<string>();
  for (const c of closeOuts) {
    await closeOutResumeStep(
      c.pastChecklistPileId,
      c.stepId,
      c.pastActualStart,
      c.pastEndIso,
      c.remarks || undefined,
    );
    if (c.checklistId) checklistIds.add(c.checklistId);
  }
  // Enqueued after every write lands, so a failure part-way through can't
  // queue a push for rows that were never written.
  for (const checklistId of checklistIds) {
    await enqueueChecklistSync(checklistId);
  }
}

export async function closeOutResumeStep(
  pastChecklistPileId: string,
  stepId: string,
  pastActualStart: string | null,
  actualEnd: string,
  remarks?: string,
): Promise<void> {
  const remarksValue = remarks || null;

  // Once a step has recorded work sessions, its roll-up is DERIVED from them
  // server-side and writing actual_end on the roll-up directly gets silently
  // reverted the next time this checklist's segments sync — see
  // services/stepSegmentActions.ts for the full explanation. Closing the
  // step's last live session (and letting the roll-up follow from it) is
  // what survives that recompute; a step with no sessions falls through to
  // the plain roll-up write below, exactly as before.
  const closedASession = await closeLastLiveSegment(pastChecklistPileId, stepId, {
    endedAtIso: actualEnd,
    notes: remarksValue,
  });
  if (closedASession) {
    const existingRows = await getActualStepsForChecklistPile(pastChecklistPileId);
    const existing = existingRows.find((a) => a.stepId === stepId);
    await syncActualRollupFromSegments(pastChecklistPileId, stepId, existing, remarksValue);
    return;
  }

  await upsertActualStep({
    id: generateId(),
    checklistPileId: pastChecklistPileId,
    stepId,
    actualStart: pastActualStart,
    actualEnd,
    remarks: remarksValue,
  });
}
