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
        // Steps with no templates for this site aren't configured here — skip
        // so the local cache only ever holds this site's steps/durations.
        if (!step.templates?.length) continue;

        steps.push({
          id: step.id,
          stepName: step.step_name,
          sequenceOrder: step.sequence_order,
          track: step.track,
          isSplittable: step.is_splittable,
        });

        for (const t of step.templates) {
          templates.push({
            id: t.id,
            stepId: step.id,
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