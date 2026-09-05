// src/screens/Home/fillActual/usePileGroups.ts
//
// The core join for the Log Actuals screen: merges each checklist-pile's
// APPLICABLE step set with its plan + actual steps (plus any historical steps
// carried over from a prior checklist) into the PileGroup shape the rest of
// the screen renders from, including the breakdown/idle warning flags for its
// current step.
//
// The step list is rooted on the pile's applicable steps — the site step
// catalog intersected with the duration templates for the pile's dimension
// (see services/pileApplicableSteps.ts) — NOT on its plan rows. The scheduler
// stops planning a pile once too little of the 24h window is left, so a pile's
// plan can legitimately cover only 2 of its 5 applicable steps. When actual
// work runs ahead of plan the machine really is free later that same day and
// those extra steps DO get performed, and there was previously nowhere to
// record them: no plan row, no rendered row, no way in.
//
// Planned / Actual / Remaining are therefore three different things here:
//   Planned   — what the scheduler committed to. May cover part of a pile.
//   Actual    — what happened, including steps that were never planned.
//   Remaining — applicable steps with no actualEnd yet.
// An unplanned step has NO planned times, permanently (tomorrow's plan would
// be a new row on a new checklist), so plannedStart/plannedEnd stay undefined
// and are never fabricated — see ActualEntry.plannedStart.

import { useMemo } from 'react';
import { resolveActualTimeAnchor } from '@utils/formatTime';
import { stepWorkStart } from '@utils/helpers';
import { splitStepByInternalWindows } from '@components/plan/generate/preview/previewUtils';
import {
  buildTemplateMinutesMap,
  getApplicableSteps,
  templateKey,
} from '@/services/pileApplicableSteps';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import type { CompletedStepInfo } from '@/services/resumeWorkService';
import type { PlanStepWithMeta, ActualStepWithMeta } from '@repositories/planRepository';
import type {
  PilingChecklistPile,
  PilingDailyChecklist,
  PilingPile,
  PilingStep,
  PilingStepDurationTemplate,
  PilPileMeasurement,
} from '@db/schema';
import type { ActualEntry, PileGroup, PileMeasurementFields } from '@app-types/plan';

type Track = 'RIG' | 'CRANE' | 'COMPRESSOR';

/** Convert ISO timestamp to minutes-since-midnight (used by old components). */
function isoToMinutes(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return undefined;
  }
}

/** Distinct machines that have worked one track's steps on this pile, in
 * the order first assigned — the planned machine, plus any mid-day
 * replacement(s). Historical steps (carried over from a prior checklist)
 * carry no machine info, so they're skipped. */
function machinesWorkedForTrack(
  steps: ActualEntry[],
  track: ActualEntry['track'],
): { id: string; no: string }[] {
  const seen = new Set<string>();
  const result: { id: string; no: string }[] = [];
  for (const s of steps) {
    if (s.isHistorical || s.track !== track || !s.assignedMachineId || !s.assignedMachineNo) continue;
    if (seen.has(s.assignedMachineId)) continue;
    seen.add(s.assignedMachineId);
    result.push({ id: s.assignedMachineId, no: s.assignedMachineNo });
  }
  return result;
}

/** The machine currently responsible for one track's work on this pile —
 * the earliest not-done step's assigned machine, or the last step's if the
 * whole track is done. Always the most recent replacement, if any. Mirrors
 * PileStepsModal.tsx's local getCurrentMachineIdByTrack. */
function currentMachineForTrack(steps: ActualEntry[], track: ActualEntry['track']): string | undefined {
  const trackSteps = steps
    .filter((s) => !s.isHistorical && s.track === track)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  if (!trackSteps.length) return undefined;
  const notDone = trackSteps.find((s) => s.actualEnd === undefined);
  return (notDone ?? trackSteps[trackSteps.length - 1]).assignedMachineId;
}

/**
 * Which of the pile's own machines executes a step of `businessTrack` — the
 * client-side mirror of the server's `_resolve_step_execution` (and of
 * planResources.ts's resolveStepExecution): a RIG-track step runs on the
 * pile's rig; a CRANE-track step runs on its crane, falling back to the rig
 * when the pile has no crane (a rig can perform any CRANE step, never the
 * reverse).
 *
 * Only used for a step with NO plan row — a planned step carries the machine
 * the scheduler actually assigned it, which is authoritative and may since
 * have been swapped by a mid-day replacement.
 *
 * APPROXIMATE for a per-step track override: overrides are a one-off
 * generation-time input that is never persisted anywhere, so a step with no
 * plan row has no record of one and this cannot know whether the supervisor
 * would have moved it onto the rig. It resolves to the crane in that case.
 * COMPRESSOR resolves to nothing — pil_checklist_piles has no compressor
 * column, exactly as before.
 */
function resolveUnplannedMachineId(
  cp: PilingChecklistPile,
  businessTrack: Track,
): { machineId: string | undefined; executionTrack: Track } {
  if (businessTrack === 'RIG') return { machineId: cp.rigId, executionTrack: 'RIG' };
  if (businessTrack === 'CRANE') {
    return cp.craneId
      ? { machineId: cp.craneId, executionTrack: 'CRANE' }
      : { machineId: cp.rigId, executionTrack: 'RIG' };
  }
  return { machineId: undefined, executionTrack: businessTrack };
}

export function usePileGroups(args: {
  checklistPiles: PilingChecklistPile[];
  planSteps: PlanStepWithMeta[];
  actualSteps: ActualStepWithMeta[];
  pileMap: Map<string, PilingPile>;
  machineMap: Map<string, string>;
  machineStatusById: Map<string, string>;
  checklist: PilingDailyChecklist | null;
  windowsByMachineId: Record<string, EffectivePlanWindow[]>;
  completedStepsByPileId: Map<string, CompletedStepInfo[]>;
  /** One-time engineering measurements per physical pile — see
   * pilPileMeasurements in db/schema.ts. Keyed by pileId, not
   * checklistPileId. */
  measurementsByPileId: Map<string, PilPileMeasurement>;
  /** The site's full step catalog, sequence_order ascending. Half of the
   * "applicable steps" intersection this hook is rooted on. */
  allSteps: PilingStep[];
  /** Every duration template for the site — the other half of that
   * intersection, plus the non-binding "~60 min" reference an unplanned step
   * displays instead of a planned range. Passed in (not queried here) to keep
   * this hook a pure function of its arguments. */
  durationTemplates: PilingStepDurationTemplate[];
}): { pileGroups: PileGroup[] } {
  const {
    checklistPiles,
    planSteps,
    actualSteps,
    pileMap,
    machineMap,
    machineStatusById,
    checklist,
    windowsByMachineId,
    completedStepsByPileId,
    measurementsByPileId,
    allSteps,
    durationTemplates,
  } = args;

  const pileGroups = useMemo((): PileGroup[] => {
    if (!checklistPiles.length) return [];

    // Doubles as the applicability lookup and the duration reference — one
    // index, keyed `${dimensionId}|${stepId}`.
    const templateMinutes = buildTemplateMinutesMap(durationTemplates);
    const stepDefById = new Map(allSteps.map((s) => [s.id, s]));

    return checklistPiles.map((cp) => {
      const pile = pileMap.get(cp.pileId);
      const dimensionId = pile?.dimensionId;

      const cpPlanSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === cp.id);

      // Steps completed on a *previous* checklist for this pile — read-only,
      // faded rows (see PileStepsModal) shown alongside today's own steps
      // instead of vanishing just because they predate this checklist.
      const historicalSteps: ActualEntry[] = (completedStepsByPileId.get(cp.pileId) ?? []).map((c) => ({
        stepId: c.stepId,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        stepName: c.stepName,
        track: c.track as Track,
        sequenceOrder: c.sequenceOrder,
        // Left undefined, never 0: a completed step whose own plan row is gone
        // (or which was itself never planned) has no planned time, and 0 would
        // render as midnight.
        plannedStart: isoToMinutes(c.plannedStart),
        plannedEnd: isoToMinutes(c.plannedEnd),
        actualStart: isoToMinutes(c.actualStart),
        actualEnd: isoToMinutes(c.actualEnd),
        plannedStartIso: c.plannedStart ?? undefined,
        plannedEndIso: c.plannedEnd ?? undefined,
        actualStartIso: c.actualStart ?? undefined,
        actualEndIso: c.actualEnd ?? undefined,
        bufferMinutes: 0,
        isHistorical: true,
      }));

      // ── Which steps get a row ──────────────────────────────────────────
      // The applicable set, PLUS any step that already has a plan or actual
      // row but isn't in it (templates edited after generation, a legacy plan
      // generated under the old 60-minute default) — those are real recorded
      // work and must never disappear from the screen just because the
      // catalog moved underneath them.
      //
      // MINUS every historically-completed step: the server truncates today's
      // plan at the resume point, so plan rows naturally exclude them, but the
      // applicable set does not. Without this subtraction each one would get a
      // second, blank, editable row underneath its faded historical one.
      const historicalStepIds = new Set(historicalSteps.map((s) => s.stepId));
      const planByStepId = new Map(cpPlanSteps.map((ps) => [ps.stepId, ps]));
      const actualByStepId = new Map(cpActualSteps.map((a) => [a.stepId, a]));

      const rowStepIds: string[] = [];
      const seenStepIds = new Set<string>();
      for (const stepId of [
        ...getApplicableSteps(allSteps, dimensionId, templateMinutes).map((s) => s.id),
        ...cpPlanSteps.map((ps) => ps.stepId),
        ...cpActualSteps.map((a) => a.stepId),
      ]) {
        if (historicalStepIds.has(stepId) || seenStepIds.has(stepId)) continue;
        seenStepIds.add(stepId);
        rowStepIds.push(stepId);
      }

      // Sorted by sequence order so "previous step" is well-defined for the
      // anchor math below (and for buildActualTimeRules' bounds).
      const mergedSteps = rowStepIds
        .map((stepId) => {
          const def = stepDefById.get(stepId);
          const plan = planByStepId.get(stepId);
          const actual = actualByStepId.get(stepId);
          return {
            stepId,
            def,
            plan,
            actual,
            sequenceOrder: def?.sequenceOrder ?? plan?.sequenceOrder ?? actual?.sequenceOrder ?? 0,
          };
        })
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

      const currentSteps: ActualEntry[] = mergedSteps.map((entry, idx) => {
        const { stepId, def, plan, actual, sequenceOrder } = entry;
        const prev = idx > 0 ? mergedSteps[idx - 1] : null;

        const businessTrack = (def?.track ?? plan?.businessTrack ?? plan?.track ?? actual?.track ?? 'RIG') as Track;
        const unplannedMachine = resolveUnplannedMachineId(cp, businessTrack);
        // A plan row's own assignment wins — it survives mid-day machine
        // replacement, which the track-based resolution above cannot know
        // about. The fallback also covers a legacy plan row with no machine.
        const assignedMachineId = plan?.assignedMachineId ?? unplannedMachine.machineId;
        const assignedMachineNo = assignedMachineId ? machineMap.get(assignedMachineId) : undefined;

        const anchorStep = {
          plannedStart: plan?.plannedStart,
          plannedEnd: plan?.plannedEnd,
          actualStart: actual?.actualStart,
        };
        const planBreaks = plan ? splitStepByInternalWindows(plan, windowsByMachineId)?.breaks : undefined;

        return {
          stepId,
          pileId: cp.pileId,
          pileCode: pile?.pileIdCode ?? cp.pileId,
          stepName: def?.stepName ?? plan?.stepName ?? actual?.stepName ?? '',
          // `track` is which machine type actually executes the step (the
          // plan row's already-resolved execution track, or the resolution
          // above for an unplanned one); `businessTrack` is the step
          // definition's own fixed track.
          track: (plan?.track ?? unplannedMachine.executionTrack) as Track,
          businessTrack,
          sequenceOrder,
          // No plan row means no planned times, ever — undefined, not 0.
          plannedStart: plan ? isoToMinutes(stepWorkStart(plan)) : undefined,
          // Preserve undefined (rather than fabricating midnight) when this
          // step is "continuing" — it never had a committed end time.
          plannedEnd: isoToMinutes(plan?.plannedEnd),
          actualStart: isoToMinutes(actual?.actualStart ?? null),
          actualEnd: isoToMinutes(actual?.actualEnd ?? null),
          plannedStartIso: plan ? stepWorkStart(plan) : undefined,
          plannedEndIso: plan?.plannedEnd ?? undefined,
          actualStartIso: actual?.actualStart ?? undefined,
          actualEndIso: actual?.actualEnd ?? undefined,
          remarks: actual?.remarks ?? undefined,
          assignedMachineId: assignedMachineId ?? undefined,
          assignedMachineNo: assignedMachineNo || undefined,
          bufferMinutes: plan?.bufferMinutes ?? 0,
          // Only shown for an unplanned step, as a non-binding reference —
          // there is no plan row to take a real duration from.
          templateMinutes: plan
            ? undefined
            : dimensionId
              ? templateMinutes.get(templateKey(dimensionId, stepId))
              : undefined,
          planBreaks: planBreaks && planBreaks.length > 0 ? planBreaks : undefined,
          startAnchorIso: resolveActualTimeAnchor(
            'actualStart',
            anchorStep,
            prev
              ? {
                  plannedStart: prev.plan?.plannedStart,
                  plannedEnd: prev.plan?.plannedEnd,
                  actualEnd: prev.actual?.actualEnd,
                }
              : null,
            checklist?.planStartTime,
          ),
          endAnchorIso: resolveActualTimeAnchor('actualEnd', anchorStep, null, checklist?.planStartTime),
        };
      });

      // Historical rows first, then today's — both already ordered, and the
      // stable sort keeps a historical row ahead of a current row that
      // happens to share its sequence order.
      const steps: ActualEntry[] = [...historicalSteps, ...currentSteps].sort(
        (a, b) => a.sequenceOrder - b.sequenceOrder,
      );

      // Machine events (breakdown reporting) only apply to the current step —
      // the one step actively being worked, regardless of track — so the
      // warning only fires when that specific step's assigned machine is down.
      // These two flags drive the pile-level banners/badges only; the actual
      // per-step entry block is decided per step from that step's own
      // machine's status (see PileStepsModal's blockedNoticeForStep), since
      // every not-yet-done step is now fillable, not just this one.
      const currentStep = steps.find((s) => s.actualEnd === undefined);
      const hasBreakdownWarning =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'BREAKDOWN';

      // Same shape as hasBreakdownWarning, but for a self-logged idle session
      // (status IDLE) — unlike breakdown, this actually blocks time entry (see
      // PileStepsModal), not just an advisory banner.
      const isBlockedByIdle =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'IDLE';

      const measurementRow = measurementsByPileId.get(cp.pileId);
      const measurements: PileMeasurementFields | null = measurementRow
        ? {
            eglM: measurementRow.eglM,
            pileContractorId: measurementRow.pileContractorId,
            cageContractorId: measurementRow.cageContractorId,
            pileLengthM: measurementRow.pileLengthM,
            cageWeightKg: measurementRow.cageWeightKg,
            ctlM: measurementRow.ctlM,
            colM: measurementRow.colM,
            boreDepthM: measurementRow.boreDepthM,
            hookLengthM: measurementRow.hookLengthM,
            flM: measurementRow.flM,
            actualQtyM3: measurementRow.actualQtyM3,
          }
        : null;

      const rigsWorked = machinesWorkedForTrack(steps, 'RIG');
      const cranesWorked = machinesWorkedForTrack(steps, 'CRANE');

      return {
        checklistPileId: cp.id,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        rigs: rigsWorked.length ? rigsWorked.map((m) => m.no) : [machineMap.get(cp.rigId) ?? cp.rigId],
        cranes: cranesWorked.length
          ? cranesWorked.map((m) => m.no)
          : cp.craneId
            ? [machineMap.get(cp.craneId) ?? cp.craneId]
            : [],
        rigId: currentMachineForTrack(steps, 'RIG') ?? cp.rigId,
        craneId: currentMachineForTrack(steps, 'CRANE') ?? (cp.craneId ?? undefined),
        steps,
        hasBreakdownWarning,
        isBlockedByIdle,
        measurements,
      };
    });
  }, [checklistPiles, planSteps, actualSteps, pileMap, machineMap, machineStatusById, checklist?.planStartTime, windowsByMachineId, completedStepsByPileId, measurementsByPileId, allSteps, durationTemplates]);

  return { pileGroups };
}
