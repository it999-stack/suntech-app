// src/sync/steps/syncPileMeasurements.ts
// Applies the steady-state delta pull's flat `pile_measurements` array into
// local SQLite.
//
// Unlike contractors/machines, pile measurements have no dedicated bootstrap
// GET endpoint of their own and no `deleted_*_ids` list (they're never
// independently hard-deleted — see the server contract) — so this is not an
// ISyncStep registered in stepRegistry.ts. First-run seeding instead comes
// from bootstrap-history's nested per-pile `measurements` object, applied by
// hydrateChecklistFromServer (see checklistRepository.ts). This file covers
// only the steady-state delta path: called directly from deltaPull.ts, which
// — like every other reference-data entity there — applies its array inline
// rather than through the ISyncStep bootstrap registry.
//
// Direction: server → app
// Server data: GET /piling/sites/:siteId/sync/pull -> pile_measurements[]

import { saveMeasurementsBatch, type PileMeasurementSyncRow } from '@repositories/pileMeasurementsRepository';

export async function applyPileMeasurementsPull(pileMeasurements: any[] | undefined): Promise<void> {
  if (!pileMeasurements?.length) return;

  const rows: PileMeasurementSyncRow[] = pileMeasurements.map((m) => ({
    pileId: m.pile_id,
    eglM: m.egl_m ?? null,
    pileContractorId: m.pile_contractor_id ?? null,
    cageContractorId: m.cage_contractor_id ?? null,
    pileLengthM: m.pile_length_m ?? null,
    cageWeightKg: m.cage_weight_kg ?? null,
    ctlM: m.ctl_m ?? null,
    colM: m.col_m ?? null,
    boreDepthM: m.bore_depth_m ?? null,
    hookLengthM: m.hook_length_m ?? null,
    flM: m.fl_m ?? null,
    plannedQtyM3: m.planned_qty_m3 ?? null,
    actualQtyM3: m.actual_qty_m3 ?? null,
  }));

  await saveMeasurementsBatch(rows);
}
