// src/sync/bootstrap/stepRegistry.ts
// Registers all sync steps that run during bootstrap.
// To add a new step: import the class and add an instance below.
// The orchestrator (bootstrapSync.ts) never needs to change.

import type { ISyncStep } from './ISyncStep';
import { SyncPilesStep } from '@sync/steps/syncPiles';
import { SyncDimensionsStep } from '@sync/steps/syncDimensions';
import { SyncShiftsStep } from '@sync/steps/syncShifts';
import { SyncMachinesStep } from '@sync/steps/syncMachines';
import { SyncPersonnelStep } from '@sync/steps/syncPersonnel';

export const BOOTSTRAP_STEPS: ISyncStep[] = [
  new SyncPilesStep(),
  new SyncDimensionsStep(),
  new SyncShiftsStep(),
  new SyncMachinesStep(),
  new SyncPersonnelStep(),
];
