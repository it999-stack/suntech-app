// src/screens/Home/fillActual/useActualTimeActions.ts
//
// Adapts PlanContext's setActualTime/clearActualTime/setRemarks (which take
// a checklistPileId) for PileStepsModal, which only knows the currently
// open pile group's stepId — the day-rollover/overnight anchor resolution
// for actual-time entries lives here too.

import { useCallback } from 'react';
import { toLocalIsoString, resolveOvernightDate, resolveActualTimeAnchor } from '@utils/formatTime';
import type { PlanStepWithMeta, ActualStepWithMeta } from '@repositories/planRepository';
import type { PilingDailyChecklist } from '@db/schema';
import type { PileGroup, PileMeasurementFields } from '@app-types/plan';

export function useActualTimeActions(args: {
  openGroup: PileGroup | null;
  planSteps: PlanStepWithMeta[];
  actualSteps: ActualStepWithMeta[];
  checklist: PilingDailyChecklist | null;
  setActualTime: (
    checklistPileId: string,
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    isoTimestamp: string,
  ) => Promise<void>;
  clearActualTime: (checklistPileId: string, stepId: string, field: 'actualStart' | 'actualEnd') => Promise<void>;
  setRemarks: (checklistPileId: string, stepId: string, remarks: string) => Promise<void>;
  setPileMeasurement: (pileId: string, patch: Partial<PileMeasurementFields>) => Promise<void>;
}): {
  handleSetActualTime: (
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    minutesSinceMidnight: number,
    explicitDate?: Date,
  ) => Promise<void>;
  handleClearActualTime: (stepId: string, field: 'actualStart' | 'actualEnd') => Promise<void>;
  handleSaveRemarks: (stepId: string, text: string) => Promise<void>;
  handleSaveMeasurements: (patch: Partial<PileMeasurementFields>) => Promise<void>;
} {
  const {
    openGroup,
    planSteps,
    actualSteps,
    checklist,
    setActualTime,
    clearActualTime,
    setRemarks,
    setPileMeasurement,
  } = args;

  // The picked value is only a time-of-day (minutes-since-midnight) unless
  // the caller passes explicitDate (the user tapped the picker's header
  // calendar and chose a specific day) — in that case we trust it exactly,
  // no inference. Otherwise we must resolve which calendar day it belongs
  // to ourselves: we anchor on the nearest real ISO timestamp already known
  // for this step sequence (the previous step's actual end for a start
  // time, or this step's own actual start for an end time) and roll forward
  // a day if the picked time-of-day is earlier than the anchor's, so
  // overnight continuations land on the correct date instead of always
  // being forced onto "today".
  const handleSetActualTime = useCallback(
    async (
      stepId: string,
      field: 'actualStart' | 'actualEnd',
      minutesSinceMidnight: number,
      explicitDate?: Date,
    ) => {
      if (!openGroup) return;

      let dt: Date;
      if (explicitDate) {
        dt = explicitDate;
      } else {
        const cpPlanSteps = planSteps
          .filter((s) => s.checklistPileId === openGroup.checklistPileId)
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
        const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === openGroup.checklistPileId);
        const idx = cpPlanSteps.findIndex((s) => s.stepId === stepId);

        const thisPlan = cpPlanSteps[idx];
        const thisActual = cpActualSteps.find((a) => a.stepId === stepId);
        const prevPlan = idx > 0 ? cpPlanSteps[idx - 1] : null;
        const prevActual = prevPlan ? cpActualSteps.find((a) => a.stepId === prevPlan.stepId) : null;

        const anchorIso = resolveActualTimeAnchor(
          field,
          { plannedStart: thisPlan?.plannedStart, plannedEnd: thisPlan?.plannedEnd, actualStart: thisActual?.actualStart },
          prevPlan
            ? { plannedStart: prevPlan.plannedStart, plannedEnd: prevPlan.plannedEnd, actualEnd: prevActual?.actualEnd }
            : null,
          checklist?.planStartTime,
        );

        dt = resolveOvernightDate(anchorIso, minutesSinceMidnight);
      }

      await setActualTime(openGroup.checklistPileId, stepId, field, toLocalIsoString(dt));
    },
    [openGroup, planSteps, actualSteps, checklist, setActualTime],
  );

  const handleClearActualTime = useCallback(
    async (stepId: string, field: 'actualStart' | 'actualEnd') => {
      if (!openGroup) return;
      await clearActualTime(openGroup.checklistPileId, stepId, field);
    },
    [openGroup, clearActualTime],
  );

  const handleSaveRemarks = useCallback(
    async (stepId: string, text: string) => {
      if (!openGroup) return;
      await setRemarks(openGroup.checklistPileId, stepId, text);
    },
    [openGroup, setRemarks],
  );

  // Keyed by physical pile id (openGroup.pileId), not checklistPileId —
  // measurements are one-time per physical pile (see PileMeasurementFields).
  const handleSaveMeasurements = useCallback(
    async (patch: Partial<PileMeasurementFields>) => {
      if (!openGroup) return;
      await setPileMeasurement(openGroup.pileId, patch);
    },
    [openGroup, setPileMeasurement],
  );

  return { handleSetActualTime, handleClearActualTime, handleSaveRemarks, handleSaveMeasurements };
}
