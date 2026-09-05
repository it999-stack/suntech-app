// src/screens/Home/fillActual/useActualTimeActions.ts
//
// Adapts PlanContext's setActualTime/clearActualTime/setRemarks (which take
// a checklistPileId) for PileStepsModal, which only knows the currently
// open pile group's stepId — the day-rollover/overnight anchor resolution
// for actual-time entries lives here too.

import { useCallback } from 'react';
import { toLocalIsoString, resolveOvernightDate } from '@utils/formatTime';
import type { PilingDailyChecklist } from '@db/schema';
import type { PileGroup, PileMeasurementFields } from '@app-types/plan';

export function useActualTimeActions(args: {
  openGroup: PileGroup | null;
  checklist: PilingDailyChecklist | null;
  setActualTime: (
    checklistPileId: string,
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    isoTimestamp: string,
    assignedMachineId?: string | null,
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
  //
  // That anchor is read off the step row itself (usePileGroups precomputes
  // start/endAnchorIso with resolveActualTimeAnchor) rather than re-derived
  // from the plan rows here. It has to be: a step the plan never covered has
  // no plan row to derive one from, so the old lookup silently fell all the
  // way through to the checklist's plan start. It also guarantees the picker
  // and the save path agree — they now read the exact same field.
  const handleSetActualTime = useCallback(
    async (
      stepId: string,
      field: 'actualStart' | 'actualEnd',
      minutesSinceMidnight: number,
      explicitDate?: Date,
    ) => {
      if (!openGroup) return;

      const step = openGroup.steps.find((s) => s.stepId === stepId && !s.isHistorical);

      let dt: Date;
      if (explicitDate) {
        dt = explicitDate;
      } else {
        const anchorIso =
          (field === 'actualStart' ? step?.startAnchorIso : step?.endAnchorIso) ??
          checklist?.planStartTime ??
          toLocalIsoString(new Date());
        dt = resolveOvernightDate(anchorIso, minutesSinceMidnight);
      }

      // The machine that actually performed the step, persisted onto the
      // actual row — for an unplanned step there is no plan row holding it.
      await setActualTime(
        openGroup.checklistPileId,
        stepId,
        field,
        toLocalIsoString(dt),
        step?.assignedMachineId ?? null,
      );
    },
    [openGroup, checklist, setActualTime],
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
