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

export const BOOTSTRAP_STEPS: ISyncStep[] = [
  // Pull data from server
  new SyncAreasStep(),
  new SyncDimensionsStep(),
  new SyncShiftsStep(),
  new SyncMachinesStep(),
  new SyncPersonnelStep(),
  new SyncStepsStep(),

  // sync App to server
  new SyncAppPlanStep(),
];
