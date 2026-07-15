// src/sync/syncApp/stepRegistry.ts
// Registers all sync-up steps that push app data to server.
// To add a new step: import the class and add an instance below.
// The orchestrator (syncAppToSever.ts) never needs to change.

import type { ISyncStep } from '../bootstrap/ISyncStep';
import { SyncAppPlanStep } from '../steps/syncAppPlan';

export const SYNC_APP_STEPS: ISyncStep[] = [
  new SyncAppPlanStep(),
];