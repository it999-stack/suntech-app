// src/sync/steps/syncSteps.ts

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';

import { apiClient } from '@services/apiClient';

import { saveSteps } from '@repositories/stepsRepository';
import { saveDurationTemplates } from '@repositories/durationTemplatesRepository';

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
        steps.push({
          id: step.id,
          stepName: step.step_name,
          sequenceOrder: step.sequence_order,
          track: step.track,
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
      await saveDurationTemplates(templates);

      return {
        step: this.name,
        count: steps.length,
        syncedAt,
      };
    } catch (err) {
      return {
        step: this.name,
        count: 0,
        syncedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}