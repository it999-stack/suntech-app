// src/sync/steps/syncMachines.ts
// Syncs piling_machines for the user's site from server into local SQLite.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/machines

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import { saveMachines, deleteMachinesByIds } from '@repositories/machinesRepository';
import type { NewPilingMachine } from '@db/schema';

export class SyncMachinesStep implements ISyncStep {
  readonly name = 'machines';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/machines`);
      const rows: NewPilingMachine[] = (data.items as any[]).map((m) => ({
        id: m.id,
        siteId: m.site_id,
        machineNo: m.machine_no,
        type: m.type,       // "RIG" | "CRANE"
        status: m.status,   // "ACTIVE" | "INACTIVE"
        syncedAt,
      }));
      await saveMachines(rows);
      await deleteMachinesByIds((data.deleted_ids as string[]) ?? []);
      return { step: this.name, count: rows.length, syncedAt };
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