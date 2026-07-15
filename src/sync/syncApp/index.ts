// src/sync/syncApp/index.ts
// Public API for sync-up (app to server) operations.

export { runSyncApp } from './syncAppToServer';
export type { SyncAppCallbacks } from './syncAppToServer';
export type { SyncChecklist, SyncPlanStep, SyncActualStep, SyncAppPlanPayload, SyncAppPlanResponse } from '../SyncAppPlanPayload';