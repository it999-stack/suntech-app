// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — pile selection + per-pile rig/crane assignment. Owns its own
// bottom bar: shows the wizard's floating next-step chevron (NextStepFab) by
// default, and swaps it for the bulk assign/unassign bar whenever piles are
// checkbox-selected (GeneratePlanScreen skips its shared footer for this
// step so this bar lands in the exact same screen position).

import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { colors, spacing } from '@theme/theme';
import type { PlanDraft } from '@/types/plan';
import IndexTable from '@components/shared/IndexTable';
import Pager from '@components/shared/Pager';
import NextStepFab from '@components/plan/generate/NextStepFab';
import { useAppConfig } from '@state/AppConfigContext';

import PileListToolbar, { type LocationFilterOption } from './pile-assign/PileListToolbar';
import BulkAssignBar from './pile-assign/BulkAssignBar';
import { buildColumns } from './pile-assign/pileTableColumns';
import { ALL_LOCATIONS_ID, type EligiblePile, type MachineKind, type PileFilter, type SimpleMachine } from './pile-assign/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PileAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles?: EligiblePile[];
  locations?: LocationFilterOption[];
  activeRigs?: SimpleMachine[];
  activeCranes?: SimpleMachine[];
  onContinue: () => void;
  continueDisabled: boolean;
}

// Crane is intentionally NOT tracked here — pre-filling it into a later bulk
// assignment silently carried a stale/unintended crane onto piles the user
// meant to leave rig-only. Only the rig (always mandatory) is worth
// remembering as a convenience default.
function mostCommonRigId(assignments: PlanDraft['assignments']): string | null {
  const counts = new Map<string, number>();
  Object.values(assignments).forEach((a) => {
    if (!a?.rig) return;
    counts.set(a.rig, (counts.get(a.rig) ?? 0) + 1);
  });
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function commonAssignedValue(
  assignments: PlanDraft['assignments'],
  pileIds: string[],
  pick: (a?: PlanDraft['assignments'][string]) => string | undefined,
): string | null {
  let common: string | null = null;
  for (let i = 0; i < pileIds.length; i++) {
    const v = pick(assignments[pileIds[i]]) || null;
    if (i === 0) common = v;
    else if (common !== v) return null;
  }
  return common;
}

export default function PileAssignStep({
  draft, onUpdate, piles = [], locations = [], activeRigs = [], activeCranes = [],
  onContinue, continueDisabled,
}: PileAssignStepProps) {
  const { config } = useAppConfig();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PileFilter>('all');
  const [activeLocationId, setActiveLocationId] = useState(() => locations[0]?.id ?? '');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRigId, setBulkRigId] = useState<string | null>(null);
  const [bulkCraneId, setBulkCraneId] = useState<string | null>(null);
  const [lastUsedRigId, setLastUsedRigId] = useState(() => mostCommonRigId(draft.assignments));

  function machineLabel(kind: MachineKind, machineId: string): string {
    return (kind === 'rig' ? activeRigs : activeCranes).find((m) => m.id === machineId)?.machineNo ?? '—';
  }
  function isPileFullyAssigned(pileId: string): boolean {
    // Crane is optional — a rig can perform any CRANE-track step, never the
    // reverse — so a pile only needs a rig to count as "assigned".
    const a = draft.assignments[pileId];
    return !!a?.rig;
  }

  function commitAssignment(rigId: string, craneId: string | null, pileIds: string[]): void {
    const newAssignments = { ...draft.assignments };
    const newSelectedPileIds = [...draft.selectedPileIds];
    pileIds.forEach((id) => {
      newAssignments[id] = { rig: rigId, crane: craneId ?? undefined };
      if (!newSelectedPileIds.includes(id)) newSelectedPileIds.push(id);
    });
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
    setLastUsedRigId(rigId);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  const pileCountByLocationId = useMemo(() => {
    const counts: Record<string, number> = {};
    piles.forEach((p) => { if (p.locationId) counts[p.locationId] = (counts[p.locationId] ?? 0) + 1; });
    return counts;
  }, [piles]);

  const visiblePiles = useMemo(() => {
    // Hyphens stripped from both sides so "P07"/"p07" still matches a code
    // like "P-07" — the user shouldn't have to type the separator.
    const q = search.trim().toLowerCase().replace(/-/g, '');
    return piles
      .filter((p) => {
        // While searching, match across every area selected for this plan
        // instead of just the active tab — the location pills are hidden
        // during search anyway (see PileListToolbar), so there's no active
        // tab to scope to from the user's point of view.
        if (!q && activeLocationId !== ALL_LOCATIONS_ID && p.locationId !== activeLocationId) return false;
        if (q && !p.code.toLowerCase().replace(/-/g, '').includes(q)) return false;
        // Completed piles count toward "assigned" (see pendingCount below) —
        // they're done, not awaiting assignment.
        if (filter === 'pending' && (p.completed || isPileFullyAssigned(p.id))) return false;
        if (filter === 'assigned' && !p.completed && !isPileFullyAssigned(p.id)) return false;
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piles, search, filter, activeLocationId, draft.assignments]);

  // Search/filter/location narrow the result set, so a page index from
  // before the change can point past the end of the new one.
  useEffect(() => {
    setPage(1);
  }, [search, filter, activeLocationId]);

  const totalPages = Math.max(1, Math.ceil(visiblePiles.length / config.pilesPageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPiles = useMemo(
    () => visiblePiles.slice((currentPage - 1) * config.pilesPageSize, currentPage * config.pilesPageSize),
    [visiblePiles, currentPage, config.pilesPageSize],
  );

  const pendingCount = piles.filter((p) => !p.completed && !isPileFullyAssigned(p.id)).length;
  // "Select all" applies to the current page only, matching Pager's per-page scope.
  const selectableVisiblePiles = useMemo(() => pagedPiles.filter((p) => !p.completed), [pagedPiles]);
  const allVisibleSelected = selectableVisiblePiles.length > 0 && selectableVisiblePiles.every((p) => selectedIds.has(p.id));
  const anySelectedAssigned = useMemo(
    () => [...selectedIds].some((id) => isPileFullyAssigned(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, draft.assignments],
  );

  function toggleRow(pileId: string): void {
    if (piles.find((p) => p.id === pileId)?.completed) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(pileId) ? next.delete(pileId) : next.add(pileId);
      return next;
    });
  }
  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectableVisiblePiles.forEach((p) => (allVisibleSelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }

  function handleFilterChange(next: PileFilter): void {
    setFilter(next);
  }

  function handlePageChange(next: number): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPage(next);
  }

  // Deliberately bypass handlePageChange's LayoutAnimation here — IndexTable
  // is already driving its own Reanimated slide for a swipe-triggered page
  // change, and LayoutAnimation's native layout-commit animation fighting
  // over the same frame is what left the table stuck mid-slide instead of
  // resetting to center.
  function swipeToNextPage(): void {
    if (currentPage < totalPages) setPage(currentPage + 1);
  }
  function swipeToPrevPage(): void {
    if (currentPage > 1) setPage(currentPage - 1);
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  function openBulkPanel(): void {
    const ids = [...selectedIds];
    const commonRig = commonAssignedValue(draft.assignments, ids, (a) => a?.rig);
    const commonCrane = commonAssignedValue(draft.assignments, ids, (a) => a?.crane);
    setBulkRigId(commonRig ?? lastUsedRigId ?? (activeRigs.length === 1 ? activeRigs[0].id : null));
    setBulkCraneId(commonCrane);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBulkOpen(true);
  }
  function toggleBulkPanel(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    bulkOpen ? setBulkOpen(false) : openBulkPanel();
  }

  function applyBulkAssign(): void {
    if (!bulkRigId || selectedIds.size === 0) return;
    commitAssignment(bulkRigId, bulkCraneId, [...selectedIds]);
  }

  function unassignSelected(): void {
    const pileIds = [...selectedIds];
    if (pileIds.length === 0) return;
    const newAssignments = { ...draft.assignments };
    pileIds.forEach((id) => { newAssignments[id] = { rig: '', crane: undefined }; });
    onUpdate({
      assignments: newAssignments,
      selectedPileIds: draft.selectedPileIds.filter((id) => !pileIds.includes(id)),
    });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  const columns = useMemo(
    () => buildColumns({ assignments: draft.assignments, machineLabel }),
    [draft.assignments, activeRigs, activeCranes],
  );

  return (
    <View style={styles.root}>
      <View style={styles.toolbarSection}>
        <PileListToolbar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={handleFilterChange}
          allCount={piles.length}
          pendingCount={pendingCount}
          assignedCount={piles.length - pendingCount}
          locations={locations}
          pileCountByLocationId={pileCountByLocationId}
          activeLocationId={activeLocationId}
          onLocationChange={setActiveLocationId}
        />
      </View>

      <View style={styles.listSection}>
        <IndexTable
          data={pagedPiles}
          columns={columns}
          selectable
          selectedIds={selectedIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleSelectAllVisible}
          allSelected={allVisibleSelected}
          isRowDisabled={(p) => !!p.completed}
          emptyText={piles.length === 0 ? 'No piles found for this site.' : 'No piles match this view.'}
          footer={<Pager page={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />}
          onSwipeNextPage={swipeToNextPage}
          onSwipePrevPage={swipeToPrevPage}
        />
      </View>

      {selectedIds.size > 0 ? (
        <View style={styles.footer}>
          <BulkAssignBar
            selectedCount={selectedIds.size}
            onClear={clearSelection}
            panelOpen={bulkOpen}
            onTogglePanel={toggleBulkPanel}
            rigs={activeRigs}
            cranes={activeCranes}
            rigId={bulkRigId}
            craneId={bulkCraneId}
            onSelectRig={setBulkRigId}
            onSelectCrane={setBulkCraneId}
            onApply={applyBulkAssign}
            onUnassign={unassignSelected}
            unassignDisabled={!anySelectedAssigned}
          />
        </View>
      ) : (
        // GeneratePlanScreen's pilesStepContainer already applies
        // paddingHorizontal: spacing.lg around this step — cancel the FAB's
        // own right offset so it lines up with every other step's copy.
        <NextStepFab onPress={onContinue} disabled={continueDisabled} style={styles.nextFabOffset} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  toolbarSection: { marginBottom: spacing.sm },
  // Runs the card to the very bottom, under NextStepFab's horizontal range —
  // deliberate now that the pager also responds to swipe (see IndexTable's
  // onSwipeNextPage/onSwipePrevPage), so tapping the last page number/chevron
  // in that exact corner is no longer the only way to reach it.
  listSection: { flex: 1, minHeight: 0 },
  footer: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  nextFabOffset: { right: 0 },
});
