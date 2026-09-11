// src/sync/delta/runDeltaSync.ts
// Steady-state sync orchestrator (Phase 3): push queued local changes, pull
// everything changed since the last cursor, persist the new cursor. This
// replaces running the full bootstrap sequence on every trigger — bootstrap
// stays reserved for first install / full reset (see RootNavigator.tsx).
//
// This is the single entry point for steady-state sync: every trigger routes
// through SyncManager.ts, which calls only into here, and nothing else drives
// a push/pull cycle of its own. Consumers that need to *report* sync state
// subscribe to onDeltaSyncStatus() below rather than wrapping a call site, so
// a cycle reports identically no matter what started it (previously only
// syncStore's own trigger path updated the UI, leaving every automatic sync
// invisible to it).

import { deltaPush, type FlushResult } from '@sync/delta/deltaPush';
import { deltaPull, type DeltaPullResult } from '@sync/delta/deltaPull';
import { getCursor, setCursor } from '@repositories/syncCursorRepository';
import { SyncAppConfigStep } from '@sync/steps/syncAppConfig';
import { classifySyncError } from '@sync/bootstrap/stepError';
import type { SyncErrorKind } from '@sync/bootstrap/syncResult';

export type DeltaSyncResult = {
  ran: boolean;
  push?: FlushResult;
  pull?: DeltaPullResult;
  error?: string;
  /** Classification of `error`, set only on failure. Resolved here, at the
   * catch site where the original error object still exists — an observer
   * given only the message string could never recover it. */
  errorKind?: SyncErrorKind;
};

type DeltaSyncListener = () => void;
const listeners = new Set<DeltaSyncListener>();

/**
 * Subscribe to be notified after every successful delta sync, whichever of
 * SyncManager's triggers started it. Local caches derived from synced data
 * (e.g. SiteSettingsContext) should reload here rather than relying on
 * whichever screen happened to trigger the sync.
 */
export function onDeltaSyncComplete(listener: DeltaSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

// ─── Cycle lifecycle ───────────────────────────────────────────────────────
// Distinct from onDeltaSyncComplete above, and deliberately not merged with
// it: that one means "new data landed, reload your cache" and fires only on
// success. This one means "a sync cycle changed state" and fires on every
// outcome, which is what a progress indicator needs.

/** `settled` always follows a `start` — including when the cycle fails — so
 * an observer can never be left stuck showing an in-progress sync. */
export type DeltaSyncStatus =
  | { phase: 'start' }
  | { phase: 'settled'; result: DeltaSyncResult };

type DeltaSyncStatusListener = (status: DeltaSyncStatus) => void;
const statusListeners = new Set<DeltaSyncStatusListener>();

/**
 * Subscribe to the sync cycle's own lifecycle, whatever triggered it —
 * automatic (reconnect/foreground/periodic/new-write) or manual. This is how
 * sync state becomes a property of the cycle rather than of one call site.
 */
export function onDeltaSyncStatus(listener: DeltaSyncStatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatus(status: DeltaSyncStatus): void {
  statusListeners.forEach((listener) => listener(status));
}

let inFlight: Promise<DeltaSyncResult> | null = null;

/**
 * No-ops (returns `{ ran: false }`) if no cursor has been established yet —
 * that's bootstrap's job, not this function's. Push errors don't block the
 * pull or the cursor advance: a push conflict is resolved by the pull that
 * immediately follows, not by refusing to proceed.
 *
 * SyncManager's triggers can fire independently and close together — e.g. a
 * periodic trigger while a just-edited write's debounced cycle is still
 * awaiting a slow push.
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
  // No cursor — bootstrap's job, not ours. Emits no status event on purpose:
  // this isn't a cycle, and announcing one would let a trigger that fires
  // mid-bootstrap immediately "settle" and clear the in-progress state that
  // bootstrap itself is reporting (see syncStore's observer).
  if (!cursor) return { ran: false };

  notifyStatus({ phase: 'start' });
  // .catch rather than a try/finally so the `settled` event is unconditional:
  // deltaPush and ISyncStep.run are both contractually non-throwing today, but
  // a future one that breaks that would otherwise strand every observer
  // showing a sync that never ends.
  const result = await runCycle(siteId, cursor).catch(
    (err): DeltaSyncResult => ({
      ran: true,
      error: err instanceof Error ? err.message : String(err),
      errorKind: classifySyncError(err),
    }),
  );
  notifyStatus({ phase: 'settled', result });
  return result;
}

async function runCycle(siteId: string, cursor: string): Promise<DeltaSyncResult> {
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
      errorKind: classifySyncError(err),
    };
  }
}
