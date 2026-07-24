// src/sync/bootstrap/stepRegistry.ts
// Registers all sync steps that run during bootstrap.
// To add a new step: import the class and add an instance below.
// The orchestrator (bootstrapSync.ts) never needs to change.

import type { ISyncStep } from './ISyncStep';
import { SyncAreasStep } from '@/sync/steps/syncAreas';
import { SyncDimensionsStep } from '@sync/steps/syncDimensions';
import { SyncShiftsStep } from '@sync/steps/syncShifts';
import { SyncMachinesStep } from '@sync/steps/syncMachines';
import { SyncPersonnelStep } from '@sync/steps/syncPersonnel';
import { SyncStepsStep } from '@sync/steps/syncSteps';
import { SyncAppPlanStep } from '../steps/syncAppPlan';
import { SyncActivePlanStep } from '../steps/syncActivePlan';

export const BOOTSTRAP_STEPS: ISyncStep[] = [
  // Pull reference data from server
  new SyncAreasStep(),
  new SyncDimensionsStep(),
  new SyncShiftsStep(),
  new SyncMachinesStep(),
  new SyncPersonnelStep(),
  new SyncStepsStep(),

  // Push local dirty checklists (actuals) to the server first — must run
  // before SyncActivePlanStep below, or that pull's wholesale replace of
  // plan/actual steps would clobber not-yet-synced local edits before they
  // ever reach the server.
  new SyncAppPlanStep(),

  // Then pull today's checklist back down — this is what lets a
  // reinstalled/data-cleared device recover its in-progress plan instead of
  // regenerating (and colliding with) one.
  new SyncActivePlanStep(),
];
