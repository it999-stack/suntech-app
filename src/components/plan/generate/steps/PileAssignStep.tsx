// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — pile selection + per-pile rig/crane assignment.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { spacing } from '@theme/theme';
import type { PlanDraft } from '@/types/plan';
import IndexTable from '@components/shared/IndexTable';

import PileListToolbar, { type AreaFilterOption } from './pile-assign/PileListToolbar';
import BulkAssignBar from './pile-assign/BulkAssignBar';
import PileDetailSheet from './pile-assign/PileDetailSheet';
import ResumeTimeConfirmModal from './pile-assign/ResumeTimeConfirmModal';
import { useResumeConfirmQueue } from './pile-assign/useResumeConfirmQueue';
import { buildColumns, buildRowActions } from './pile-assign/pileTableColumns';
import type { EligiblePile, MachineKind, PileFilter, SimpleMachine } from './pile-assign/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PileAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles?: EligiblePile[];
  areas?: AreaFilterOption[];
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
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [rig, crane] = best[0].split('|');
  return { rig, crane };
}

export default function PileAssignStep({
  draft, onUpdate, piles = [], areas = [], activeRigs = [], activeCranes = [],
}: PileAssignStepProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PileFilter>('all');
  const [activeAreaId, setActiveAreaId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRigId, setBulkRigId] = useState<string | null>(null);
  const [bulkCraneId, setBulkCraneId] = useState<string | null>(null);
  const [bulkDefaulted, setBulkDefaulted] = useState(false);
  const [detailPile, setDetailPile] = useState<EligiblePile | null>(null);
  const [lastUsedPair, setLastUsedPair] = useState(() => mostCommonPair(draft.assignments));

  function machineLabel(kind: MachineKind, machineId: string): string {
    return (kind === 'rig' ? activeRigs : activeCranes).find((m) => m.id === machineId)?.machineNo ?? '—';
  }
  function isPileFullyAssigned(pileId: string): boolean {
    const a = draft.assignments[pileId];
    return !!a?.rig && !!a?.crane;
  }

  function commitAssignment(rigId: string, craneId: string, pileIds: string[]): void {
    const newAssignments = { ...draft.assignments };
    const newSelectedPileIds = [...draft.selectedPileIds];
    pileIds.forEach((id) => {
      newAssignments[id] = { rig: rigId, crane: craneId };
      if (!newSelectedPileIds.includes(id)) newSelectedPileIds.push(id);
    });
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
    setLastUsedPair({ rig: rigId, crane: craneId });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  const resumeConfirm = useResumeConfirmQueue(draft, onUpdate, commitAssignment);

  // Piles auto-preselected with a still-active rig/crane (carry-over work,
  // see GeneratePlanScreen's preselection effect) arrive here already fully
  // assigned, so the manual "Assign" flow below never runs for them. Catch
  // those and open the confirm queue automatically, once per visit to this step.
  const autoPromptedRef = useRef(false);
  useEffect(() => {
    if (autoPromptedRef.current || !piles.length) return;
    const toConfirm = piles
      .map((p) => p.id)
      .filter((id) => isPileFullyAssigned(id) && resumeConfirm.needsResumeConfirm(id));
    if (toConfirm.length === 0) return; // preselection may not have landed in `draft` yet — keep watching
    autoPromptedRef.current = true;
    resumeConfirm.startAutoConfirm(toConfirm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piles, draft.assignments, draft.resumeWorkByPileId]);

  const pileCountByAreaId = useMemo(() => {
    const counts: Record<string, number> = {};
    piles.forEach((p) => { if (p.areaId) counts[p.areaId] = (counts[p.areaId] ?? 0) + 1; });
    return counts;
  }, [piles]);

  const areaNameById = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);

  const visiblePiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return piles
      .filter((p) => {
        if (activeAreaId !== 'all' && p.areaId !== activeAreaId) return false;
        if (q && !p.code.toLowerCase().includes(q)) return false;
        if (filter === 'pending') return !isPileFullyAssigned(p.id);
        if (filter === 'assigned') return isPileFullyAssigned(p.id);
        return true;
      })
      .sort((a, b) => {
        const ar = !!draft.resumeWorkByPileId[a.id], br = !!draft.resumeWorkByPileId[b.id];
        if (ar !== br) return ar ? -1 : 1;
        return a.code.localeCompare(b.code);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piles, search, filter, activeAreaId, draft.assignments, draft.resumeWorkByPileId]);

  const pendingCount = piles.filter((p) => !isPileFullyAssigned(p.id)).length;
  const allVisibleSelected = visiblePiles.length > 0 && visiblePiles.every((p) => selectedIds.has(p.id));

  function toggleRow(pileId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(pileId) ? next.delete(pileId) : next.add(pileId);
      return next;
    });
  }
  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visiblePiles.forEach((p) => (allVisibleSelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }
  function clearSelection(): void {
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  function openBulkPanel(): void {
    const defaulted = !!lastUsedPair || (activeRigs.length === 1 && activeCranes.length === 1);
    const pair = lastUsedPair ?? (activeRigs.length === 1 && activeCranes.length === 1
      ? { rig: activeRigs[0].id, crane: activeCranes[0].id } : null);
    setBulkRigId(pair?.rig ?? null);
    setBulkCraneId(pair?.crane ?? null);
    setBulkDefaulted(defaulted);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBulkOpen(true);
  }
  function toggleBulkPanel(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    bulkOpen ? setBulkOpen(false) : openBulkPanel();
  }

  function applyBulkAssign(): void {
    if (!bulkRigId || !bulkCraneId || selectedIds.size === 0) return;
    const pileIds = [...selectedIds];
    if (resumeConfirm.start(bulkRigId, bulkCraneId, pileIds)) return;
    commitAssignment(bulkRigId, bulkCraneId, pileIds);
  }

  function assignSingleFromMenu(pileId: string): void {
    setSelectedIds(new Set([pileId]));
    openBulkPanel();
  }
  function unassignRow(pileId: string): void {
    onUpdate({
      assignments: { ...draft.assignments, [pileId]: { rig: '', crane: '' } },
      selectedPileIds: draft.selectedPileIds.filter((id) => id !== pileId),
    });
  }

  const columns = useMemo(
    () => buildColumns({ assignments: draft.assignments, machineLabel, activeAreaId, areaNameById }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.assignments, activeRigs, activeCranes, activeAreaId, areaNameById],
  );
  const rowActions = buildRowActions({
    isPileFullyAssigned,
    onAssign: assignSingleFromMenu,
    onViewDetails: setDetailPile,
    onUnassign: unassignRow,
  });

  const detailAsgn = detailPile ? draft.assignments[detailPile.id] : undefined;
  const detailRigLabel = detailAsgn?.rig ? machineLabel('rig', detailAsgn.rig) : null;
  const detailCraneLabel = detailAsgn?.crane ? machineLabel('crane', detailAsgn.crane) : null;

  const confirmPile = piles.find((p) => p.id === resumeConfirm.confirmQueue[0]);
  const confirmResumeWork = confirmPile ? draft.resumeWorkByPileId[confirmPile.id] : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.toolbarSection}>
        <PileListToolbar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          allCount={piles.length}
          pendingCount={pendingCount}
          assignedCount={piles.length - pendingCount}
          areas={areas}
          pileCountByAreaId={pileCountByAreaId}
          activeAreaId={activeAreaId}
          onAreaChange={setActiveAreaId}
        />
      </View>

      {selectedIds.size > 0 && (
        <View style={styles.toolbarSection}>
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

      <View style={styles.listSection}>
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

      {confirmPile && confirmResumeWork && (
        <ResumeTimeConfirmModal
          visible={resumeConfirm.confirmQueue.length > 0}
          pileCode={confirmPile.code}
          resumeWork={confirmResumeWork}
          onConfirm={resumeConfirm.confirm}
          onClose={resumeConfirm.cancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  toolbarSection: { marginBottom: spacing.sm },
  listSection: { flex: 1, minHeight: 0 },
});