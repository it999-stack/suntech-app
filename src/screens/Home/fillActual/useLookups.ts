// src/screens/Home/fillActual/useLookups.ts
//
// Site-wide machine/pile/personnel lookups for the Log Actuals screen —
// loaded once per site and reloadable on demand (machines specifically,
// after logging a breakdown/idle event that flips a machine's status).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { getPilesBySite } from '@repositories/pilesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getContractorsBySite } from '@repositories/contractorsRepository';
import { getSteps } from '@repositories/stepsRepository';
import { getAllDurationTemplates } from '@repositories/durationTemplatesRepository';
import type {
  PilingMachine,
  PilingPile,
  PilingSitePersonnel,
  PilingStep,
  PilingStepDurationTemplate,
  PilContractor,
} from '@db/schema';

export function useLookups(args: { siteId: string }): {
  machines: PilingMachine[];
  machineMap: Map<string, string>;
  pileMap: Map<string, PilingPile>;
  personnelMap: Map<string, PilingSitePersonnel>;
  /** Site-scoped contractor master list — backs the "Name of Pile
   * Contractor" / "Name of Cage Contractor" fields on the one-time pile
   * measurements (see MeasurementFieldsModal.tsx). */
  contractors: PilContractor[];
  /** Full step catalog (sequence_order ascending) + every duration template
   * for the site. Together these define each pile's APPLICABLE step set, which
   * is what usePileGroups roots its step list on rather than the plan rows —
   * see services/pileApplicableSteps.ts. Both are site-static, so they're
   * loaded once here with the other lookups. */
  allSteps: PilingStep[];
  durationTemplates: PilingStepDurationTemplate[];
  lookupsLoading: boolean;
  reloadMachines: () => Promise<void>;
  machineStatusById: Map<string, string>;
} {
  const { siteId } = args;

  const [machines, setMachines] = useState<PilingMachine[]>([]);
  const [machineMap, setMachineMap] = useState<Map<string, string>>(new Map());
  const [pileMap, setPileMap] = useState<Map<string, PilingPile>>(new Map());
  const [personnelMap, setPersonnelMap] = useState<Map<string, PilingSitePersonnel>>(new Map());
  const [contractors, setContractors] = useState<PilContractor[]>([]);
  const [allSteps, setAllSteps] = useState<PilingStep[]>([]);
  const [durationTemplates, setDurationTemplates] = useState<PilingStepDurationTemplate[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLookupsLoading(true);
    (async () => {
      const [fetchedMachines, piles, personnel, fetchedContractors, steps, templates] = await Promise.all([
        getMachinesBySite(siteId),
        getPilesBySite(siteId),
        getPersonnelBySite(siteId),
        getContractorsBySite(siteId),
        getSteps(),
        getAllDurationTemplates(siteId),
      ]);
      setMachines(fetchedMachines);
      setMachineMap(new Map(fetchedMachines.map((m) => [m.id, m.machineNo])));
      setPileMap(new Map(piles.map((p) => [p.id, p])));
      setPersonnelMap(new Map(personnel.map((p) => [p.id, p])));
      setContractors(fetchedContractors);
      setAllSteps(steps);
      setDurationTemplates(templates);
      setLookupsLoading(false);
    })();
  }, [siteId]);

  // Reloaded after logging any machine event — a breakdown/idle status flip
  // needs to be visible immediately (blocking, the idle tile, the banners),
  // not only after the next full lookups reload.
  const reloadMachines = useCallback(async () => {
    if (!siteId) return;
    const fetched = await getMachinesBySite(siteId);
    setMachines(fetched);
    setMachineMap(new Map(fetched.map((m) => [m.id, m.machineNo])));
  }, [siteId]);

  const machineStatusById = useMemo(() => new Map(machines.map((m) => [m.id, m.status])), [machines]);

  return {
    machines,
    machineMap,
    pileMap,
    personnelMap,
    contractors,
    allSteps,
    durationTemplates,
    lookupsLoading,
    reloadMachines,
    machineStatusById,
  };
}
