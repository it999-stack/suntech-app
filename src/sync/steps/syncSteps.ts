// src/sync/steps/syncSteps.ts

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';

import { apiClient } from '@services/apiClient';

import { saveSteps } from '@repositories/stepsRepository';
import { deleteDurationTemplatesForSite, saveDurationTemplates } from '@repositories/durationTemplatesRepository';

import type {
  NewPilingStep,
  NewPilingStepDurationTemplate,
} from '@db/schema';

export class SyncStepsStep implements ISyncStep {
  readonly name = 'steps';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const { data } = await apiClient.get(
        `/piling/sites/${ctx.siteId}/steps`,
      );

      const steps: NewPilingStep[] = [];
      const templates: NewPilingStepDurationTemplate[] = [];

      for (const step of data as any[]) {
        // The server now returns exactly this site's chosen/ordered steps
        // (pil_site_steps), not the full global catalog — no client-side
        // filtering needed anymore. `step.id` here is the pil_site_steps id;
        // the local pilingSteps.id PK must be `step.step_id` (the catalog
        // id), since that's what duration templates and plan/actual step
        // rows join against, matching the server-side FK target.
        steps.push({
          id: step.step_id,
          stepName: step.step_name,
          sequenceOrder: step.sequence_order,
          track: step.track,
          isSplittable: step.is_splittable,
        });

        for (const t of step.templates) {
          templates.push({
            id: t.id,
            stepId: step.step_id,
            dimensionId: t.dimension_id,
            durationMinutes: t.duration_minutes,
            bufferBeforeMinutes: t.buffer_before_minutes ?? 0,
            syncedAt,
          });
        }
      }

      await saveSteps(steps);
      // Bootstrap always has the site's full current template set, so it's
      // safe to purge stale rows here (unlike deltaPull, which only ever has
      // a partial batch — see saveDurationTemplates's doc comment).
      await deleteDurationTemplatesForSite(ctx.siteId);
      await saveDurationTemplates(templates);

      return {
        step: this.name,
        count: steps.length,
        syncedAt,
      };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}