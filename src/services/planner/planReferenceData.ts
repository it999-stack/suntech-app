// src/services/planner/planReferenceData.ts
// DB fetches for duration templates and non-working windows — split out so a
// caller (e.g. the plan-generation wizard) can fetch these once per session
// and pass them back in via buildPlanRowsForPiles's `referenceData` option —
// piling_steps, duration templates, and non-working windows are 100% static
// for the duration of a wizard session; nothing about them changes just
// because the user picked a different Rig/Crane tile.

import { eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import { pilingDimensions, pilingStepDurationTemplates, pilingShiftTypes, pilingNonWorkingWindows } from '@db/schema';
import { getNonWorkingWindowsByShift } from '@repositories/shiftsRepository';
import { resolveWindows, skipNonWorkingWindows } from './planWindows';
import type { PlanTemplateRow, PlanRawWindow } from './planTypes';

type Db = Awaited<ReturnType<typeof initDb>>;

// FIX: piling_step_duration_templates has no site_id column — it's scoped to
// a site indirectly through dimensionId -> piling_dimensions.site_id.
export async function fetchTemplateRows(db: Db, siteId: string): Promise<PlanTemplateRow[]> {
  return db
    .select({
      id: pilingStepDurationTemplates.id,
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
      bufferBeforeMinutes: pilingStepDurationTemplates.bufferBeforeMinutes,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(pilingDimensions, eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id))
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
}

export async function fetchRawWindows(db: Db, siteId: string, shiftTypeId?: string): Promise<PlanRawWindow[]> {
  if (shiftTypeId) {
    return getNonWorkingWindowsByShift(shiftTypeId);
  }
  const shiftRows = await db
    .select({ id: pilingShiftTypes.id })
    .from(pilingShiftTypes)
    .where(eq(pilingShiftTypes.siteId, siteId))
    .all();
  const shiftIds = shiftRows.map((s) => s.id);
  if (shiftIds.length === 0) return [];
  return db
    .select({
      id: pilingNonWorkingWindows.id,
      label: pilingNonWorkingWindows.label,
      behavior: pilingNonWorkingWindows.behavior,
      startTime: pilingNonWorkingWindows.startTime,
      endTime: pilingNonWorkingWindows.endTime,
    })
    .from(pilingNonWorkingWindows)
    .where(inArray(pilingNonWorkingWindows.shiftTypeId, shiftIds))
    .all();
}

/** Fetches the two reference-data pieces that are cheap to cache for a whole
 * wizard session (step definitions are already loaded separately by callers
 * like GeneratePlanScreen, via getSteps() — no need to duplicate that here). */
export async function fetchPlanReferenceData(options: {
  siteId: string;
  shiftTypeId?: string;
}): Promise<{ templateRows: PlanTemplateRow[]; rawWindows: PlanRawWindow[] }> {
  const db = await initDb();
  const [templateRows, rawWindows] = await Promise.all([
    fetchTemplateRows(db, options.siteId),
    fetchRawWindows(db, options.siteId, options.shiftTypeId),
  ]);
  return { templateRows, rawWindows };
}

/**
 * Where planStartTime effectively lands after skipping any non-working window it falls
 * inside (a zero-duration probe) — e.g. an 8-9 AM shift-change window pushes an 8 AM
 * plan start to 9 AM. Used by ResumeTimeConfirmModal to convert a supervisor-picked
 * absolute "plan finish time" into a remaining-duration override, without needing to
 * know the resume step's actual machine-queue position: a resuming pile's step is
 * always the first thing scheduled on its own machine (see build_plan_rows_for_piles'
 * priority_key/isResuming tie-break), so this is a safe anchor specifically for that case.
 */
export function resolveEffectiveDayStart(planStartTime: string, rawWindows: PlanRawWindow[]): Date {
  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);
  const windows = resolveWindows(rawWindows, dayBase);
  return skipNonWorkingWindows(planStart, 0, 0, windows, true).start;
}
