// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — pile selection + per-pile rig/crane assignment. Doesn't render its
// own next-step chevron — GeneratePlanScreen's shared NextStepFab covers this
// step too now (single render call site for every step, so the button's
// screen position can never drift between steps). Instead this component
// swaps in the bulk assign/unassign bar whenever piles are checkbox-selected,
// and reports that via `onSelectionChange` so the parent knows to hide its
// shared FAB for the moment.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Server, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { PlanDraft } from '@/types/plan';
import IndexTable from '@components/shared/IndexTable';
import Pager from '@components/shared/Pager';
import AppModal from '@components/shared/AppModal';
import MachineBadge from '@components/shared/MachineBadge';
import { useAppConfig } from '@state/AppConfigContext';

import PileListToolbar, { type LocationFilterOption } from './pile-assign/PileListToolbar';
import BulkAssignBar from './pile-assign/BulkAssignBar';
import { buildColumns } from './pile-assign/pileTableColumns';
import { PileGroupCard, PileGroupRow } from './pile-assign/PileGroupCard';
import { ALL_LOCATIONS_ID, type EligiblePile, type MachineKind, type PileFilter, type SimpleMachine } from './pile-assign/types';

const ACCENT_SOLID = '#5B5FEF';

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
  /** Called whenever checkbox-selection state flips empty/non-empty, so the parent
   * knows whether to show its own shared NextStepFab or leave room for BulkAssignBar. */
  onSelectionChange?: (hasSelection: boolean) => void;
}

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
  onSelectionChange,
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
  const [viewAssignedOpen, setViewAssignedOpen] = useState(false);

  useEffect(() => {
    onSelectionChange?.(selectedIds.size > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  function machineLabel(kind: MachineKind, machineId: string): string {
    return (kind === 'rig' ? activeRigs : activeCranes).find((m) => m.id === machineId)?.machineNo ?? '—';
  }
  function locationLabel(locationId: string | null): string | null {
    return locations.find((l) => l.id === locationId)?.name ?? null;
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
        if (filter === 'pending' && (p.completed || isPileFullyAssigned(p.id))) return false;
        if (filter === 'assigned' && (p.completed || !isPileFullyAssigned(p.id))) return false;
        if (filter === 'completed' && !p.completed) return false;
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
  const assignedCount = piles.filter((p) => !p.completed && isPileFullyAssigned(p.id)).length;
  const completedCount = piles.filter((p) => p.completed).length;

  const allAssignedPiles = useMemo(() => {
    // draft.selectedPileIds is the plan's actual pile sequence — the same
    // array the Preview step's machine timeline schedules from (see
    // planScheduler's "first in original order wins" tie-break) and that
    // ReorderPilesOverlay edits directly. Sorting by each pile's position in
    // it (instead of by code) means what's numbered here matches what will
    // actually run first on that rig.
    const sequenceIndex = new Map(draft.selectedPileIds.map((id, idx) => [id, idx]));
    return piles
      .filter((p) => isPileFullyAssigned(p.id))
      .map((p) => {
        const a = draft.assignments[p.id];
        return {
          id: p.id,
          code: p.code,
          dia: p.dia,
          depth: p.depth,
          rigId: a?.rig ?? '',
          rigLabel: a?.rig ? machineLabel('rig', a.rig) : null,
          craneLabel: a?.crane ? machineLabel('crane', a.crane) : null,
        };
      })
      .sort((a, b) => (sequenceIndex.get(a.id) ?? 0) - (sequenceIndex.get(b.id) ?? 0));
  }, [piles, draft.assignments, draft.selectedPileIds, activeRigs, activeCranes]);

  // "Assigned Piles" modal groups by rig — every pile under R-1, then every
  // pile under R-2, etc. — instead of one flat sequence-ordered list, in the
  // same order the Machines step lists rigs. A rig that's since dropped out of
  // activeRigs (shouldn't happen — removing a machine clears its
  // assignments) still gets a fallback group so its piles are never silently
  // hidden here.
  const assignedPilesByRig = useMemo(() => {
    const byRigId = new Map<string, typeof allAssignedPiles>();
    allAssignedPiles.forEach((p) => {
      const list = byRigId.get(p.rigId) ?? [];
      list.push(p);
      byRigId.set(p.rigId, list);
    });

    const ordered = activeRigs
      .filter((r) => byRigId.has(r.id))
      .map((r) => ({ rigId: r.id, rigLabel: r.machineNo, piles: byRigId.get(r.id)! }));

    const orderedIds = new Set(activeRigs.map((r) => r.id));
    const stray = [...byRigId.entries()]
      .filter(([rigId]) => !orderedIds.has(rigId))
      .map(([rigId, list]) => ({ rigId, rigLabel: machineLabel('rig', rigId), piles: list }));

    return [...ordered, ...stray];
  }, [allAssignedPiles, activeRigs]);

  const selectedCodesLabel = useMemo(() => {
    const codes = piles.filter((p) => selectedIds.has(p.id)).map((p) => p.code).sort();
    const limit = 4;
    return codes.length <= limit
      ? codes.join(', ')
      : `${codes.slice(0, limit).join(', ')} +${codes.length - limit} more`;
  }, [piles, selectedIds]);
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
    () => buildColumns({
      assignments: draft.assignments,
      machineLabel,
      locationLabel,
      showAreaBadge: activeLocationId === ALL_LOCATIONS_ID,
    }),
    [draft.assignments, activeRigs, activeCranes, locations, activeLocationId],
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
          assignedCount={assignedCount}
          completedCount={completedCount}
          locations={locations}
          pileCountByLocationId={pileCountByLocationId}
          activeLocationId={activeLocationId}
          onLocationChange={setActiveLocationId}
        />
      </View>

      <Pressable style={styles.infoCard} onPress={() => setViewAssignedOpen(true)}>
        <View style={styles.infoCardIconWrap}>
          <Server size={20} color={ACCENT_SOLID} />
        </View>
        <View style={styles.infoCardTextWrap}>
          <Text style={styles.infoCardTitle}>Assign piles to machines</Text>
          <Text style={styles.infoCardSubtitle}>Select one or more piles</Text>
        </View>
        <View style={styles.infoCardDivider} />
        <View style={styles.infoCardAssignedWrap}>
          <Text style={styles.infoCardSummaryText}>{allAssignedPiles.length} piles assigned</Text>
        </View>
        <ChevronRight size={20} color={ACCENT_SOLID} />
      </Pressable>

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
          onSwipeNextPage={currentPage < totalPages ? swipeToNextPage : undefined}
          onSwipePrevPage={currentPage > 1 ? swipeToPrevPage : undefined}
        />
      </View>

      {selectedIds.size > 0 ? (
        <View style={styles.footer}>
          <BulkAssignBar
            selectedCount={selectedIds.size}
            selectedCodesLabel={selectedCodesLabel}
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
      ) : null}

      <AppModal
        visible={viewAssignedOpen}
        onClose={() => setViewAssignedOpen(false)}
        position="bottom"
        scrollable={false}
        showCloseButton={false}
      >
        <View style={styles.assignedHeaderRow}>
          <View style={styles.assignedHeaderTextWrap}>
            <Text style={styles.assignedTitle}>Assigned Piles ({allAssignedPiles.length})</Text>
            <Text style={styles.assignedSubtitle}>Piles grouped by machine</Text>
          </View>
          <View style={styles.assignedSummaryBadge}>
            <Server size={14} color={ACCENT_SOLID} />
            <Text style={styles.assignedSummaryText}>{allAssignedPiles.length} piles assigned</Text>
          </View>
        </View>

        <ScrollView style={styles.assignedList} showsVerticalScrollIndicator={false}>
          {assignedPilesByRig.map((group) => (
            <PileGroupCard
              key={group.rigId}
              rigLabel={group.rigLabel}
              countLabel={`${group.piles.length} ${group.piles.length === 1 ? 'pile' : 'piles'}`}
            >
              {group.piles.map((p, idx) => (
                <PileGroupRow
                  key={p.id}
                  index={idx + 1}
                  title={p.code}
                  subtitle={`Ø${p.dia}mm · ${p.depth}m`}
                  isLast={idx === group.piles.length - 1}
                  right={p.craneLabel && <MachineBadge track="CRANE" label={p.craneLabel} />}
                />
              ))}
            </PileGroupCard>
          ))}
        </ScrollView>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  toolbarSection: { marginBottom: spacing.sm },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  infoCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardTextWrap: { flex: 1 },
  infoCardTitle: { ...typography.cardTitle, color: colors.textPrimary },
  infoCardSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  infoCardDivider: { width: 1, height: 32, backgroundColor: 'rgba(91,95,239,0.25)' },
  infoCardAssignedWrap: { alignItems: 'flex-end' },
  infoCardSummaryText: { ...typography.smallTxt, fontWeight: '700', color: ACCENT_SOLID, textAlign: 'right' },
  listSection: { flex: 1, minHeight: 0 },
  footer: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  assignedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  assignedHeaderTextWrap: { flex: 1 },
  assignedTitle: { ...typography.h2, color: colors.textPrimary },
  assignedSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  assignedSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  assignedSummaryText: { ...typography.caption, fontWeight: '700', color: ACCENT_SOLID },
  assignedList: { maxHeight: 480 },
});
