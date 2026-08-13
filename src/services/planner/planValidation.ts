// src/services/planner/planValidation.ts
// Post-schedule sanity checks — see pilingPlannerService.ts for the
// algorithm overview.

import { isContinuingStep } from '@utils/helpers';
import type { PreviewPlanStep } from './planTypes';

/**
 * Dev-time sanity check (design invariant: at most one continuing step per pile per day, and
 * it's always the last one by sequenceOrder). Structurally guaranteed by scheduleComponent's
 * loop — this is cheap insurance against a future regression, not required for correctness
 * today. Runs once over the final merged rows regardless of which components were cache
 * hits vs freshly computed — it's inherently per-pile, so this is correct either way and also
 * re-validates cached piles against a future bug in the merge/reuse logic itself.
 */
export function validateContinuingSteps(planRows: PreviewPlanStep[]): void {
  const rowsByPile = new Map<string, PreviewPlanStep[]>();
  for (const row of planRows) {
    const list = rowsByPile.get(row.checklistPileId);
    if (list) list.push(row);
    else rowsByPile.set(row.checklistPileId, [row]);
  }
  for (const [pileId, rows] of rowsByPile) {
    const continuingRows = rows.filter((r) => isContinuingStep(r));
    if (continuingRows.length > 1) {
      console.warn(`[planner] Pile ${pileId} has more than one continuing step — expected at most one.`);
      continue;
    }
    if (continuingRows.length === 1) {
      const maxSequenceOrder = Math.max(...rows.map((r) => r.sequenceOrder));
      if (continuingRows[0].sequenceOrder !== maxSequenceOrder) {
        console.warn(
          `[planner] Pile ${pileId}'s continuing step is not its last step by sequenceOrder.`,
        );
      }
    }
  }
}
