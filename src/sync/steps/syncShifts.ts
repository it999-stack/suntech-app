// src/sync/steps/syncShifts.ts
// Syncs shift types and non-working windows from server into local SQLite.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import {
  saveShiftTypes,
  saveNonWorkingWindows,
} from '@repositories/shiftsRepository';
import type {
  NewPilingShiftType,
  NewPilingNonWorkingWindow,
} from '@db/schema';

export class SyncShiftsStep implements ISyncStep {
  readonly name = 'shifts';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const { data } = await apiClient.get(
        `/piling/sites/${ctx.siteId}/shifts`
      );

      const shiftRows: NewPilingShiftType[] = [];
      const windowRows: NewPilingNonWorkingWindow[] = [];

      for (const shift of data as any[]) {
        shiftRows.push({
          id: shift.id,
          siteId: shift.site_id,
          name: shift.name,
          startTime: shift.start_time,
          endTime: shift.end_time,
          syncedAt,
        });

        for (const window of shift.windows ?? []) {
          windowRows.push({
            id: window.id,
            shiftTypeId: shift.id,
            label: window.label,
            startTime: window.start_time,
            endTime: window.end_time,
            behavior: window.behavior,
            syncedAt,
          });
        }
      }

      await saveShiftTypes(shiftRows);
      await saveNonWorkingWindows(windowRows);
      
      return {
        step: this.name,
        count: shiftRows.length,
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