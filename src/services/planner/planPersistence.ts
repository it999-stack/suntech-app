// src/services/planner/planPersistence.ts
// The generatePlan() persist path — see pilingPlannerService.ts for the
// algorithm overview.

import { initDb } from '@db/client';
import { pilingPiles } from '@db/schema';
import { getChecklistPiles } from '@repositories/checklistRepository';
import { insertPlanSteps, deletePlanStepsForChecklist } from '@repositories/planRepository';
import { buildPlanRowsForPiles } from './planBuilder';
import type { PreviewPileInput } from './planTypes';

export interface GeneratePlanOptions {
  checklistId: string;
  planStartTime: string;
  siteId: string;
  shiftTypeId?: string;
  selectedStepIds?: string[];
  resumeWorkByPileId?: Record<string, NonNullable<PreviewPileInput['resumeWork']>>;
  /** Server-managed — mirrors APP_CONFIG["no_new_step_cutoff_minutes"] (see useAppConfig()). */
  noNewStepCutoffMinutes: number;
}

export interface PlanGenerationResult {
  planStepsCreated: number;
  warningPiles: string[];
}

export async function generatePlan(
  options: GeneratePlanOptions,
): Promise<PlanGenerationResult> {
  const { checklistId, planStartTime, siteId, shiftTypeId, selectedStepIds, resumeWorkByPileId, noNewStepCutoffMinutes } = options;
  const db = await initDb();

  const checklistPilesRows = await getChecklistPiles(checklistId);
  if (!checklistPilesRows.length) {
    throw new Error('No piles in checklist — cannot generate plan.');
  }

  const pileRows = await db.select().from(pilingPiles).all();
  const pileMap = new Map(pileRows.map((p) => [p.id, p]));

  const pilesInput: PreviewPileInput[] = [];
  const unknownPiles: string[] = [];
  for (const cp of checklistPilesRows) {
    const pile = pileMap.get(cp.pileId);
    if (!pile) {
      unknownPiles.push(cp.pileId);
      continue;
    }
    pilesInput.push({
      checklistPileId: cp.id,
      pileId: pile.id,
      pileIdCode: pile.pileIdCode,
      dimensionId: pile.dimensionId,
      rigId: cp.rigId,
      craneId: cp.craneId ?? undefined,
      resumeWork: resumeWorkByPileId?.[pile.id],
    });
  }

  await deletePlanStepsForChecklist(checklistId);

  const { planRows, warningPileIds } = await buildPlanRowsForPiles({
    piles: pilesInput,
    planStartTime,
    siteId,
    shiftTypeId,
    selectedStepIds,
    noNewStepCutoffMinutes,
  });

  await insertPlanSteps(planRows);

  return {
    planStepsCreated: planRows.length,
    warningPiles: [...unknownPiles, ...warningPileIds],
  };
}
