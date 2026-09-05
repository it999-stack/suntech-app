// src/services/pilingPlannerService.ts
//
// Generates pile_plan_steps for a checklist entirely from local SQLite data.
// No server calls needed — all required data is already synced locally:
//   piling_piles, piling_steps, piling_step_duration_templates,
//   piling_dimensions, piling_non_working_windows
//
// Algorithm — free-pool, greedy-by-availability, driven purely by sequence_order:
//   Each machine (rig/crane/compressor, keyed by track) maintains its own `freeAt`
//   timestamp per machine id. Piles are scheduled greedily: at each step, whichever
//   not-yet-scheduled pile's next step can start soonest goes next — not input order.
//   For each pile (in that greedy order), its steps are walked in a single pass in
//   piling_steps.sequence_order (no per-track batching): each step starts at
//   max(its assigned machine's freeAt, this pile's own previous-step-end), then that
//   machine's freeAt and the pile's cursor both advance to the step's end.
//   There is no hardcoded "RIG before CRANE" rule — ordering comes entirely from
//   sequence_order, so any track (including COMPRESSOR) slots in wherever its steps
//   are ordered relative to the others for that pile.
//
// Implementation lives in ./planner/* (planTypes, planWindows,
// planResources, planComponents, planReferenceData, planScheduler,
// planValidation, planBuilder, planPersistence) — this file just re-exports
// the public surface so existing imports of '@/services/pilingPlannerService'

export type {
  PreviewPileInput,
  EffectiveWindow,
  PreviewPlanStep,
  EffectivePlanWindow,
  BuildPlanRowsResult,
  PlanScheduleCache,
  PlanTemplateRow,
  PlanRawWindow,
} from './planner/planTypes';

export { resolveWindows } from './planner/planWindows';

export { fetchPlanReferenceData, resolveEffectiveDayStart, fetchRawWindows } from './planner/planReferenceData';

export { generatePlanPreview, type GeneratePlanPreviewOptions } from './planner/planBuilder';

export { generatePlan, type GeneratePlanOptions, type PlanGenerationResult } from './planner/planPersistence';
