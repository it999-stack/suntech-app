// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — pile selection + per-pile rig/crane assignment.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { PlanDraft } from '@/types/plan';
import IndexTable, { type IndexTableColumn, type IndexTableAction } from '@components/shared/IndexTable';
import SearchFilterBar from './pile-assign/SearchFilterBar';
import BulkAssignBar from './pile-assign/BulkAssignBar';
import PileDetailSheet from './pile-assign/PileDetailSheet';
import type { EligiblePile, MachineKind, PileFilter, SimpleMachine } from './pile-assign/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PileAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles?: EligiblePile[];
  activeRigs?: SimpleMachine[];
  activeCranes?: SimpleMachine[];
}

function mostCommonPair(assignments: PlanDraft['assignments']): { rig: string; crane: string } | null {
  const counts = new Map<string, number>();
  Object.values(assignments).forEach((a) => {
    if (!a?.rig || !a?.crane) return;
    const key = `${a.rig}|${a.crane}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) { bestCount = count; bestKey = key; }
  }
  if (!bestKey) return null;
  const [rig, crane] = bestKey.split('|');
  return { rig, crane };
}

export default function PileAssignStep({
  draft, onUpdate, piles = [], activeRigs = [], activeCranes = [],
}: PileAssignStepProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PileFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRigId, setBulkRigId] = useState<string | null>(null);
  const [bulkCraneId, setBulkCraneId] = useState<string | null>(null);
  const [bulkDefaulted, setBulkDefaulted] = useState(false);
  const [detailPile, setDetailPile] = useState<EligiblePile | null>(null);

  const [lastUsedPair, setLastUsedPair] = useState<{ rig: string; crane: string } | null>(
    () => mostCommonPair(draft.assignments),
  );

  function machineLabel(kind: MachineKind, machineId: string): string {
    const machines = kind === 'rig' ? activeRigs : activeCranes;
    return machines.find((m) => m.id === machineId)?.machineNo ?? '—';
  }

  function isPileFullyAssigned(pileId: string): boolean {
    const asgn = draft.assignments[pileId];
    return !!asgn?.rig && !!asgn?.crane;
  }

  const hasResumeWork = useMemo(() => {
    return (pileId: string) => !!draft.resumeWorkByPileId[pileId];
  }, [draft.resumeWorkByPileId]);

  const visiblePiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = piles.filter((p) => {
      if (q && !p.code.toLowerCase().includes(q)) return false;
      if (filter === 'pending') return !isPileFullyAssigned(p.id);
      if (filter === 'assigned') return isPileFullyAssigned(p.id);
      return true;
    });
    return filtered.sort((a, b) => {
      const aHasResume = hasResumeWork(a.id);
      const bHasResume = hasResumeWork(b.id);
      if (aHasResume && !bHasResume) return -1;
      if (!aHasResume && bHasResume) return 1;
      return a.code.localeCompare(b.code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piles, search, filter, draft.assignments, draft.resumeWorkByPileId]);

  const pendingCount = piles.filter((p) => !isPileFullyAssigned(p.id)).length;
  const assignedCount = piles.length - pendingCount;
  const allVisibleSelected = visiblePiles.length > 0 && visiblePiles.every((p) => selectedIds.has(p.id));

  function toggleRow(pileId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pileId)) next.delete(pileId); else next.add(pileId);
      return next;
    });
  }

  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visiblePiles.forEach((p) => next.delete(p.id));
      else visiblePiles.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  function defaultRigCrane(): { rig: string | null; crane: string | null; defaulted: boolean } {
    if (lastUsedPair) return { rig: lastUsedPair.rig, crane: lastUsedPair.crane, defaulted: true };
    if (activeRigs.length === 1 && activeCranes.length === 1) {
      return { rig: activeRigs[0].id, crane: activeCranes[0].id, defaulted: true };
    }
    return { rig: null, crane: null, defaulted: false };
  }

  function openBulkPanel(): void {
    const { rig, crane, defaulted } = defaultRigCrane();
    setBulkRigId(rig);
    setBulkCraneId(crane);
    setBulkDefaulted(defaulted);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBulkOpen(true);
  }

  function toggleBulkPanel(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (bulkOpen) setBulkOpen(false); else openBulkPanel();
  }

  function applyBulkAssign(): void {
    if (!bulkRigId || !bulkCraneId || selectedIds.size === 0) return;
    const newAssignments = { ...draft.assignments };
    const newSelectedPileIds = [...draft.selectedPileIds];
    selectedIds.forEach((id) => {
      newAssignments[id] = { rig: bulkRigId, crane: bulkCraneId };
      if (!newSelectedPileIds.includes(id)) newSelectedPileIds.push(id);
    });
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
    setLastUsedPair({ rig: bulkRigId, crane: bulkCraneId });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  function assignSingleFromMenu(pileId: string): void {
    setSelectedIds(new Set([pileId]));
    openBulkPanel();
  }

  function unassignRow(pileId: string): void {
    const newAssignments = { ...draft.assignments, [pileId]: { rig: '', crane: '' } };
    const newSelectedPileIds = draft.selectedPileIds.filter((id) => id !== pileId);
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
  }

  const columns: IndexTableColumn<EligiblePile>[] = useMemo(() => [
    {
      key: 'pile',
      header: 'Pile',
      render: (p) => (
        <>
          <Text style={styles.code}>{p.code}</Text>
          <Text style={styles.spec}>Ø{p.dia}mm · {p.depth}m</Text>
        </>
      ),
    },
    {
      key: 'machines',
      header: 'Machines',
      width: 140,
      render: (p) => {
        const asgn = draft.assignments[p.id];
        const rigLabel = asgn?.rig ? machineLabel('rig', asgn.rig) : null;
        const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;
        return rigLabel && craneLabel ? (
          <View style={styles.pillRow}>
            <View style={styles.pill}><Text style={styles.pillText}>{rigLabel}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>{craneLabel}</Text></View>
          </View>
        ) : (
          <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [draft.assignments, activeRigs, activeCranes]);

  const rowActions: IndexTableAction<EligiblePile>[] = [
    { label: 'Assign machines', onPress: (p) => assignSingleFromMenu(p.id) },
    { label: 'View details', onPress: (p) => setDetailPile(p) },
    { label: 'Unassign', danger: true, show: (p) => isPileFullyAssigned(p.id), onPress: (p) => unassignRow(p.id) },
  ];

  const detailAsgn = detailPile ? draft.assignments[detailPile.id] : undefined;
  const detailRigLabel = detailAsgn?.rig ? machineLabel('rig', detailAsgn.rig) : null;
  const detailCraneLabel = detailAsgn?.crane ? machineLabel('crane', detailAsgn.crane) : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.pageHeading}>Piles & assign</Text>
      </View>

      <View style={styles.section}>
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          allCount={piles.length}
          pendingCount={pendingCount}
          assignedCount={assignedCount}
        />
      </View>

      {selectedIds.size > 0 && (
        <View style={styles.section}>
          <BulkAssignBar
            selectedCount={selectedIds.size}
            onClear={clearSelection}
            panelOpen={bulkOpen}
            onTogglePanel={toggleBulkPanel}
            rigs={activeRigs}
            cranes={activeCranes}
            rigId={bulkRigId}
            craneId={bulkCraneId}
            onSelectRig={(id) => { setBulkRigId(id); setBulkDefaulted(false); }}
            onSelectCrane={(id) => { setBulkCraneId(id); setBulkDefaulted(false); }}
            defaulted={bulkDefaulted}
            onApply={applyBulkAssign}
          />
        </View>
      )}

      <View style={[styles.section, styles.listSection]}>
        <IndexTable
          data={visiblePiles}
          columns={columns}
          selectable
          selectedIds={selectedIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleSelectAllVisible}
          allSelected={allVisibleSelected}
          rowActions={rowActions}
          emptyText={piles.length === 0 ? 'No piles found for this site.' : 'No piles match this view.'}
        />
      </View>

      <Text style={styles.footerText}>{selectedIds.size} of {visiblePiles.length} piles selected</Text>

      <PileDetailSheet
        visible={!!detailPile}
        onClose={() => setDetailPile(null)}
        code={detailPile?.code ?? ''}
        spec={detailPile ? `Ø${detailPile.dia}mm · ${detailPile.depth}m` : ''}
        rigLabel={detailRigLabel}
        craneLabel={detailCraneLabel}
        onAssign={() => { const id = detailPile!.id; setDetailPile(null); assignSingleFromMenu(id); }}
        onUnassign={detailRigLabel ? () => { const id = detailPile!.id; setDetailPile(null); unassignRow(id); } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, paddingHorizontal: spacing.md },
  header: { marginBottom: spacing.lg },
  pageHeading: { ...typography.h2, color: colors.textPrimary },
  section: { marginBottom: spacing.lg },
  listSection: { flex: 1, minHeight: 0, marginBottom: 0 },

  code: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  pillText: { ...typography.caption, fontWeight: '600', color: colors.accent },
  pillEmpty: { borderWidth: 1, borderColor: 'rgba(28,28,46,0.15)', borderStyle: 'dashed', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },

  footerText: { ...typography.caption, paddingHorizontal: spacing.sm, marginTop: spacing.md, color: colors.textSecondary, marginBottom: spacing.md },
});