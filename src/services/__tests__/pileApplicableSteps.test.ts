// src/services/__tests__/pileApplicableSteps.test.ts

import {
  buildTemplateKeySet,
  findMissingTemplateCoverage,
  getApplicableSteps,
} from '@/services/pileApplicableSteps';

const STEPS = [
  { id: 'boring', stepName: 'Boring' },
  { id: 'cage', stepName: 'Cage Lowering' },
  { id: 'concrete', stepName: 'Concreting' },
];

const PILES = [
  { code: 'P-01', dimensionId: 'dim-600', dia: 600, depth: 20 },
  { code: 'P-02', dimensionId: 'dim-600', dia: 600, depth: 20 },
  { code: 'P-03', dimensionId: 'dim-900', dia: 900, depth: 25 },
];

describe('getApplicableSteps', () => {
  const templates = buildTemplateKeySet([
    { dimensionId: 'dim-600', stepId: 'boring' },
    { dimensionId: 'dim-600', stepId: 'cage' },
    { dimensionId: 'dim-900', stepId: 'boring' },
  ]);

  it('keeps only the steps with a template for that dimension', () => {
    expect(getApplicableSteps(STEPS, 'dim-600', templates).map((s) => s.id)).toEqual(['boring', 'cage']);
    expect(getApplicableSteps(STEPS, 'dim-900', templates).map((s) => s.id)).toEqual(['boring']);
  });

  it('never falls back to the unfiltered catalog', () => {
    // The removed fallback: a dimension with no templates at all used to yield
    // every step, which is what let a pile get scheduled on invented durations.
    expect(getApplicableSteps(STEPS, 'dim-unknown', templates)).toEqual([]);
    expect(getApplicableSteps(STEPS, undefined, templates)).toEqual([]);
  });
});

describe('findMissingTemplateCoverage', () => {
  it('catches PARTIAL coverage — a step configured for one size but not another', () => {
    const templates = buildTemplateKeySet([
      { dimensionId: 'dim-600', stepId: 'boring' },
      { dimensionId: 'dim-900', stepId: 'boring' },
      // 'cage' exists for Ø600 only; 'concrete' for neither.
      { dimensionId: 'dim-600', stepId: 'cage' },
    ]);

    const missing = findMissingTemplateCoverage({ piles: PILES, steps: STEPS, templates });

    expect(missing.map((m) => m.stepId)).toEqual(['cage', 'concrete']);

    const cage = missing.find((m) => m.stepId === 'cage')!;
    expect(cage.dimensions.map((d) => d.dimensionId)).toEqual(['dim-900']);
    expect(cage.pileCodes).toEqual(['P-03']);

    const concrete = missing.find((m) => m.stepId === 'concrete')!;
    expect(concrete.dimensions.map((d) => d.dia)).toEqual([600, 900]);
    expect(concrete.pileCodes).toEqual(['P-01', 'P-02', 'P-03']);
  });

  it('reports nothing when every in-scope step covers every plan dimension', () => {
    const templates = buildTemplateKeySet(
      ['dim-600', 'dim-900'].flatMap((dimensionId) =>
        STEPS.map((s) => ({ dimensionId, stepId: s.id })),
      ),
    );
    expect(findMissingTemplateCoverage({ piles: PILES, steps: STEPS, templates })).toEqual([]);
  });

  it('ignores steps that are out of scope for the plan', () => {
    const templates = buildTemplateKeySet([
      { dimensionId: 'dim-600', stepId: 'boring' },
      { dimensionId: 'dim-900', stepId: 'boring' },
    ]);
    const inScope = STEPS.filter((s) => s.id === 'boring');
    expect(findMissingTemplateCoverage({ piles: PILES, steps: inScope, templates })).toEqual([]);
  });
});
