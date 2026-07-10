// src/sync/bootstrap/stepRegistry.ts
// Registers all sync steps that run during bootstrap.
// To add a new step: import the class and add an instance below.
// The orchestrator (bootstrapSync.ts) never needs to change.

import type { ISyncStep } from './ISyncStep';
import { SyncPilesStep } from '../steps/syncPiles';
import { SyncDimensionsStep } from '../steps/syncDimensions';
import { SyncShiftsStep } from '../steps/syncShifts';
import { SyncMachinesStep } from '../steps/syncMachines';
import { SyncPersonnelStep } from '../steps/syncPersonnel';

export const BOOTSTRAP_STEPS: ISyncStep[] = [
  new SyncPilesStep(),
  new SyncDimensionsStep(),
  new SyncShiftsStep(),
  new SyncMachinesStep(),
  new SyncPersonnelStep(),
];
