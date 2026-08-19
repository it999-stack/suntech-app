// src/screens/Home/fillActual/usePileGroups.ts
//
// The core join for the Log Actuals screen: merges each checklist-pile's
// plan + actual steps (plus any historical steps carried over from a prior
// checklist) into the PileGroup shape the rest of the screen renders from,
// including the breakdown/idle warning flags for its current step.

import { useMemo } from 'react';
import { resolveActualTimeAnchor } from '@utils/formatTime';
import { stepWorkStart } from '@utils/helpers';
import { splitStepByInternalWindows } from '@components/plan/generate/preview/previewUtils';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import type { CompletedStepInfo } from '@/services/resumeWorkService';
import type { PlanStepWithMeta, ActualStepWithMeta } from '@repositories/planRepository';
import type { PilingChecklistPile, PilingDailyChecklist, PilingPile, PilPileMeasurement } from '@db/schema';
import type { ActualEntry, PileGroup, PileMeasurementFields } from '@app-types/plan';

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
  } = args;

  const pileGroups = useMemo((): PileGroup[] => {
    if (!checklistPiles.length) return [];

    return checklistPiles.map((cp) => {
      const pile = pileMap.get(cp.pileId);

      // Steps for this checklist-pile, merged plan + actual — sorted by
      // sequence order so "previous step" is well-defined for anchor math
      // below (handleSetActualTime relies on the same ordering).
      const cpPlanSteps = planSteps
        .filter((s) => s.checklistPileId === cp.id)
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === cp.id);

      // Steps completed on a *previous* checklist for this pile — read-only,
      // faded rows (see PileStepsModal) shown alongside today's own steps
      // instead of vanishing just because they predate this checklist.
      const historicalSteps: ActualEntry[] = (completedStepsByPileId.get(cp.pileId) ?? []).map((c) => ({
        stepId: c.stepId,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        stepName: c.stepName,
        track: c.track as 'RIG' | 'CRANE' | 'COMPRESSOR',
        sequenceOrder: c.sequenceOrder,
        plannedStart: isoToMinutes(c.plannedStart) ?? 0,
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

      const steps: ActualEntry[] = [...historicalSteps, ...cpPlanSteps.map((ps, idx) => {
        const actual = cpActualSteps.find((a) => a.stepId === ps.stepId);
        const prevPlan = idx > 0 ? cpPlanSteps[idx - 1] : null;
        const prevActual = prevPlan ? cpActualSteps.find((a) => a.stepId === prevPlan.stepId) : null;
        const anchorStep = { plannedStart: ps.plannedStart, plannedEnd: ps.plannedEnd, actualStart: actual?.actualStart };
        const planBreaks = splitStepByInternalWindows(ps, windowsByMachineId)?.breaks;

        return {
          stepId: ps.stepId,
          pileId: cp.pileId,
          pileCode: pile?.pileIdCode ?? cp.pileId,
          stepName: ps.stepName,
          track: ps.track as 'RIG' | 'CRANE' | 'COMPRESSOR',
          sequenceOrder: ps.sequenceOrder,
          plannedStart: isoToMinutes(stepWorkStart(ps)) ?? 0,
          // Preserve undefined (rather than fabricating midnight) when this
          // step is "continuing" — it never had a committed end time.
          plannedEnd: isoToMinutes(ps.plannedEnd),
          actualStart: isoToMinutes(actual?.actualStart ?? null),
          actualEnd: isoToMinutes(actual?.actualEnd ?? null),
          plannedStartIso: stepWorkStart(ps),
          plannedEndIso: ps.plannedEnd ?? undefined,
          actualStartIso: actual?.actualStart ?? undefined,
          actualEndIso: actual?.actualEnd ?? undefined,
          remarks: actual?.remarks ?? undefined,
          assignedMachineId: ps.assignedMachineId ?? undefined,
          assignedMachineNo: ps.assignedMachineNo || undefined,
          bufferMinutes: ps.bufferMinutes ?? 0,
          planBreaks: planBreaks && planBreaks.length > 0 ? planBreaks : undefined,
          startAnchorIso: resolveActualTimeAnchor(
            'actualStart',
            anchorStep,
            prevPlan
              ? { plannedStart: prevPlan.plannedStart, plannedEnd: prevPlan.plannedEnd, actualEnd: prevActual?.actualEnd }
              : null,
            checklist?.planStartTime,
          ),
          endAnchorIso: resolveActualTimeAnchor('actualEnd', anchorStep, null, checklist?.planStartTime),
        };
      })];

      // Machine events (breakdown reporting) only apply to the current step —
      // the one step actively being worked, regardless of track — so the
      // warning only fires when that specific step's assigned machine is down.
      const currentStep = [...steps]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .find((s) => s.actualEnd === undefined);
      const hasBreakdownWarning =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'BREAKDOWN';

      // Same shape as hasBreakdownWarning, but for a self-logged idle session
      // (status IDLE) — unlike breakdown, this actually blocks the current
      // step's time entry (see PileStepsModal), not just an advisory banner.
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

      return {
        checklistPileId: cp.id,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        rig: machineMap.get(cp.rigId) ?? cp.rigId,
        crane: cp.craneId ? (machineMap.get(cp.craneId) ?? cp.craneId) : undefined,
        rigId: cp.rigId,
        craneId: cp.craneId ?? undefined,
        steps,
        hasBreakdownWarning,
        isBlockedByIdle,
        measurements,
      };
    });
  }, [checklistPiles, planSteps, actualSteps, pileMap, machineMap, machineStatusById, checklist?.planStartTime, windowsByMachineId, completedStepsByPileId, measurementsByPileId]);

  return { pileGroups };
}
