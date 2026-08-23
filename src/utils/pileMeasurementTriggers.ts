// src/utils/pileMeasurementTriggers.ts
//
// Maps a step's (normalized) name + which actual-time field just got
// recorded to the one-time engineering measurement fields that should be
// prompted for at that moment (see PileStepsModal.tsx, which fires this right
// after onSetActualTime resolves). Steps are free-text ("CASING", "BORING",
// etc. — no stable "kind" column), so this matches on
// trim().toUpperCase() of the step name, same as every other step-name
// comparison in this codebase. Deliberately a flat constant list, not a
// config system — there are exactly five triggers and they never change
// per-site.

import type { MeasurementFieldConfig } from '@components/plan/actual/MeasurementFieldsModal';

export type MeasurementTrigger = {
  stepName: string; // normalized — trim().toUpperCase()
  field: 'actualStart' | 'actualEnd';
  title: string;
  fields: MeasurementFieldConfig[];
};

/** Normalize a free-text step name for comparison — trim + uppercase. */
export function normalizeStepName(name: string): string {
  return name.trim().toUpperCase();
}

export const MEASUREMENT_TRIGGERS: MeasurementTrigger[] = [
  {
    stepName: 'CASING',
    field: 'actualStart',
    title: 'Casing — Start Measurements',
    fields: [
      { key: 'eglM', label: 'E.G.L. (Existing Ground Level)', unit: 'm', type: 'number' },
      { key: 'pileContractorId', label: 'Pile Contractor', type: 'contractor' },
      { key: 'cageContractorId', label: 'Cage Contractor', type: 'contractor' },
      { key: 'pileLengthM', label: 'Pile Length', unit: 'm', type: 'number' },
      { key: 'cageWeightKg', label: 'Cage Weight', unit: 'kg', type: 'number' },
    ],
  },
  {
    stepName: 'CASING',
    field: 'actualEnd',
    title: 'Casing — Finish Measurements',
    fields: [
      { key: 'ctlM', label: 'C.T.L. (Casing Top Level)', unit: 'm', type: 'number' },
      { key: 'colM', label: 'C.O.L. (Cut Off Level)', unit: 'm', type: 'number' },
    ],
  },
  {
    stepName: 'BORING',
    field: 'actualEnd',
    title: 'Boring — Finish Measurements',
    fields: [{ key: 'boreDepthM', label: 'Bore Depth', unit: 'm', type: 'number' }],
  },
  {
    stepName: 'CAGE LOWERING',
    field: 'actualEnd',
    title: 'Cage Lowering — Finish Measurements',
    fields: [{ key: 'hookLengthM', label: 'Hook Length', unit: 'm', type: 'number' }],
  },
  {
    stepName: 'CONCRETING',
    field: 'actualEnd',
    title: 'Concreting — Finish Measurements',
    fields: [
      { key: 'flM', label: 'F.L. (Founding Level)', unit: 'm', type: 'number', allowNegative: true },
      { key: 'actualQtyM3', label: 'Concrete Qty', unit: 'm³', type: 'number' },
    ],
  },
];

/** Returns the trigger matching this step name + field, if any. */
export function findMeasurementTrigger(
  stepName: string,
  field: 'actualStart' | 'actualEnd',
): MeasurementTrigger | undefined {
  const normalized = normalizeStepName(stepName);
  return MEASUREMENT_TRIGGERS.find((t) => t.stepName === normalized && t.field === field);
}

/** Every measurement field this step name is ever responsible for, combined
 * across its start + end triggers (e.g. Casing carries both its
 * actualStart fields and its actualEnd fields) — the "Measurements" summary
 * shown under a step's ACTUAL block, and what "Edit measurements" opens,
 * cover the whole step at once rather than being tied to one trigger. Empty
 * for a step with no configured triggers (most steps). */
export function getMeasurementFieldsForStep(stepName: string): MeasurementFieldConfig[] {
  const normalized = normalizeStepName(stepName);
  return MEASUREMENT_TRIGGERS.filter((t) => t.stepName === normalized).flatMap((t) => t.fields);
}
