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

/** Everything the finish sheet gathers when a step stopped part-way. The
 * times here are already resolved ISO strings — unlike the actual-time
 * handlers below, which still speak minutes-since-midnight and do their own
 * overnight resolution. */
export type PauseStepInput = {
  stoppedAtIso: string;
  notes: string;
  /** The step's currently resolved machine, and when it started — both only
   * so a step that was already in progress before it was ever split gets a
   * baseline session covering that earlier work. */
  machineId?: string;
  actualStartIso?: string;
};

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
  pauseStep: (checklistPileId: string, stepId: string, input: PauseStepInput) => Promise<void>;
  resumeStep: (
    checklistPileId: string,
    stepId: string,
    input: { startedAtIso: string; machineId?: string },
  ) => Promise<void>;
  finishSegment: (
    checklistPileId: string,
    stepId: string,
    input: { endedAtIso: string; notes?: string },
  ) => Promise<void>;
  editSegmentTime: (
    checklistPileId: string,
    stepId: string,
    segmentId: string,
    field: 'start' | 'finish',
    isoTimestamp: string,
  ) => Promise<void>;
  setSegmentNotes: (checklistPileId: string, stepId: string, segmentId: string, notes: string) => Promise<void>;
  deleteSegment: (checklistPileId: string, stepId: string, segmentId: string) => Promise<void>;
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
  handlePauseStep: (stepId: string, input: PauseStepInput) => Promise<void>;
  handleResumeStep: (
    stepId: string,
    input: { startedAtIso: string; machineId?: string },
  ) => Promise<void>;
  handleFinishSegment: (stepId: string, input: { endedAtIso: string; notes?: string }) => Promise<void>;
  handleEditSegmentTime: (
    stepId: string,
    segmentId: string,
    field: 'start' | 'finish',
    minutesSinceMidnight: number,
    explicitDate?: Date,
  ) => Promise<void>;
  handleSetSegmentNotes: (stepId: string, segmentId: string, notes: string) => Promise<void>;
  handleDeleteSegment: (stepId: string, segmentId: string) => Promise<void>;
} {
  const {
    openGroup,
    checklist,
    setActualTime,
    clearActualTime,
    setRemarks,
    setPileMeasurement,
    pauseStep,
    resumeStep,
    finishSegment,
    editSegmentTime,
    setSegmentNotes,
    deleteSegment,
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

  // Straight pass-throughs of the open pile's checklistPileId. No time
  // resolution here, unlike the handlers above: the sheets that call these
  // work in resolved ISO timestamps, having already run the picked value
  // through StepTimeControl's own validation and overnight handling.
  const handlePauseStep = useCallback(
    async (stepId: string, input: PauseStepInput) => {
      if (!openGroup) return;
      await pauseStep(openGroup.checklistPileId, stepId, input);
    },
    [openGroup, pauseStep],
  );

  const handleResumeStep = useCallback(
    async (stepId: string, input: { startedAtIso: string; machineId?: string }) => {
      if (!openGroup) return;
      await resumeStep(openGroup.checklistPileId, stepId, input);
    },
    [openGroup, resumeStep],
  );

  const handleFinishSegment = useCallback(
    async (stepId: string, input: { endedAtIso: string; notes?: string }) => {
      if (!openGroup) return;
      await finishSegment(openGroup.checklistPileId, stepId, input);
    },
    [openGroup, finishSegment],
  );

  // Same two-step shape as handleSetActualTime: EditTimeButton validates
  // against its OWN resolved candidate internally, but hands back the raw
  // minutes/explicitDate — the anchor used to resolve the final date here
  // must be the exact same one actualTimeRules.forSegment gave the control
  // (the session's own startedAt for 'start', endedAt-or-startedAt for
  // 'finish'), or the picker's validation and the value actually saved could
  // disagree about which calendar day it lands on.
  const handleEditSegmentTime = useCallback(
    async (
      stepId: string,
      segmentId: string,
      field: 'start' | 'finish',
      minutesSinceMidnight: number,
      explicitDate?: Date,
    ) => {
      if (!openGroup) return;
      const step = openGroup.steps.find((s) => s.stepId === stepId && !s.isHistorical);
      const seg = step?.segments?.find((s) => s.id === segmentId);

      let dt: Date;
      if (explicitDate) {
        dt = explicitDate;
      } else {
        const anchorIso =
          (field === 'start' ? seg?.startedAt : (seg?.endedAt ?? seg?.startedAt)) ??
          checklist?.planStartTime ??
          toLocalIsoString(new Date());
        dt = resolveOvernightDate(anchorIso, minutesSinceMidnight);
      }

      await editSegmentTime(openGroup.checklistPileId, stepId, segmentId, field, toLocalIsoString(dt));
    },
    [openGroup, checklist, editSegmentTime],
  );

  const handleSetSegmentNotes = useCallback(
    async (stepId: string, segmentId: string, notes: string) => {
      if (!openGroup) return;
      await setSegmentNotes(openGroup.checklistPileId, stepId, segmentId, notes);
    },
    [openGroup, setSegmentNotes],
  );

  const handleDeleteSegment = useCallback(
    async (stepId: string, segmentId: string) => {
      if (!openGroup) return;
      await deleteSegment(openGroup.checklistPileId, stepId, segmentId);
    },
    [openGroup, deleteSegment],
  );

  return {
    handleSetActualTime,
    handleClearActualTime,
    handleSaveRemarks,
    handleSaveMeasurements,
    handlePauseStep,
    handleResumeStep,
    handleFinishSegment,
    handleEditSegmentTime,
    handleSetSegmentNotes,
    handleDeleteSegment,
  };
}
