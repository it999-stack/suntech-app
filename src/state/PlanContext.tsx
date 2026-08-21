// src/state/PlanContext.tsx
//
// SQLite-backed plan context. SQLite is a cache of server state, not the
// source of truth — plans are generated only on the server (see
// plan_generation_service.py).
//
// Flow:
//   1. On mount (or when siteId changes), load today's checklist from SQLite.
//   2. generatePlan() calls POST /plans/generate; the server creates/updates
//      the checklist + piles + plan steps and returns the full result, which
//      is written into SQLite verbatim (hydrateChecklistFromServer) — no id
//      or plan step is ever invented on-device.
//   3. setActualTime() upserts a pile_actual_steps row locally and queues it
//      for the offline sync queue — actuals are the one kind of data that
//      still originates on-device.
//   4. All UI reads from this context — no direct DB calls from screens.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getChecklistByDate,
  getChecklistPiles,
  hydrateChecklistFromServer,
} from '@repositories/checklistRepository';
import {
  getPlanStepsForChecklist,
  getActualStepsForChecklist,
  upsertActualStep,
  reassignMachineFromStep,
  type PlanStepWithMeta,
  type ActualStepWithMeta,
} from '@repositories/planRepository';
import { insertMachineEvent } from '@repositories/machineEventsRepository';
import { setMachineStatusLocal } from '@repositories/machinesRepository';
import {
  getPileMeasurementsByPileIds,
  upsertPileMeasurements,
  type PileMeasurementPatch,
} from '@repositories/pileMeasurementsRepository';
import { onBootstrapCompleted } from '@sync/bootstrap/bootstrapSync';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';
// pilingPlannerService.ts (local plan generation) is intentionally unused —
// plan generation now happens server-side (see plan_generation_service.py).
// Kept in the repo as a rollback reference until the server planner is
// verified in production; do not wire it back in without removing this note.
import type {
  PilingDailyChecklist,
  PilingChecklistPile,
  PilPileMeasurement,
} from '@db/schema';
import type { ResumeWork, ChecklistPersonnelAssignment, PileMeasurementFields } from '@/types/plan';
import { buildChecklistPersonnelPayload } from '@/utils/personnelRoles';
import { generateId } from '@/utils/helpers';
import { enqueueChecklistSync } from '@repositories/syncQueueRepository';
import { triggerDebounced } from '@sync/SyncManager';
import { onConflicts } from '@sync/delta/deltaPush';
import { apiClient } from '@services/apiClient';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PlanStatus = 'none' | 'planned' | 'in_progress' | 'completed';

/** One pile entry submitted by the user in GeneratePlanScreen. */
export type PileAssignmentInput = {
  pileId: string;
  pileCode: string;
  dimensionId: string;
  rigId: string;
  craneId?: string;
  resumeWork?: ResumeWork;
  stepTrackOverrides?: string[];
};

export type GeneratePlanInput = {
  /** "YYYY-MM-DD" — the date this checklist covers. */
  date: string;
  /** Naive local-wall-clock ISO timestamp, no "Z"/offset — when the 24hr plan
   * begins (e.g. "2026-07-08T08:00:00"). See toLocalIsoString() in
   * src/utils/formatTime.ts for why this must never be UTC-serialized. */
  planStartTime: string;
  /** ISO timestamp — when the 24hr plan ends (planStartTime + 24 h). */
  planEndTime: string;
  /** All personnel role assignments for this checklist. */
  checklistPersonnel: ChecklistPersonnelAssignment;
  /** pilingShiftTypes.id of the active shift for this plan. */
  shiftTypeId: string | null;
  /** Ordered list of piles + machine assignments. */
  piles: PileAssignmentInput[];
  /** Ordered list of selected step ids to include in this plan. */
  stepIds: string[];
  /**
   * True when the caller explicitly intends to overwrite an already-existing
   * plan for this date (GeneratePlanScreen's edit mode). Required for the
   * server to actually apply changes to an existing checklist — without it,
   * a plan that already exists for this date is returned unchanged rather
   * than overwritten (see plan_generation_service.py's is_edit handling).
   */
  isEdit?: boolean;
};

/** One pile entry submitted to a mid-day plan edit — no resumeWork field:
 * unlike a full regenerate, the server derives same-day resume points itself
 * from actual progress (see plan_generation_service.edit_checklist_plan_mid_day). */
export type EditPlanPileInput = {
  pileId: string;
  rigId: string;
  craneId?: string;
};

/** What changed as a result of editPlanMidDay — shown to the user before/after
 * they commit, per the mid-day-edit "show a summary" rule. */
export type EditPlanSummary = {
  pilesRemoved: string[];
  pilesAdded: string[];
  stepsRegeneratedCount: number;
  /** Piles left entirely untouched because a step on them is currently running. */
  pilesLockedSkipped: string[];
  warningPiles: string[];
};

/** Input for logging a machine breakdown/replacement/resume/idle event on a step. */
export type LogMachineEventInput = {
  track: 'RIG' | 'CRANE' | 'COMPRESSOR';
  eventType: 'BREAKDOWN' | 'REPLACED' | 'RESUMED' | 'IDLE_START' | 'IDLE_END';
  /** The machine going down / being resumed. */
  machineId: string | null;
  /** The replacement machine, for eventType 'REPLACED'. */
  replacementId: string | null;
  notes: string | null;
  /** ISO timestamp — user-editable, not always "now". */
  occurredAt: string;
};

type PlanContextValue = {
  /** Checklist for the currently loaded date. */
  checklist: PilingDailyChecklist | null;
  planStatus: PlanStatus;
  /** Enriched plan steps (join with step metadata). */
  planSteps: PlanStepWithMeta[];
  /** Enriched actual steps. */
  actualSteps: ActualStepWithMeta[];
  /** Checklist-pile entries (ordered by seq_no). */
  checklistPiles: PilingChecklistPile[];
  /** One-time engineering measurements for the currently loaded checklist's
   * physical piles, keyed by pileId (not checklistPileId) — see
   * pilPileMeasurements in db/schema.ts. */
  pileMeasurementsByPileId: Map<string, PilPileMeasurement>;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  /** Set when a genuine sync conflict touched a row in the currently loaded checklist. */
  conflictNotice: string | null;
  /** Clear conflictNotice after showing it once. */
  dismissConflictNotice: () => void;
  /** Load (or reload) the checklist for a given date + site. */
  loadChecklist: (siteId: string, date: string) => Promise<void>;
  /** Create the checklist + piles, then run the local planner. */
  generatePlan: (siteId: string, input: GeneratePlanInput) => Promise<void>;
  /** Reorder/add/remove piles on an already-generated, possibly
   * partially-worked checklist — never disturbs completed/running work, only
   * reschedules what's left from now. Returns a summary of what changed. */
  editPlanMidDay: (
    siteId: string,
    checklistId: string,
    date: string,
    piles: EditPlanPileInput[],
  ) => Promise<EditPlanSummary>;
  setRemarks: (checklistPileId: string, stepId: string, remarks: string) => Promise<void>;
  /** Upsert a partial patch of one-time engineering measurement fields for a
   * physical pile — merges onto whatever's already recorded, never a hard
   * gate on the actual-time entry that triggered it (see
   * MeasurementFieldsModal.tsx). */
  setPileMeasurement: (pileId: string, patch: Partial<PileMeasurementFields>) => Promise<void>;
  /** Record an actual start or end time for a step. */
  setActualTime: (
    checklistPileId: string,
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    isoTimestamp: string,
  ) => Promise<void>;
  /** Clear a previously logged actual start/end time. Clearing the start
   * time also clears the end time — a step can't be "finished" without
   * having "started". */
  clearActualTime: (
    checklistPileId: string,
    stepId: string,
    field: 'actualStart' | 'actualEnd',
  ) => Promise<void>;
  /** Log a machine breakdown/replacement/resume event for a step. */
  logMachineEvent: (
    checklistPileId: string,
    stepId: string,
    input: LogMachineEventInput,
  ) => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checklistStatusToPlanStatus(status: string): PlanStatus {
  switch (status) {
    case 'PLANNED':     return 'planned';
    case 'IN_PROGRESS': return 'in_progress';
    case 'COMPLETED':   return 'completed';
    default:            return 'none';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [checklist, setChecklist] = useState<PilingDailyChecklist | null>(null);
  const [checklistPiles, setChecklistPiles] = useState<PilingChecklistPile[]>([]);
  const [pileMeasurementsByPileId, setPileMeasurementsByPileId] = useState<Map<string, PilPileMeasurement>>(
    new Map(),
  );
  const [planSteps, setPlanSteps] = useState<PlanStepWithMeta[]>([]);
  const [actualSteps, setActualSteps] = useState<ActualStepWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  // Tracks the last (siteId, date) any screen asked us to load, so a
  // background sync completing can silently re-read local SQLite for
  // whatever's currently on screen — see the onBootstrapCompleted
  // subscription below. This is the root fix for "screen shows stale data
  // after sync": no screen needs its own polling/focus-effect wiring.
  const lastLoadedRef = React.useRef<{ siteId: string; date: string } | null>(null);

  // ── Load checklist for a date ────────────────────────────────────────────

  const loadChecklist = useCallback(async (siteId: string, date: string) => {
    lastLoadedRef.current = { siteId, date };
    setIsLoading(true);
    setError(null);
    try {
      const cl = await getChecklistByDate(siteId, date);
      setChecklist(cl ?? null);

      if (cl) {
        const [steps, actuals, piles] = await Promise.all([
          getPlanStepsForChecklist(cl.id),
          getActualStepsForChecklist(cl.id),
          getChecklistPiles(cl.id),
        ]);
        setPlanSteps(steps);
        setActualSteps(actuals);
        setChecklistPiles(piles);
        setPileMeasurementsByPileId(await getPileMeasurementsByPileIds(piles.map((p) => p.pileId)));
      } else {
        setPlanSteps([]);
        setActualSteps([]);
        setChecklistPiles([]);
        setPileMeasurementsByPileId(new Map());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-reads whatever's currently on screen every time a background sync
  // (manual, reconnect, foreground, or the first-sync gate) pulls fresh data
  // into local SQLite — without this, a screen that mounted before the sync
  // finished would otherwise keep showing what it loaded at mount time
  // forever, since nothing else ever re-triggers loadChecklist().
  useEffect(() => {
    return onBootstrapCompleted(() => {
      const last = lastLoadedRef.current;
      if (last) void loadChecklist(last.siteId, last.date);
    });
  }, [loadChecklist]);

  // Same re-read, but for every routine sync cycle (periodic/foreground/
  // reconnect/manual) — onBootstrapCompleted alone only fires on
  // first-install/full-reset, so without this a screen left mounted across
  // a delta sync (e.g. another device closing out a machine's step) would
  // keep validating against stale in-memory data. Mirrors the same pattern
  // already used in SiteSettingsContext.tsx.
  useEffect(() => {
    return onDeltaSyncComplete(() => {
      const last = lastLoadedRef.current;
      if (last) void loadChecklist(last.siteId, last.date);
    });
  }, [loadChecklist]);

  // Surfaces genuine sync conflicts (rare once optimistic-concurrency uses the
  // server-echoed version — see serverUpdatedAt) instead of silently letting
  // the next pull overwrite a local edit with no explanation. Only raises the
  // notice when the conflicting row belongs to whatever's currently loaded.
  useEffect(() => {
    return onConflicts((conflicts) => {
      const relevant = conflicts.some((c) =>
        c.entity === 'actual_step'
          ? actualSteps.some((a) => a.id === c.id)
          : checklistPiles.some((cp) => cp.id === c.id),
      );
      if (relevant) {
        setConflictNotice('Some entries were updated by another device and have been refreshed.');
      }
    });
  }, [actualSteps, checklistPiles]);

  const dismissConflictNotice = useCallback(() => setConflictNotice(null), []);

  // ── Generate plan ────────────────────────────────────────────────────────

  const generatePlan = useCallback(
    async (siteId: string, input: GeneratePlanInput) => {
      setIsGenerating(true);
      setError(null);
      try {
        // The server is the sole owner of plan generation and every id it
        // produces (checklist, checklist-piles, plan steps) — this call
        // requires connectivity by design (see plan_generation_service.py's
        // date/shift-grace-window validation). The response is the full,
        // authoritative plan; local SQLite is only ever a cache of it.
        const { data } = await apiClient.post(`/piling/sites/${siteId}/plans/generate`, {
          date: input.date,
          shift_type_id: input.shiftTypeId,
          plan_start_time: input.planStartTime,
          plan_end_time: input.planEndTime,
          checklist_personnel: buildChecklistPersonnelPayload(input.checklistPersonnel),
          piles: input.piles.map((p) => ({
            pile_id: p.pileId,
            rig_id: p.rigId,
            crane_id: p.craneId ?? null,
            resume_work: p.resumeWork
              ? {
                  step_id: p.resumeWork.stepId,
                  remaining_minutes: p.resumeWork.remainingMinutes,
                  buffer_minutes: p.resumeWork.bufferMinutes ?? null,
                }
              : null,
            step_track_overrides: p.stepTrackOverrides ?? [],
          })),
          step_ids: input.stepIds,
          is_edit: input.isEdit ?? false,
        });

        await hydrateChecklistFromServer(data);

        // Reload state from DB (plan steps + actuals + piles) — no local
        // sync-queue enqueue here; the checklist is already server-confirmed
        // by construction, there's nothing to push.
        await loadChecklist(siteId, input.date);
      } catch (err) {
        const message =
          (err as any)?.response?.data?.detail ||
          (err instanceof Error ? err.message : 'Failed to generate plan');
        console.error('generatePlan failed:', err);
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [loadChecklist],
  );

  // ── Mid-day plan edit (reorder / add / remove piles on a live checklist) ──

  const editPlanMidDay = useCallback(
    async (
      siteId: string,
      checklistId: string,
      date: string,
      piles: EditPlanPileInput[],
    ): Promise<EditPlanSummary> => {
      setIsGenerating(true);
      setError(null);
      try {
        // Same reasoning as generatePlan: the server is the sole owner of
        // scheduling decisions, this requires connectivity, and the response
        // is the full authoritative plan — local SQLite is only ever a cache.
        const { data } = await apiClient.post(
          `/piling/sites/${siteId}/checklists/${checklistId}/edit-plan`,
          {
            piles: piles.map((p) => ({
              pile_id: p.pileId,
              rig_id: p.rigId,
              crane_id: p.craneId ?? null,
            })),
          },
        );

        await hydrateChecklistFromServer(data.checklist);
        await loadChecklist(siteId, date);

        return {
          pilesRemoved: data.summary.piles_removed,
          pilesAdded: data.summary.piles_added,
          stepsRegeneratedCount: data.summary.steps_regenerated_count,
          pilesLockedSkipped: data.summary.piles_locked_skipped,
          warningPiles: data.summary.warning_piles,
        };
      } catch (err) {
        const message =
          (err as any)?.response?.data?.detail || (err instanceof Error ? err.message : 'Failed to edit plan');
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [loadChecklist],
  );

  // ── Record actual time ────────────────────────────────────────────────────

  const setActualTime = useCallback(
    async (
      checklistPileId: string,
      stepId: string,
      field: 'actualStart' | 'actualEnd',
      isoTimestamp: string,
    ) => {
      setError(null);
      try {
        const existing = actualSteps.find(
          (a) => a.checklistPileId === checklistPileId && a.stepId === stepId,
        );

        await upsertActualStep({
          id: existing?.id ?? generateId(),
          checklistPileId,
          stepId,
          actualStart: field === 'actualStart' ? isoTimestamp : (existing?.actualStart ?? null),
          actualEnd: field === 'actualEnd' ? isoTimestamp : (existing?.actualEnd ?? null),
          remarks: existing?.remarks ?? null,
        });

        if (checklist) {
          await enqueueChecklistSync(checklist.id);
          triggerDebounced('new-write');
          const refreshed = await getActualStepsForChecklist(checklist.id);
          setActualSteps(refreshed);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save actual time');
        throw err;
      }
    },
    [actualSteps, checklist],
  );

  const clearActualTime = useCallback(
    async (checklistPileId: string, stepId: string, field: 'actualStart' | 'actualEnd') => {
      setError(null);
      try {
        const existing = actualSteps.find(
          (a) => a.checklistPileId === checklistPileId && a.stepId === stepId,
        );
        if (!existing) return;

        await upsertActualStep({
          id: existing.id,
          checklistPileId,
          stepId,
          actualStart: field === 'actualStart' ? null : (existing.actualStart ?? null),
          actualEnd: field === 'actualStart' || field === 'actualEnd' ? null : (existing.actualEnd ?? null),
          remarks: existing.remarks ?? null,
        });

        if (checklist) {
          await enqueueChecklistSync(checklist.id);
          triggerDebounced('new-write');
          const refreshed = await getActualStepsForChecklist(checklist.id);
          setActualSteps(refreshed);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to clear actual time');
        throw err;
      }
    },
    [actualSteps, checklist],
  );

  const setRemarks = useCallback(
    async (checklistPileId: string, stepId: string, remarks: string) => {
      setError(null);
      try {
        const existing = actualSteps.find(
          (a) => a.checklistPileId === checklistPileId && a.stepId === stepId,
        );

        await upsertActualStep({
          id: existing?.id ?? generateId(),
          checklistPileId,
          stepId,
          actualStart: existing?.actualStart ?? null,
          actualEnd: existing?.actualEnd ?? null,
          remarks,
        });

        if (checklist) {
          await enqueueChecklistSync(checklist.id);
          triggerDebounced('new-write');
          const refreshed = await getActualStepsForChecklist(checklist.id);
          setActualSteps(refreshed);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save remarks');
        throw err;
      }
    },
    [actualSteps, checklist],
  );

  // ── One-time engineering measurements (per physical pile) ────────────────

  const setPileMeasurement = useCallback(
    async (pileId: string, patch: Partial<PileMeasurementFields>) => {
      setError(null);
      try {
        await upsertPileMeasurements(pileId, patch as PileMeasurementPatch);

        if (checklist) {
          await enqueueChecklistSync(checklist.id);
          triggerDebounced('new-write');
        }
        const refreshed = await getPileMeasurementsByPileIds(checklistPiles.map((cp) => cp.pileId));
        setPileMeasurementsByPileId(refreshed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save measurement');
        throw err;
      }
    },
    [checklist, checklistPiles],
  );

  // ── Log machine event (breakdown / replacement / resume) ─────────────────

  const logMachineEvent = useCallback(
    async (checklistPileId: string, stepId: string, input: LogMachineEventInput) => {
      setError(null);
      try {
        const cp = checklistPiles.find((c) => c.id === checklistPileId);
        if (!cp) throw new Error('Checklist pile not found');

        await insertMachineEvent({
          id: generateId(),
          checklistId: cp.checklistId,
          pileId: cp.pileId,
          stepId,
          track: input.track,
          eventType: input.eventType,
          machineId: input.machineId,
          replacementId: input.replacementId,
          notes: input.notes,
          occurredAt: input.occurredAt,
        });

        if (input.eventType === 'REPLACED' && input.replacementId) {
          const currentStep = planSteps.find(
            (s) => s.checklistPileId === checklistPileId && s.stepId === stepId,
          );
          if (currentStep) {
            await reassignMachineFromStep(
              checklistPileId,
              input.machineId,
              currentStep.businessTrack ?? currentStep.track,
              currentStep.sequenceOrder,
              input.replacementId,
            );
          }
        }

        // REPLACED intentionally does not touch machine status here — swapping
        // a machine off a pile doesn't mean it's broken, only an explicit
        // BREAKDOWN event does. Mirrors apply_machine_event_side_effect server-side.
        if (input.machineId) {
          if (input.eventType === 'BREAKDOWN') {
            await setMachineStatusLocal(input.machineId, 'BREAKDOWN');
          } else if (input.eventType === 'RESUMED') {
            await setMachineStatusLocal(input.machineId, 'ACTIVE');
          } else if (input.eventType === 'IDLE_START') {
            await setMachineStatusLocal(input.machineId, 'IDLE');
          } else if (input.eventType === 'IDLE_END') {
            await setMachineStatusLocal(input.machineId, 'ACTIVE');
          }
        }

        if (checklist) {
          await enqueueChecklistSync(checklist.id);
          triggerDebounced('new-write');
          const refreshedSteps = await getPlanStepsForChecklist(checklist.id);
          setPlanSteps(refreshedSteps);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to log machine event');
        throw err;
      }
    },
    [checklistPiles, planSteps, checklist],
  );

  // ── Derived plan status ───────────────────────────────────────────────────

  const planStatus: PlanStatus = checklist
    ? checklistStatusToPlanStatus(checklist.status)
    : 'none';

  const value = useMemo<PlanContextValue>(
    () => ({
      checklist,
      planStatus,
      planSteps,
      actualSteps,
      checklistPiles,
      pileMeasurementsByPileId,
      isLoading,
      isGenerating,
      error,
      conflictNotice,
      dismissConflictNotice,
      loadChecklist,
      generatePlan,
      editPlanMidDay,
      setActualTime,
      clearActualTime,
      setRemarks,
      setPileMeasurement,
      logMachineEvent,
    }),
    [
      checklist,
      planStatus,
      planSteps,
      actualSteps,
      checklistPiles,
      pileMeasurementsByPileId,
      isLoading,
      isGenerating,
      error,
      conflictNotice,
      dismissConflictNotice,
      loadChecklist,
      generatePlan,
      editPlanMidDay,
      setActualTime,
      clearActualTime,
      setRemarks,
      setPileMeasurement,
      logMachineEvent,
    ],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider');
  return ctx;
}