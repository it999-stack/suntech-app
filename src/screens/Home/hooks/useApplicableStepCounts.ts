// src/screens/Home/hooks/useApplicableStepCounts.ts

import { useEffect, useState } from 'react';
import { eq } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingDimensions,
  pilingPiles,
  pilingSteps,
  pilingStepDurationTemplates,
  type PilingStep,
} from '@db/schema';
import { buildTemplateMinutesMap, type TemplateKeyLookup } from '@/services/pileApplicableSteps';

export interface ApplicableStepsLookup {
  allSteps: PilingStep[];
  templateMinutes: TemplateKeyLookup;
  dimensionByPileId: Map<string, string | null>;
}

const EMPTY: ApplicableStepsLookup = { allSteps: [], templateMinutes: new Map(), dimensionByPileId: new Map() };

/**
 * The same "site step catalog ∩ duration templates for this pile's dimension"
 * data usePileGroups/resumeWorkService already load for the Log Actuals/plan
 * screens — here just enough of it for the Home screen's own completed/
 * in-progress tile counts to use the pile's real applicable step count
 * instead of today's plan-step count (see derivePileStatus in utils/helpers.ts).
 */
export function useApplicableStepCounts(siteId: string | undefined, refreshKey: unknown): ApplicableStepsLookup {
  const [lookup, setLookup] = useState<ApplicableStepsLookup>(EMPTY);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    (async () => {
      const db = await initDb();
      const allSteps = await db.select().from(pilingSteps).orderBy(pilingSteps.sequenceOrder).all();
      const templateRows = await db
        .select({
          stepId: pilingStepDurationTemplates.stepId,
          dimensionId: pilingStepDurationTemplates.dimensionId,
          durationMinutes: pilingStepDurationTemplates.durationMinutes,
        })
        .from(pilingStepDurationTemplates)
        .innerJoin(pilingDimensions, eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id))
        .where(eq(pilingDimensions.siteId, siteId))
        .all();
      const pileRows = await db
        .select({ id: pilingPiles.id, dimensionId: pilingPiles.dimensionId })
        .from(pilingPiles)
        .where(eq(pilingPiles.siteId, siteId))
        .all();

      if (cancelled) return;
      setLookup({
        allSteps,
        templateMinutes: buildTemplateMinutesMap(templateRows),
        dimensionByPileId: new Map(pileRows.map((p) => [p.id, p.dimensionId])),
      });
    })().catch((err) => console.error('Failed to load applicable-step lookup:', err));

    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  return lookup;
}
