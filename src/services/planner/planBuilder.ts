// src/services/planner/planBuilder.ts
// Orchestration: fetch reference data, partition into machine-sharing
// components, schedule each, validate, and return the preview result — see
// pilingPlannerService.ts for the algorithm overview.

import { initDb } from '@db/client';
import { pilingSteps, type PilingStep } from '@db/schema';
import { planEndTime } from '@/types/plan';
import { partitionIntoComponents, computeFingerprint, computeOverridesFingerprint } from './planComponents';
import { scheduleComponent } from './planScheduler';
import { fetchTemplateRows, fetchRawWindows } from './planReferenceData';
import { validateContinuingSteps } from './planValidation';
import type {
  PreviewPileInput,
  PreviewPlanStep,
  EffectivePlanWindow,
  BuildPlanRowsResult,
  PlanScheduleCache,
  PlanTemplateRow,
  PlanRawWindow,
} from './planTypes';

async function buildPlanRowsForPiles(options: {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
  /** Server-managed — mirrors APP_CONFIG["no_new_step_cutoff_minutes"] (see useAppConfig()). */
  noNewStepCutoffMinutes: number;
  /** Pre-fetched, session-cached reference data — see fetchPlanReferenceData().
   * Any field left out falls back to fetching it here, so existing callers
   * that don't pass this at all keep working unchanged. */
  referenceData?: {
    allSteps?: PilingStep[];
    templateRows?: PlanTemplateRow[];
    rawWindows?: PlanRawWindow[];
  };
  /** Previous call's result, reused for any component whose piles' stepTrackOverrides didn't
   * change — see PlanScheduleCache. Pass null/undefined to always force a full recompute (the
   * one-shot persist path in generatePlan() does this — no repeated-recompute need there). */
  scheduleCache?: PlanScheduleCache | null;
}): Promise<BuildPlanRowsResult> {
  const { piles, planStartTime, siteId, shiftTypeId, selectedStepIds, noNewStepCutoffMinutes, referenceData, scheduleCache } = options;

  const db = await initDb();

  // These three are mutually independent (none reads another's result), and
  // 100% static for a whole wizard session — fetched in parallel, and skipped
  // entirely for whichever pieces the caller already has cached.
  const [allSteps, templateRows, rawWindows] = await Promise.all([
    referenceData?.allSteps
      ? Promise.resolve(referenceData.allSteps)
      : db.select().from(pilingSteps).orderBy(pilingSteps.sequenceOrder).all(),
    referenceData?.templateRows
      ? Promise.resolve(referenceData.templateRows)
      : fetchTemplateRows(db, siteId),
    referenceData?.rawWindows
      ? Promise.resolve(referenceData.rawWindows)
      : fetchRawWindows(db, siteId, shiftTypeId),
  ]);

  const selectedStepSet = selectedStepIds?.length ? new Set(selectedStepIds) : null;
  const pileSteps = selectedStepSet
    ? allSteps.filter((s) => selectedStepSet.has(s.id))
    : allSteps;

  const templateMap = new Map(templateRows.map((t) => [`${t.dimensionId}|${t.stepId}`, t]));

  const now = Date.now();
  const planStart = new Date(planStartTime);
  const dayBase = new Date(planStart);
  dayBase.setHours(0, 0, 0, 0);
  const planEnd = new Date(planEndTime(planStart.toISOString()));

  // Partition into machine-sharing components once per call (cheap — O(piles), never itself
  // cached) — see partitionIntoComponents(). A fingerprint match means every component's
  // membership and non-override inputs are unchanged from the cached run, so only the
  // component(s) whose piles' overrides actually differ need to be rescheduled.
  const componentIdByPileId = partitionIntoComponents(piles);
  const pilesByComponent = new Map<string, PreviewPileInput[]>();
  for (const pile of piles) {
    const componentId = componentIdByPileId.get(pile.checklistPileId)!;
    const list = pilesByComponent.get(componentId);
    if (list) list.push(pile);
    else pilesByComponent.set(componentId, [pile]);
  }

  const fingerprint = computeFingerprint(piles, planStartTime, siteId, shiftTypeId, selectedStepIds);
  const cacheUsable = scheduleCache?.fingerprint === fingerprint;

  const planRows: PreviewPlanStep[] = [];
  const warningPileIds: string[] = [];
  const windowsByMachineId: Record<string, EffectivePlanWindow[]> = {};
  const componentResults: PlanScheduleCache['componentResults'] = {};

  for (const [componentId, componentPiles] of pilesByComponent) {
    const overridesFingerprint = computeOverridesFingerprint(componentPiles);
    const cached = cacheUsable ? scheduleCache!.componentResults[componentId] : undefined;
    const result =
      cached?.overridesFingerprint === overridesFingerprint
        ? cached
        : {
            overridesFingerprint,
            ...scheduleComponent(
              componentPiles,
              pileSteps,
              templateMap,
              rawWindows,
              dayBase,
              planStart,
              planEnd,
              now,
              noNewStepCutoffMinutes,
            ),
          };
    componentResults[componentId] = result;
    planRows.push(...result.rows);
    warningPileIds.push(...result.warningPileIds);
    Object.assign(windowsByMachineId, result.windowsByMachineId);
  }

  validateContinuingSteps(planRows);

  return { planRows, warningPileIds, windowsByMachineId, scheduleCache: { fingerprint, componentResults } };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratePlanPreviewOptions {
  piles: PreviewPileInput[];
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
  /** Server-managed — mirrors APP_CONFIG["no_new_step_cutoff_minutes"] (see useAppConfig()). */
  noNewStepCutoffMinutes: number;
  /** Pre-fetched, session-cached reference data — see fetchPlanReferenceData(). */
  referenceData?: {
    allSteps?: PilingStep[];
    templateRows?: PlanTemplateRow[];
    rawWindows?: PlanRawWindow[];
  };
  /** Previous call's BuildPlanRowsResult.scheduleCache — reused for any machine-sharing
   * component whose piles' stepTrackOverrides didn't change since that call. See
   * PlanScheduleCache. Omit to always fully recompute. */
  scheduleCache?: PlanScheduleCache | null;
}

export async function generatePlanPreview(
  options: GeneratePlanPreviewOptions,
): Promise<BuildPlanRowsResult> {
  return buildPlanRowsForPiles(options);
}

export { buildPlanRowsForPiles };
