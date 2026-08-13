// src/services/planner/planComponents.ts
// Machine-sharing components — the unit of caching for PlanScheduleCache.
// See pilingPlannerService.ts for the algorithm overview.
//
// Piles that never share a rig/crane/compressor with each other are provably independent
// under this scheduler: Pass 2 only ever compares readyAt values sourced from a pile's own
// assigned machines, so their relative processing order — and hence their computed times —
// can never affect one another. Grouping piles this way lets a repeated recompute (e.g. one
// track-override toggle) skip rescheduling every component except the one(s) actually touched.

import type { PreviewPileInput } from './planTypes';

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Deterministic for a given `piles` array (same order, same machine assignments) — the same
 * group of piles always resolves to the same component id, which is all a same-call cache
 * lookup needs (component ids are never persisted or compared across different fingerprints). */
export function partitionIntoComponents(piles: PreviewPileInput[]): Map<string, string> {
  const uf = new UnionFind();
  for (const pile of piles) {
    const pileNode = `p:${pile.checklistPileId}`;
    for (const machineId of [pile.rigId, pile.craneId, pile.compressorId]) {
      if (!machineId) continue;
      uf.union(pileNode, `m:${machineId}`);
    }
  }
  const componentIdByPileId = new Map<string, string>();
  for (const pile of piles) {
    componentIdByPileId.set(pile.checklistPileId, uf.find(`p:${pile.checklistPileId}`));
  }
  return componentIdByPileId;
}

/** Everything that affects scheduling EXCEPT stepTrackOverrides — see PlanScheduleCache. */
export function computeFingerprint(
  piles: PreviewPileInput[],
  planStartTime: string,
  siteId: string,
  shiftTypeId: string | undefined,
  selectedStepIds: string[] | undefined,
): string {
  return JSON.stringify({
    planStartTime,
    siteId,
    shiftTypeId: shiftTypeId ?? null,
    selectedStepIds: selectedStepIds ?? null,
    piles: piles.map((p) => ({
      checklistPileId: p.checklistPileId,
      pileId: p.pileId,
      dimensionId: p.dimensionId,
      rigId: p.rigId,
      craneId: p.craneId,
      compressorId: p.compressorId ?? null,
      resumeWork: p.resumeWork ?? null,
    })),
  });
}

/** Just one component's piles' stepTrackOverrides — order-independent (sorted) since taps can
 * append/remove ids in any order without changing what's actually being scheduled. */
export function computeOverridesFingerprint(piles: PreviewPileInput[]): string {
  return JSON.stringify(
    piles.map((p) => [p.checklistPileId, [...(p.stepTrackOverrides ?? [])].sort()]),
  );
}
