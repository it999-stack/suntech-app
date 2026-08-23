// src/sync/delta/runDeltaSync.ts
// Steady-state sync orchestrator (Phase 3): push queued local changes, pull
// everything changed since the last cursor, persist the new cursor. This
// replaces running the full bootstrap sequence on every trigger — bootstrap
// stays reserved for first install / full reset (see RootNavigator.tsx).

import { deltaPush, type FlushResult } from '@sync/delta/deltaPush';
import { deltaPull, type DeltaPullResult } from '@sync/delta/deltaPull';
import { getCursor, setCursor } from '@repositories/syncCursorRepository';
import { SyncAppConfigStep } from '@sync/steps/syncAppConfig';

export type DeltaSyncResult = {
  ran: boolean;
  push?: FlushResult;
  pull?: DeltaPullResult;
  error?: string;
};

type DeltaSyncListener = () => void;
const listeners = new Set<DeltaSyncListener>();

/**
 * Subscribe to be notified after every successful delta sync (automatic —
 * reconnect/foreground/periodic via SyncManager — and manual, via
 * useSyncStore's steady-state branch). Local caches derived from synced
 * data (e.g. SiteSettingsContext) should reload here rather than relying on
 * whichever screen happened to trigger the sync.
 */
export function onDeltaSyncComplete(listener: DeltaSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

let inFlight: Promise<DeltaSyncResult> | null = null;

/**
 * No-ops (returns `{ ran: false }`) if no cursor has been established yet —
 * that's bootstrap's job, not this function's. Push errors don't block the
 * pull or the cursor advance: a push conflict is resolved by the pull that
 * immediately follows, not by refusing to proceed.
 *
 * Callers (SyncManager.ts's automatic triggers, useSyncStore's manual one)
 * can fire independently and close together — e.g. a periodic trigger while
 * a just-edited write's debounced cycle is still awaiting a slow push.
 * Without this guard, two overlapping cycles could interleave their own
 * push/pull ordering; piggybacking a concurrent call onto whichever cycle is
 * already running keeps push-then-pull a true single-cycle guarantee.
 */
export function runDeltaSync(siteId: string): Promise<DeltaSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runDeltaSyncInner(siteId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runDeltaSyncInner(siteId: string): Promise<DeltaSyncResult> {
  const cursor = await getCursor(siteId);
  if (!cursor) return { ran: false };

  const push = await deltaPush();

  // app_config isn't part of the per-site pull payload below (it isn't site
  // data — see syncAppConfig.ts) so it's refreshed here too, not just at
  // bootstrap, so a server-side constants change reaches already-installed
  // apps without a reinstall. Non-fatal: on failure, whatever's already
  // cached locally (or the in-memory defaults) just stays in place until the
  // next successful sync.
  await new SyncAppConfigStep().run({ siteId });

  try {
    const pull = await deltaPull(siteId, cursor);
    await setCursor(siteId, pull.serverTime);
    notifyListeners();
    return { ran: true, push, pull };
  } catch (err) {
    return {
      ran: true,
      push,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
