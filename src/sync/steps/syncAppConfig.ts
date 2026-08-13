// src/sync/steps/syncAppConfig.ts
// Syncs server-managed app constants (GET /shared/app-config) into local
// SQLite. Not site-scoped — same values for every install — but still an
// ISyncStep so it runs through the same bootstrap registry as everything else.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';
import { apiClient } from '@services/apiClient';
import { saveAppConfig } from '@repositories/appConfigRepository';

export class SyncAppConfigStep implements ISyncStep {
  readonly name = 'appConfig';

  async run(_ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get('/shared/app-config');
      const entries: { key: string; value: unknown }[] = (data as any[]).map((d) => ({
        key: d.key,
        value: d.value,
      }));
      await saveAppConfig(entries);
      return { step: this.name, count: entries.length, syncedAt };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
