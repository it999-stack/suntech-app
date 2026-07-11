// src/sync/steps/syncShifts.ts
// Pushes locally-configured shift types and non-working windows to the server.
//
// Direction: local SQLite → server  (app is the source of truth for shifts)
//
// Server endpoint:
//   POST /piling/sites/:siteId/shifts/sync
//   Body: { shifts: [{ name, start_time, end_time, windows: [{ label, start_time, end_time }] }] }
//
// Prerequisites:
//   - User must be actively assigned to the site (server enforces this — 403 if not).
//   - Shift types and their windows must already be persisted in local SQLite
//     (SiteSettingsContext write-through mutations ensure this).

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import {
  getAllShiftTypes,
  getNonWorkingWindowsBySite,
} from '@repositories/shiftsRepository';

/** Convert minutes-since-midnight → "HH:MM" */
function minutesToTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export class SyncShiftsStep implements ISyncStep {
  readonly name = 'shifts';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      // 1. Read all shift types from local SQLite.
      const shiftRows = await getAllShiftTypes();

      if (shiftRows.length === 0) {
        // Nothing locally configured — skip the push.
        return { step: this.name, count: 0, syncedAt };
      }

      // 2. Read all non-working windows for this site.
      const windowRows = await getNonWorkingWindowsBySite(ctx.siteId);

      // 3. Group windows by shift type id.
      const windowsByShift = new Map<string, typeof windowRows>();
      for (const w of windowRows) {
        if (!windowsByShift.has(w.shiftTypeId)) {
          windowsByShift.set(w.shiftTypeId, []);
        }
        windowsByShift.get(w.shiftTypeId)!.push(w);
      }

      // 4. Build the payload.
      const shifts = shiftRows.map((s) => ({
        name: s.name,
        start_time: s.startTime,   // already "HH:MM" strings in SQLite
        end_time: s.endTime,
        windows: (windowsByShift.get(s.id) ?? []).map((w) => ({
          label: w.label,
          start_time: w.startTime,
          end_time: w.endTime,
        })),
      }));

      // 5. POST to server.
      await apiClient.post(`/piling/sites/${ctx.siteId}/shifts/sync`, { shifts });

      return { step: this.name, count: shifts.length, syncedAt };
    } catch (err: any) {
      // Surface 403 clearly — user is not assigned to the site.
      const message =
        err?.response?.status === 403
          ? 'Not authorised: user is not assigned to this site.'
          : err instanceof Error
          ? err.message
          : String(err);

      return { step: this.name, count: 0, syncedAt, error: message };
    }
  }
}