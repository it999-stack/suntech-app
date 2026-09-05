// src/services/pileApplicableSteps.ts
//
// The single definition of "which steps apply to this pile": the site's step
// catalog intersected with the duration templates configured for that pile's
// dimension. A step with no template for a dimension is NOT applicable to a
// pile of that dimension — there is no duration to schedule it with, and
// (since the 60-minute default was removed, see planScheduler.ts) nothing may
// invent one.
//
// This used to be spelled out inline in three places — resumeWorkService's
// resume-point scan, AddPileModal's step picker, and (implicitly, via the plan
// rows) the Log Actuals step list. They agreed by coincidence, not by
// construction: resumeWorkService additionally fell back to the *unfiltered*
// catalog when a dimension had no templates at all, so the same pile could be
// considered to have 8 applicable steps there and 0 everywhere else. That
// fallback is deliberately absent here — see findMissingTemplateCoverage for
// how a missing template is surfaced instead of papered over.

/**
 * Anything that can answer "is a duration template configured for this
 * (dimension, step) pair". Deliberately structural rather than a concrete
 * `Set`: callers that also need the minutes keep a `Map` keyed the same way
 * (resumeWorkService, usePileGroups) and can pass it straight in.
 */
export type TemplateKeyLookup = { has(key: string): boolean };

/** The composite key both the Set and Map forms above are keyed by. */
export function templateKey(dimensionId: string, stepId: string): string {
  return `${dimensionId}|${stepId}`;
}

export function buildTemplateKeySet(
  templates: { dimensionId: string; stepId: string }[],
): Set<string> {
  return new Set(templates.map((t) => templateKey(t.dimensionId, t.stepId)));
}

/**
 * `${dimensionId}|${stepId}` -> that template's duration in minutes. Doubles
 * as a TemplateKeyLookup, so a caller needing both applicability and the
 * minutes only builds one index.
 */
export function buildTemplateMinutesMap(
  templates: { dimensionId: string; stepId: string; durationMinutes: number }[],
): Map<string, number> {
  return new Map(templates.map((t) => [templateKey(t.dimensionId, t.stepId), t.durationMinutes]));
}

/**
 * The subset of `allSteps` that applies to a pile of `dimensionId`, in the
 * order given (callers pass the catalog already sorted by sequence_order).
 *
 * An unknown dimension yields NO applicable steps rather than the whole
 * catalog: "we don't know this pile's size" and "every step applies" are
 * completely different claims, and returning the latter is what let a pile
 * silently get scheduled on invented durations.
 */
export function getApplicableSteps<T extends { id: string }>(
  allSteps: T[],
  dimensionId: string | null | undefined,
  templates: TemplateKeyLookup,
): T[] {
  if (!dimensionId) return [];
  return allSteps.filter((step) => templates.has(templateKey(dimensionId, step.id)));
}

// ─── Template coverage (plan generation) ─────────────────────────────────────

/** One dimension present among a plan's piles. */
export type PlanDimension = { dimensionId: string; dia: number; depth: number };

/** e.g. "Ø600mm × 20m" — the label used wherever a missing template is named. */
export function formatDimensionLabel(dim: { dia: number; depth: number }): string {
  return `Ø${dim.dia}mm × ${dim.depth}m`;
}

/**
 * The distinct dimensions carried by a plan's piles, smallest first — the
 * coverage every in-scope step must have for the plan to be schedulable.
 */
export function collectPlanDimensions(
  piles: { dimensionId: string; dia: number; depth: number }[],
): PlanDimension[] {
  const byId = new Map<string, PlanDimension>();
  for (const pile of piles) {
    if (!byId.has(pile.dimensionId)) {
      byId.set(pile.dimensionId, { dimensionId: pile.dimensionId, dia: pile.dia, depth: pile.depth });
    }
  }
  return [...byId.values()].sort((a, b) => a.dia - b.dia || a.depth - b.depth);
}

export type MissingTemplateCoverage = {
  stepId: string;
  stepName: string;
  /** The plan dimensions this step has no duration template for. Never empty. */
  dimensions: PlanDimension[];
  /** Codes of the plan's piles carrying those dimensions — what the operator
   * actually recognises, unlike a dimension id. */
  pileCodes: string[];
};

/**
 * Every (in-scope step, plan dimension) pair with no duration template —
 * the client-side mirror of the server's 400 on plan generation.
 *
 * Checked per DIMENSION, not "does this step have a template anywhere": a
 * step configured for Ø600 but not Ø900 is exactly the partial-coverage case
 * that used to slip through and get scheduled on a 60-minute guess.
 */
export function findMissingTemplateCoverage(args: {
  piles: { code: string; dimensionId: string; dia: number; depth: number }[];
  /** Only the steps actually in scope for this plan (draft.selectedStepIds). */
  steps: { id: string; stepName: string }[];
  templates: TemplateKeyLookup;
}): MissingTemplateCoverage[] {
  const { piles, steps, templates } = args;
  if (!piles.length || !steps.length) return [];

  const dimensions = collectPlanDimensions(piles);
  const result: MissingTemplateCoverage[] = [];

  for (const step of steps) {
    const missing = dimensions.filter((dim) => !templates.has(templateKey(dim.dimensionId, step.id)));
    if (!missing.length) continue;
    const missingIds = new Set(missing.map((dim) => dim.dimensionId));
    result.push({
      stepId: step.id,
      stepName: step.stepName,
      dimensions: missing,
      pileCodes: piles.filter((p) => missingIds.has(p.dimensionId)).map((p) => p.code),
    });
  }

  return result;
}

/** One line per affected step, e.g. `Boring has no duration for Ø600mm × 20m`. */
export function describeMissingTemplateCoverage(missing: MissingTemplateCoverage[]): string {
  return missing
    .map((m) => `${m.stepName} has no duration for ${m.dimensions.map(formatDimensionLabel).join(', ')}.`)
    .join('\n');
}
