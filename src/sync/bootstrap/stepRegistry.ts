// src/sync/bootstrap/stepRegistry.ts
// Registers all sync steps that run during bootstrap.
// To add a new step: import the class and add an instance below.
// The orchestrator (bootstrapSync.ts) never needs to change.

import type { ISyncStep } from './ISyncStep';
import { SyncAppConfigStep } from '@sync/steps/syncAppConfig';
import { SyncLocationsStep } from '@/sync/steps/syncLocations';
import { SyncDimensionsStep } from '@sync/steps/syncDimensions';
import { SyncShiftsStep } from '@sync/steps/syncShifts';
import { SyncMachinesStep } from '@sync/steps/syncMachines';
import { SyncPersonnelStep } from '@sync/steps/syncPersonnel';
import { SyncSiteCoordinatorsStep } from '@sync/steps/syncSiteCoordinators';
import { SyncRoleDefaultsStep } from '@sync/steps/syncRoleDefaults';
import { SyncStepsStep } from '@sync/steps/syncSteps';
import { SyncChecklistHistoryStep } from '@sync/steps/syncChecklistHistory';
import { SyncAppPlanStep } from '../steps/syncAppPlan';
import { SyncActivePlanStep } from '../steps/syncActivePlan';

export const BOOTSTRAP_STEPS: ISyncStep[] = [
  // Server-managed constants — not site data, but pulled first so any step
  // below could in principle read a config value if it ever needs to.
  new SyncAppConfigStep(),

  // Pull reference data from server
  new SyncLocationsStep(),
  new SyncDimensionsStep(),
  new SyncShiftsStep(),
  new SyncMachinesStep(),
  new SyncPersonnelStep(),
  new SyncSiteCoordinatorsStep(),
  new SyncRoleDefaultsStep(),
  new SyncStepsStep(),

  // Pull the site's full checklist/actuals history — recovers everything a
  // reinstalled/data-cleared device is missing beyond today. Runs before the
  // push/today's-pull pair below so it never clobbers what those write.
  new SyncChecklistHistoryStep(),

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
