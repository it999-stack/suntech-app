// src/services/planner/planScheduler.ts
// The greedy scheduling engine — see pilingPlannerService.ts for the
// algorithm overview.

import type { PilingStep } from '@db/schema';
import { toLocalIsoString } from '@utils/formatTime';
import { generateId } from '@utils/helpers';
import { templateKey } from '@/services/pileApplicableSteps';
import { resolveWindows, skipNonWorkingWindows } from './planWindows';
import { resolveStepExecution } from './planResources';
import type { EffectiveWindow, PreviewPileInput, PreviewPlanStep, EffectivePlanWindow, PlanRawWindow } from './planTypes';

function maxDate(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function scheduleOneStep(
  step: { id: string; stepName: string; sequenceOrder: number; isSplittable?: boolean },
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
  const tmpl = templateMap.get(templateKey(dimId, step.id));
  const isResumeStep = resumeWork?.stepId === step.id;
  // No 60-minute default any more: a step with no duration template for this
  // pile's dimension is not schedulable at all (the server rejects such a plan
  // with a 400, and Pass 1 below filters those steps out before they reach
  // here). Reaching this throw would mean Pass 1's applicability filter and
  // this lookup disagree — an invariant violation, not a case to paper over
  // with an invented duration.
  const durationMinutes = isResumeStep ? resumeWork.remainingMinutes : tmpl?.durationMinutes;
  if (durationMinutes == null) {
    throw new Error(
      `[planner] No duration template for step "${step.stepName}" on dimension ${dimId} ` +
        `(checklist pile ${checklistPileId}).`,
    );
  }
  const bufferBefore = isResumeStep
    ? (resumeWork.bufferMinutes ?? 0)
    : (tmpl?.bufferBeforeMinutes ?? 0);
  // effectiveBuffer, not bufferBefore: Phase 1 drops the buffer when a break
  // interrupted the setup and the machine then sat idle through the whole
  // window. Recording the requested value instead of the effective one would
  // make plannedStart + bufferMinutes disagree with the schedule — and that
  // sum is exactly what the UI renders as the work start.
  const { start, end, bufferMinutes: effectiveBuffer } = skipNonWorkingWindows(
    startFrom,
    bufferBefore,
    durationMinutes,
    windows,
    step.isSplittable ?? true,
  );

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
    bufferMinutes: effectiveBuffer,
    assignedMachineId: machineId,
    createdAt: now,
    stepName: step.stepName,
    track: executionTrack,
    businessTrack,
    sequenceOrder: step.sequenceOrder,
  });
  return end;
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
export function scheduleComponent(
  piles: PreviewPileInput[],
  pileSteps: PilingStep[],
  templateMap: Map<string, { durationMinutes: number; bufferBeforeMinutes: number }>,
  rawWindows: PlanRawWindow[],
  dayBase: Date,
  planStart: Date,
  planEnd: Date,
  now: number,
  noNewStepCutoffMinutes: number,
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
    /** Continuing existing progress (resumeWork) — prioritized ahead of fresh piles in
     * Pass 2's pick order, see priorityKey() below. Mirrors the server's is_resuming. */
    isResuming: boolean;
  }

  interface ResolvedPileStep {
    step: { id: string; stepName: string; sequenceOrder: number; isSplittable?: boolean };
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

    // The pile's applicable steps: the in-scope catalog ∩ the duration
    // templates configured for its dimension. A step with no template is NOT
    // applicable — there is no duration to schedule it with, and nothing
    // invents one (see scheduleOneStep). The old "fall back to the unfiltered
    // catalog and use 60 minutes each" branch is gone: it produced a plan the
    // server now rejects with a 400, and silently committed the site to
    // timings nobody configured.
    const activeSteps = pileSteps.filter((s) => templateMap.has(templateKey(dimensionId, s.id)));

    if (activeSteps.length === 0) {
      console.warn(
        `[planner] No duration templates for pile ${pileIdCode} (dimension ${dimensionId}) — cannot schedule it`,
      );
      warningPileIds.push(pile.checklistPileId);
      continue;
    }

    const resumeOrder = pile.resumeWork
      ? activeSteps.find((step) => step.id === pile.resumeWork!.stepId)?.sequenceOrder
      : undefined;

    // A resuming pile whose resume step isn't applicable (its template was
    // removed, say) must not be planned: resumeOrder would be undefined, and
    // the pile would silently be re-planned from its FIRST step, re-scheduling
    // work already completed on a previous day.
    if (pile.resumeWork && resumeOrder === undefined) {
      console.warn(
        `[planner] Pile ${pileIdCode} resumes from step ${pile.resumeWork.stepId}, which has no duration ` +
          `template for dimension ${dimensionId} — cannot schedule it`,
      );
      warningPileIds.push(pile.checklistPileId);
      continue;
    }

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
        step: {
          id: step.id,
          stepName: step.stepName,
          sequenceOrder: step.sequenceOrder,
          isSplittable: step.isSplittable,
        },
        businessTrack,
        executionTrack,
        assignedMachineId,
      });
    }

    perPileData.push({
      pile,
      dimensionId,
      remainingSteps,
      isResuming: resumeOrder !== undefined,
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

  const unscheduled = [...perPileData];
  const readyAt = (p: PileScheduleData): Date => {
    const next = p.remainingSteps[0];
    if (!next) return new Date(planStart);
    return machinePools.get(next.assignedMachineId) ?? new Date(planStart);
  };

  // Resuming piles (real invested progress) always beat fresh piles, tie-broken by raw
  // readiness within each group. Without this, a pile resuming on a machine that's currently
  // busy (from its own prior actual work) looks "less ready" than fresh piles whose first step
  // happens to sit on a more-available machine — those fresh piles then queue up ahead of it,
  // and by the time the loop reaches the resuming pile, their combined backlog can push its own
  // machine's availability past the window entirely. Mirrors the server's priority_key exactly
  // (plan_generation_service.py) — doesn't change outcomes for piles on genuinely independent
  // machines; order only matters when piles actually compete for the same machine.
  const isBetter = (a: PileScheduleData, b: PileScheduleData): boolean => {
    const aRank = a.isResuming ? 0 : 1;
    const bRank = b.isResuming ? 0 : 1;
    if (aRank !== bRank) return aRank < bRank;
    return readyAt(a).getTime() < readyAt(b).getTime();
  };

  while (unscheduled.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < unscheduled.length; i++) {
      if (isBetter(unscheduled[i], unscheduled[bestIdx])) {
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
      if (minutesLeftInWindow <= noNewStepCutoffMinutes) {
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
