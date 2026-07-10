// src/state/PlanContext.tsx
//
// SQLite-backed plan context. Replaces the previous in-memory stand-in.
//
// Flow:
//   1. On mount (or when siteId changes), load today's checklist from SQLite.
//   2. generatePlan() creates/updates the checklist + piles in SQLite,
//      then runs the local planner to produce pile_plan_steps.
//   3. setActualTime() upserts a pile_actual_steps row.
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
  getChecklistById,
  getChecklistPiles,
  insertChecklist,
  updateChecklist,
  insertChecklistPiles,
  deleteChecklistPiles,
} from '../repositories/checklistRepository';
import {
  getPlanStepsForChecklist,
  getActualStepsForChecklist,
  upsertActualStep,
  type PlanStepWithMeta,
  type ActualStepWithMeta,
} from '../repositories/planRepository';
import { generatePlan as runPlanner } from '../services/pilingPlannerService';
import type {
  PilingDailyChecklist,
  PilingChecklistPile,
} from '../db/schema';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PlanStatus = 'none' | 'planned' | 'in_progress' | 'completed';

/** One pile entry submitted by the user in GeneratePlanScreen. */
export type PileAssignmentInput = {
  pileId: string;      // pilingPiles.id
  pileCode: string;
  dia: number;
  depth: number;
  rigId: string;       // pilingMachines.id (type=RIG)
  craneId: string;     // pilingMachines.id (type=CRANE)
};

export type GeneratePlanInput = {
  /** "YYYY-MM-DD" — the date this checklist covers. */
  date: string;
  /** ISO timestamp — when the 24hr plan begins (e.g. "2026-07-08T08:00:00+05:30"). */
  planStartTime: string;
  /** ISO timestamp — when the 24hr plan ends (planStartTime + 24 h). */
  planEndTime: string;
  /** pilingPersonnel.id of the day/shift-1 supervisor on duty. */
  supervisorId: string | null;
  /** pilingPersonnel.id of the night/shift-2 supervisor on duty. */
  supervisorId2: string | null;
  /** Ordered list of piles + machine assignments. */
  piles: PileAssignmentInput[];  /** Ordered list of selected step ids to include in this plan. */
  stepIds: string[];};

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
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  /** Load (or reload) the checklist for a given date + site. */
  loadChecklist: (siteId: string, date: string) => Promise<void>;
  /** Create the checklist + piles, then run the local planner. */
  generatePlan: (siteId: string, input: GeneratePlanInput) => Promise<void>;
  /** Record an actual start or end time for a step. */
  setActualTime: (
    checklistPileId: string,
    stepId: string,
    field: 'actualStart' | 'actualEnd',
    isoTimestamp: string,
  ) => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

// ─── Helper ───────────────────────────────────────────────────────────────────

function generateUuid(): string {
  return 'cl_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

function checklistStatusToPlanStatus(status: string): PlanStatus {
  switch (status) {
    case 'PLANNED': return 'planned';
    case 'IN_PROGRESS': return 'in_progress';
    case 'COMPLETED': return 'completed';
    default: return 'none';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [checklist, setChecklist] = useState<PilingDailyChecklist | null>(null);
  const [checklistPiles, setChecklistPiles] = useState<PilingChecklistPile[]>([]);
  const [planSteps, setPlanSteps] = useState<PlanStepWithMeta[]>([]);
  const [actualSteps, setActualSteps] = useState<ActualStepWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load checklist for a date ────────────────────────────────────────────

  const loadChecklist = useCallback(async (siteId: string, date: string) => {
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
      } else {
        setPlanSteps([]);
        setActualSteps([]);
        setChecklistPiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Generate plan ────────────────────────────────────────────────────────

  const generatePlan = useCallback(
    async (siteId: string, input: GeneratePlanInput) => {
      setIsGenerating(true);
      setError(null);
      try {
        const now = Date.now();

        // 1. Get or create the checklist for this date
        let cl = await getChecklistByDate(siteId, input.date);

        if (!cl) {
          const newId = generateUuid();
          await insertChecklist({
            id: newId,
            siteId,
            date: input.date,
            shiftTypeId: null,
            planStartTime: input.planStartTime,
            planEndTime: input.planEndTime,
            supervisorId: input.supervisorId,
            supervisorId2: input.supervisorId2,
            notes: null,
            status: 'PLANNED',
            createdAt: now,
            updatedAt: now,
          });
          cl = await getChecklistByDate(siteId, input.date);
        } else {
          // Update existing checklist
          await updateChecklist(cl.id, {
            shiftTypeId: null,
            planStartTime: input.planStartTime,
            planEndTime: input.planEndTime,
            supervisorId: input.supervisorId,
            supervisorId2: input.supervisorId2,
            status: 'PLANNED',
            updatedAt: now,
          });
          cl = await getChecklistByDate(siteId, input.date);
        }

        if (!cl) throw new Error('Failed to create checklist');

        // 2. Replace pile assignments
        await deleteChecklistPiles(cl.id);
        const cpEntries = input.piles.map((p, idx) => ({
          id: generateUuid(),
          checklistId: cl!.id,
          pileId: p.pileId,
          seqNo: idx + 1,
          rigId: p.rigId,
          craneId: p.craneId,
          status: 'NOT_STARTED' as const,
          createdAt: now,
        }));
        await insertChecklistPiles(cpEntries);

        // 3. Run the local planner — uses ALL non-working windows for the site automatically
        await runPlanner({
          checklistId: cl.id,
          planStartTime: input.planStartTime,
          siteId,
          selectedStepIds: input.stepIds,
          rigMachineIds: [...new Set(input.piles.map((p) => p.rigId))],
          craneMachineIds: [...new Set(input.piles.map((p) => p.craneId))],
        });

        // 4. Reload state
        await loadChecklist(siteId, input.date);
        setChecklist(cl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate plan');
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
      // Find existing actual to merge with
      const existing = actualSteps.find(
        (a) => a.checklistPileId === checklistPileId && a.stepId === stepId,
      );

      const id = existing?.id ?? generateUuid();
      const entry = {
        id,
        checklistPileId,
        stepId,
        actualStart: field === 'actualStart' ? isoTimestamp : (existing?.actualStart ?? null),
        actualEnd: field === 'actualEnd' ? isoTimestamp : (existing?.actualEnd ?? null),
        remarks: existing?.remarks ?? null,
      };

      await upsertActualStep(entry);

      // Refresh actuals in state
      if (checklist) {
        const refreshed = await getActualStepsForChecklist(checklist.id);
        setActualSteps(refreshed);
      }
    },
    [actualSteps, checklist],
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
      isLoading,
      isGenerating,
      error,
      loadChecklist,
      generatePlan,
      setActualTime,
    }),
    [
      checklist,
      planStatus,
      planSteps,
      actualSteps,
      checklistPiles,
      isLoading,
      isGenerating,
      error,
      loadChecklist,
      generatePlan,
      setActualTime,
    ],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider');
  return ctx;
}
