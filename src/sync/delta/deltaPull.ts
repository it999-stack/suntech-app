// src/sync/delta/deltaPull.ts
// Steady-state delta pull (Phase 3) — GET /sync/pull?cursor=, applies the
// response locally, and returns the new cursor for the caller to persist.
// Unlike bootstrap's per-entity steps, this is one request covering every
// entity, so it's a single function rather than the ISyncStep registry.

import { apiClient } from '@services/apiClient';

import { saveLocations, deleteLocationsByIds } from '@repositories/locationsRepository';
import { savePiles, deletePilesByIds } from '@repositories/pilesRepository';
import { saveDimensions, deleteDimensionsByIds } from '@repositories/dimensionsRepository';
import { saveMachines, deleteMachinesByIds } from '@repositories/machinesRepository';
import { saveContractors, deleteContractorsByIds } from '@repositories/contractorsRepository';
import { savePersonnel, deletePersonnelByIds } from '@repositories/personnelRepository';
import { applyPileMeasurementsPull } from '@sync/steps/syncPileMeasurements';
import { replaceSiteCoordinators } from '@repositories/siteCoordinatorsRepository';
import {
  saveShiftTypes,
  saveNonWorkingWindows,
  deleteShiftTypesByIds,
  deleteNonWorkingWindowsByIds,
} from '@repositories/shiftsRepository';
import { saveDurationTemplates } from '@repositories/durationTemplatesRepository';
import { saveSteps } from '@repositories/stepsRepository';
import {
  hydrateChecklistFromServer,
  purgeChecklistPilesByIds,
  purgeChecklistsByIds,
  getPileIdsForChecklistIds,
} from '@repositories/checklistRepository';
import { getDirtyChecklistIds } from '@repositories/syncQueueRepository';

import type {
  NewPilingLocation,
  NewPilingPile,
  NewPilingDimension,
  NewPilingMachine,
  NewPilContractor,
  NewPilingSitePersonnel,
  NewPilingShiftType,
  NewPilingNonWorkingWindow,
  NewPilingStep,
  NewPilingStepDurationTemplate,
  NewPilSiteCoordinator,
} from '@db/schema';

export type DeltaPullResult = {
  serverTime: string;
  checklistsApplied: number;
};

export async function deltaPull(siteId: string, cursor: string): Promise<DeltaPullResult> {
  const { data } = await apiClient.get(`/piling/sites/${siteId}/sync/pull`, {
    params: { cursor },
  });
  const syncedAt = Date.now();

  const locationRows: NewPilingLocation[] = (data.locations as any[]).map((l) => ({
    id: l.id,
    siteId: l.site_id,
    name: l.name,
    code: l.code ?? null,
    sortOrder: l.sort_order ?? 0,
    isActive: true,
    createdAt: syncedAt,
    updatedAt: syncedAt,
  }));
  await saveLocations(locationRows);
  await deleteLocationsByIds((data.deleted_location_ids as string[]) ?? []);

  const pileRows: NewPilingPile[] = (data.piles as any[]).map((p) => ({
    id: p.id,
    siteId: p.site_id,
    locationId: p.location_id ?? null,
    pileIdCode: p.pile_id_code,
    area: p.area ?? null,
    dimensionId: p.dimension_id,
    notes: p.notes ?? null,
    syncedAt,
  }));
  await savePiles(pileRows);
  await deletePilesByIds((data.deleted_pile_ids as string[]) ?? []);

  const dimensionRows: NewPilingDimension[] = (data.dimensions as any[]).map((d) => ({
    id: d.id,
    siteId: d.site_id,
    dia: d.dia,
    depth: d.depth,
    label: d.label ?? null,
    syncedAt,
  }));
  await saveDimensions(dimensionRows);
  await deleteDimensionsByIds((data.deleted_dimension_ids as string[]) ?? []);

  const machineRows: NewPilingMachine[] = (data.machines as any[]).map((m) => ({
    id: m.id,
    siteId: m.site_id,
    machineNo: m.machine_no,
    type: m.type,
    status: m.status,
    syncedAt,
  }));
  await saveMachines(machineRows);
  await deleteMachinesByIds((data.deleted_machine_ids as string[]) ?? []);

  const contractorRows: NewPilContractor[] = (data.contractors as any[]).map((c) => ({
    id: c.id,
    siteId: c.site_id,
    name: c.name,
    isActive: c.is_active ?? true,
    syncedAt,
  }));
  await saveContractors(contractorRows);
  await deleteContractorsByIds((data.deleted_contractor_ids as string[]) ?? []);

  const personnelRows: NewPilingSitePersonnel[] = (data.personnel as any[]).map((p) => ({
    id: p.id,
    siteId: p.site_id,
    name: p.name,
    designation: p.designation,
    phone: p.phone ?? null,
    email: p.email ?? null,
    employeeCode: p.employee_code ?? null,
    isActive: p.is_active ?? true,
    syncedAt,
  }));
  await savePersonnel(personnelRows);
  await deletePersonnelByIds((data.deleted_personnel_ids as string[]) ?? []);

  const shiftRows: NewPilingShiftType[] = (data.shift_types as any[]).map((s) => ({
    id: s.id,
    siteId: s.site_id,
    name: s.name,
    startTime: s.start_time,
    endTime: s.end_time,
    syncedAt,
  }));
  await saveShiftTypes(shiftRows);
  await deleteShiftTypesByIds((data.deleted_shift_type_ids as string[]) ?? []);

  const windowRows: NewPilingNonWorkingWindow[] = (data.non_working_windows as any[]).map((w) => ({
    id: w.id,
    shiftTypeId: w.shift_type_id,
    label: w.label,
    startTime: w.start_time,
    endTime: w.end_time,
    behavior: w.behavior,
    syncedAt,
  }));
  await saveNonWorkingWindows(windowRows);
  await deleteNonWorkingWindowsByIds((data.deleted_non_working_window_ids as string[]) ?? []);

  const templateRows: NewPilingStepDurationTemplate[] = (data.step_duration_templates as any[]).map((t) => ({
    id: t.id,
    stepId: t.step_id,
    dimensionId: t.dimension_id,
    durationMinutes: t.duration_minutes,
    bufferBeforeMinutes: t.buffer_before_minutes ?? 0,
    syncedAt,
  }));
  await saveDurationTemplates(templateRows);

  // Always the site's full current list, not a delta (see SyncPullOut.site_steps
  const stepRows: NewPilingStep[] = (data.site_steps as any[]).map((s) => ({
    id: s.step_id,
    stepName: s.step_name,
    sequenceOrder: s.sequence_order,
    track: s.track,
    isSplittable: s.is_splittable,
  }));
  await saveSteps(stepRows);

  // Always the site's full current list, not a delta — see the schema
  // comment on SyncPullOut.coordinators server-side for why. A full replace
  // (not upsert) is what lets a removed/reassigned coordinator actually
  // disappear locally.
  const coordinatorRows: NewPilSiteCoordinator[] = (data.coordinators as any[]).map((c) => ({
    id: c.id,
    siteId,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    syncedAt,
  }));
  await replaceSiteCoordinators(siteId, coordinatorRows);

  const checklists = (data.checklists as any[]) ?? [];
  // Skip checklists that still have unsynced local edits (e.g. an actual time
  // entered while a push for this same checklist was still in flight) — the
  // server's copy here predates that edit, and wholesale-replacing local data
  // with it would silently erase the edit. It gets reconciled by hydration on
  // a later pull, once the checklist has been flushed clean.
  const dirtyIds = new Set(await getDirtyChecklistIds());
  for (const checklist of checklists) {
    if (dirtyIds.has(checklist.id)) continue;
    await hydrateChecklistFromServer(checklist);
  }
  await purgeChecklistPilesByIds((data.deleted_checklist_pile_ids as string[]) ?? []);
  const deletedChecklistIds = ((data.deleted_checklist_ids as string[]) ?? []).filter(
    (id) => !dirtyIds.has(id),
  );
  await purgeChecklistsByIds(deletedChecklistIds);

  // Same guard as the checklist skip above, one hop further: pile
  // measurements are keyed by pileId rather than checklistId, so resolve the
  // already-computed dirtyIds to the physical piles they cover and skip
  // those — saveMeasurementsBatch wholesale-replaces every field for a pile,
  // so applying it here while a local edit for that pile is still unconfirmed
  // would silently erase it (the bug this fixes). Reconciled on a later pull
  // once the checklist has been flushed clean, same as above.
  const dirtyPileIds = new Set(
    dirtyIds.size > 0 ? await getPileIdsForChecklistIds([...dirtyIds]) : [],
  );
  const pileMeasurementRows = ((data.pile_measurements as any[]) ?? []).filter(
    (m) => !dirtyPileIds.has(m.pile_id),
  );
  // No deleted-ids list — pile measurements are never independently
  // hard-deleted (see the server contract / syncPileMeasurements.ts).
  await applyPileMeasurementsPull(pileMeasurementRows);

  return { serverTime: data.server_time as string, checklistsApplied: checklists.length };
}
