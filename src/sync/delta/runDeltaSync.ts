// src/sync/delta/runDeltaSync.ts
// Steady-state sync orchestrator (Phase 3): push queued local changes, pull
// everything changed since the last cursor, persist the new cursor. This
// replaces running the full bootstrap sequence on every trigger — bootstrap
// stays reserved for first install / full reset (see RootNavigator.tsx).

import { deltaPush, type FlushResult } from '@sync/delta/deltaPush';
import { deltaPull, type DeltaPullResult } from '@sync/delta/deltaPull';
import { getCursor, setCursor } from '@repositories/syncCursorRepository';

export type DeltaSyncResult = {
  ran: boolean;
  push?: FlushResult;
  pull?: DeltaPullResult;
  error?: string;
};

/**
 * No-ops (returns `{ ran: false }`) if no cursor has been established yet —
 * that's bootstrap's job, not this function's. Push errors don't block the
 * pull or the cursor advance: a push conflict is resolved by the pull that
 * immediately follows, not by refusing to proceed.
 */
export async function runDeltaSync(siteId: string): Promise<DeltaSyncResult> {
  const cursor = await getCursor(siteId);
  if (!cursor) return { ran: false };

  const push = await deltaPush();

  try {
    const pull = await deltaPull(siteId, cursor);
    await setCursor(siteId, pull.serverTime);
    return { ran: true, push, pull };
  } catch (err) {
    return {
      ran: true,
      push,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
