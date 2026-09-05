// src/screens/Home/generatePlan/useRoleDefaultsSeed.ts
//
// Fresh-plan initialization: pre-fills every role from the site's last-used
// defaults once resource data has loaded. The actual seed-building logic
// lives in planRoleDefaultsSeedService.ts (buildRoleDefaultsSeed) — this
// hook is just the effect that decides *when* to run it and applies the
// result via the applySeed callback usePlanDraft provides.

import { useEffect, useRef } from 'react';
import type { PilingSiteRoleDefault } from '@/db/schema';
import type { SimplePersonnel } from '@/utils/personnelRoles';
import { buildRoleDefaultsSeed, type RoleDefaultsSeed } from '@/services/planRoleDefaultsSeedService';
import type { SimpleMachine } from './useGeneratePlanData';

export function useRoleDefaultsSeed(args: {
  dataLoading: boolean;
  isEditMode: boolean;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  roleDefaults: PilingSiteRoleDefault[];
  personnel: SimplePersonnel[];
  applySeed: (seed: RoleDefaultsSeed) => void;
}): void {
  const { dataLoading, isEditMode, rigs, cranes, roleDefaults, personnel, applySeed } = args;

  const roleDefaultsSeeded = useRef(false);
  useEffect(() => {
    if (dataLoading || roleDefaultsSeeded.current || isEditMode) return;
    if (rigs.length === 0 && cranes.length === 0 && roleDefaults.length === 0) return;
    roleDefaultsSeeded.current = true;

    applySeed(buildRoleDefaultsSeed({ rigs, cranes, roleDefaults, personnel }));
  }, [dataLoading, roleDefaults, isEditMode, rigs, cranes, personnel, applySeed]);
}
