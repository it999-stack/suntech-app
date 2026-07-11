// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — pile selection + per-pile rig/crane assignment.
//
// Flow: pick a rig and a crane from two select boxes to form a pair.
// Tapping a pile that ISN'T already assigned to that pair toggles it into
// a local selection (checkbox) — it does NOT assign immediately. Once
// you've picked the piles you want, the selection bar's "Done" button
// commits them all to the pair in one go (with an Undo toast). Tapping a
// pile that's already assigned to the current pair still unassigns it
// straight away, since that's a quick correction rather than a batch pick.
// "Select all N pending" fills the selection with every visible pending
// pile without committing, so you can review before confirming.
//
// The list-check icon top right swaps the whole body for a read-only
// "assignments by combination" accordion — nothing else is shown while
// it's open. The search icon opens a bottom-sheet (AppModal) for
// searching by code and assigning a result immediately, since that's a
// single deliberate action outside the batch-select flow.
//
// Each pile needs both a rig AND a crane to count as fully assigned.
//
// All assignment state lives in draft.assignments and draft.selectedPileIds
// and is persisted up via onUpdate — no local shadow state for that part.
// (selectedRigId/selectedCraneId/filter/selection/etc. are local UI state.)
//
// IMPORTANT: this component renders a FlatList internally. Do NOT wrap it
// in an outer ScrollView in the parent wizard screen — nesting a
// VirtualizedList inside a ScrollView with the same scroll orientation
// throws "VirtualizedLists should never be nested" and breaks
// virtualization. If the parent step container currently is a ScrollView,
// either render this step outside it, or swap the parent to a plain View
// (this component owns its own scrolling).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { X, Check, Search, ChevronDown, ListChecks } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import Accordion from '@components/shared/Accordion';
import { PileRow, PileTag } from '@components/shared/PileRow';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EligiblePile { id: string; code: string; dia: number; depth: number; }
interface SimpleMachine { id: string; machineNo: string; }
type MachineKind = 'rig' | 'crane';
type PileFilter = 'all' | 'pending' | 'assigned';

interface Toast { ids: string[]; rigLabel: string; craneLabel: string; }

// ─── Props ────────────────────────────────────────────────────────────────────

interface PileAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles?: EligiblePile[];
  activeRigs?: SimpleMachine[];
  activeCranes?: SimpleMachine[];
}

const LIST_HEIGHT = 380;
const TOAST_MS = 3000;

// ─── Main ────────────────────────────────────────────────────────────────────

export default function PileAssignStep({
  draft,
  onUpdate,
  piles = [],
  activeRigs = [],
  activeCranes = [],
}: PileAssignStepProps) {
  const [selectedRigId, setSelectedRigId] = useState<string | null>(null);
  const [selectedCraneId, setSelectedCraneId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<MachineKind | null>(null);
  const [filter, setFilter] = useState<PileFilter>('pending');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewOpen, setViewOpen] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedRigId, selectedCraneId]);

  const pairReady = !!selectedRigId && !!selectedCraneId;

  // ── Derived helpers ──────────────────────────────────────────────────────

  function machineLabel(kind: MachineKind, machineId: string): string {
    const machines = kind === 'rig' ? activeRigs : activeCranes;
    return machines.find((m) => m.id === machineId)?.machineNo ?? '—';
  }

  function isPileFullyAssigned(pileId: string): boolean {
    const asgn = draft.assignments[pileId];
    return !!asgn?.rig && !!asgn?.crane;
  }

  function isPileAssignedToPair(pileId: string): boolean {
    if (!pairReady) return false;
    const asgn = draft.assignments[pileId];
    return asgn?.rig === selectedRigId && asgn?.crane === selectedCraneId;
  }

  const pilesById = useMemo(() => {
    const map: Record<string, EligiblePile> = {};
    piles.forEach((p) => { map[p.id] = p; });
    return map;
  }, [piles]);

  const assignmentGroups = useMemo(() => {
    const map = new Map<string, { label: string; piles: EligiblePile[] }>();
    draft.selectedPileIds.forEach((id) => {
      const asgn = draft.assignments[id];
      if (!asgn?.rig || !asgn?.crane) return;
      const pile = pilesById[id];
      if (!pile) return;
      const key = `${asgn.rig}|${asgn.crane}`;
      if (!map.has(key)) {
        map.set(key, { label: `${machineLabel('rig', asgn.rig)} + ${machineLabel('crane', asgn.crane)}`, piles: [] });
      }
      map.get(key)!.piles.push(pile);
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.selectedPileIds, draft.assignments, pilesById, activeRigs, activeCranes]);

  // ── Assignment mutations ─────────────────────────────────────────────────

  function assignIdsToPair(ids: string[]): void {
    if (!selectedRigId || !selectedCraneId || ids.length === 0) return;
    const newAssignments = { ...draft.assignments };
    const newSelectedPileIds = [...draft.selectedPileIds];
    ids.forEach((id) => {
      newAssignments[id] = { rig: selectedRigId, crane: selectedCraneId };
      if (!newSelectedPileIds.includes(id)) newSelectedPileIds.push(id);
    });
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
  }

  function unassignPair(pileId: string): void {
    const newAssignments = { ...draft.assignments, [pileId]: { rig: '', crane: '' } };
    const newSelectedPileIds = draft.selectedPileIds.filter((id) => id !== pileId);
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
  }

  function showToast(ids: string[]): void {
    if (!selectedRigId || !selectedCraneId || ids.length === 0) return;
    setToast({ ids, rigLabel: machineLabel('rig', selectedRigId), craneLabel: machineLabel('crane', selectedCraneId) });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  function handleUndoToast(): void {
    if (!toast) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newAssignments = { ...draft.assignments };
    toast.ids.forEach((id) => { newAssignments[id] = { rig: '', crane: '' }; });
    const newSelectedPileIds = draft.selectedPileIds.filter((id) => !toast.ids.includes(id));
    onUpdate({ assignments: newAssignments, selectedPileIds: newSelectedPileIds });
    setToast(null);
  }

  function togglePileSelect(pileId: string): void {
    if (!pairReady) return;
    if (isPileAssignedToPair(pileId)) {
      unassignPair(pileId);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pileId)) next.delete(pileId);
      else next.add(pileId);
      return next;
    });
  }

  function selectAllPendingVisible(): void {
    const targets = visiblePiles.filter((p) => !isPileFullyAssigned(p.id));
    if (targets.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      targets.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
  }

  function commitSelection(): void {
    if (!pairReady || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    assignIdsToPair(ids);
    setSelectedIds(new Set());
    showToast(ids);
  }

  function quickAssignFromSearch(pileId: string): void {
    if (!pairReady) return;
    assignIdsToPair([pileId]);
    showToast([pileId]);
  }

  function selectMachine(kind: MachineKind, id: string): void {
    if (kind === 'rig') setSelectedRigId((prev) => (prev === id ? null : id));
    else setSelectedCraneId((prev) => (prev === id ? null : id));
    setOpenDropdown(null);
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchQuery('');
  }

  // ── Filtering (main list) ────────────────────────────────────────────────

  const visiblePiles = useMemo(() => {
    if (filter === 'pending') return piles.filter((p) => !isPileFullyAssigned(p.id));
    if (filter === 'assigned') return piles.filter((p) => isPileFullyAssigned(p.id));
    return piles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piles, filter, draft.assignments]);

  const pendingCount = piles.filter((p) => !isPileFullyAssigned(p.id)).length;
  const assignedCount = piles.length - pendingCount;
  const pendingVisibleCount = visiblePiles.filter((p) => !isPileFullyAssigned(p.id)).length;

  // ── Search overlay results ──────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return piles;
    return piles.filter((p) => p.code.toLowerCase().includes(q));
  }, [piles, searchQuery]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.pageHeading}>Piles &amp; assign</Text>
        <View style={styles.topBarActions}>
          <Pressable
            onPress={() => setViewOpen((v) => !v)}
            style={[styles.iconButton, viewOpen && styles.iconButtonActive]}
            hitSlop={8}
          >
            <ListChecks size={18} color={viewOpen ? colors.white : colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setSearchOpen(true)} style={styles.iconButton} hitSlop={8}>
            <Search size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {viewOpen ? (
        <View style={styles.overviewWrap}>
          <Text style={styles.overviewLabel}>Assignments by combination</Text>
          {assignmentGroups.length === 0 ? (
            <Text style={styles.emptyText}>No assignments yet.</Text>
          ) : (
            assignmentGroups.map((g) => {
              const isOpen = expandedGroupKey === g.key;
              return (
                <Accordion
                  key={g.key}
                  header={
                    <View style={styles.groupAccordionHeader}>
                      <Text style={styles.groupTitle}>{g.label}</Text>
                      <Text style={styles.groupCount}>
                        {g.piles.length} pile{g.piles.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  }
                  defaultOpen={isOpen}
                >
                  <View style={styles.groupChipRow}>
                    {g.piles.map((p) => (
                      <View key={p.id} style={styles.groupChip}>
                        <Text style={styles.groupChipText}>{p.code}</Text>
                      </View>
                    ))}
                  </View>
                </Accordion>
              );
            })
          )}
        </View>
      ) : (
        <>
          <View style={styles.selectRow}>
            <MachineSelect
              placeholder="Select rig"
              options={activeRigs}
              valueId={selectedRigId}
              open={openDropdown === 'rig'}
              onToggle={() => setOpenDropdown((prev) => (prev === 'rig' ? null : 'rig'))}
              onSelect={(id) => selectMachine('rig', id)}
            />
            <MachineSelect
              placeholder="Select crane"
              options={activeCranes}
              valueId={selectedCraneId}
              open={openDropdown === 'crane'}
              onToggle={() => setOpenDropdown((prev) => (prev === 'crane' ? null : 'crane'))}
              onSelect={(id) => selectMachine('crane', id)}
            />
          </View>

          {piles.length > 0 && (
            <Text style={styles.progressText}>{assignedCount} / {piles.length} piles fully assigned</Text>
          )}

          <GlassCard style={styles.pileListCard}>
            <FlatList
              data={visiblePiles}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: LIST_HEIGHT }}
              nestedScrollEnabled
              stickyHeaderIndices={[0]}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  <View style={styles.filterRow}>
                    <FilterTab label="All" count={piles.length} active={filter === 'all'} onPress={() => setFilter('all')} />
                    <FilterTab label="Pending" count={pendingCount} active={filter === 'pending'} onPress={() => setFilter('pending')} tone="pending" />
                    <FilterTab label="Assigned" count={assignedCount} active={filter === 'assigned'} onPress={() => setFilter('assigned')} tone="assigned" />
                  </View>
                  {pairReady && (
                    selectedIds.size > 0 ? (
                      <View style={styles.selectionBar}>
                        <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
                        <View style={styles.selectionActions}>
                          <Pressable onPress={clearSelection} hitSlop={8}>
                            <Text style={styles.selectionClear}>Clear</Text>
                          </Pressable>
                          <Pressable style={styles.selectionDoneButton} onPress={commitSelection}>
                            <Check size={14} color={colors.white} />
                            <Text style={styles.selectionDoneText}>Done</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      pendingVisibleCount > 0 && (
                        <Pressable style={styles.selectAllButton} onPress={selectAllPendingVisible}>
                          <Text style={styles.selectAllText}>Select all {pendingVisibleCount} pending</Text>
                        </Pressable>
                      )
                    )
                  )}
                </View>
              }
              renderItem={({ item: pile }) => {
                const asgn = draft.assignments[pile.id];
                return (
                  <PileRow
                    pile={pile}
                    rigLabel={asgn?.rig ? machineLabel('rig', asgn.rig) : null}
                    craneLabel={asgn?.crane ? machineLabel('crane', asgn.crane) : null}
                    complete={isPileFullyAssigned(pile.id)}
                    highlighted={isPileAssignedToPair(pile.id)}
                    selected={selectedIds.has(pile.id)}
                    showCheckbox={pairReady && !isPileAssignedToPair(pile.id)}
                    onPress={() => togglePileSelect(pile.id)}
                  />
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {piles.length === 0 ? 'No piles found for this site.' : `No ${filter === 'all' ? '' : filter + ' '}piles.`}
                </Text>
              }
              contentContainerStyle={{ paddingBottom: spacing.sm }}
            />
          </GlassCard>

          {toast && (
            <View style={styles.toastBar}>
              <Text style={styles.toastText} numberOfLines={1}>
                {toast.ids.length} pile{toast.ids.length !== 1 ? 's' : ''} assigned to {toast.rigLabel} + {toast.craneLabel}
              </Text>
              <Pressable onPress={handleUndoToast} hitSlop={8}>
                <Text style={styles.toastUndo}>Undo</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <AppModal
        visible={searchOpen}
        onClose={closeSearch}
        title="Search piles"
        subtitle={pairReady
          ? `Tap a result to assign it to ${machineLabel('rig', selectedRigId!)} + ${machineLabel('crane', selectedCraneId!)}`
          : 'Select a rig and crane first to assign from search.'}
      >
        <View style={styles.modalSearchBar}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search piles by code…"
            placeholderTextColor={colors.textSecondary}
            style={styles.modalSearchInput}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {searchResults.length === 0 ? (
          <Text style={styles.emptyText}>No piles match "{searchQuery}".</Text>
        ) : (
          searchResults.map((pile) => {
            const asgn = draft.assignments[pile.id];
            const inPair = isPileAssignedToPair(pile.id);
            return (
              <PileRow
                key={pile.id}
                pile={pile}
                rigLabel={asgn?.rig ? machineLabel('rig', asgn.rig) : null}
                craneLabel={asgn?.crane ? machineLabel('crane', asgn.crane) : null}
                complete={isPileFullyAssigned(pile.id)}
                highlighted={inPair}
                selected={false}
                showCheckbox={false}
                disabled={!pairReady}
              />
            );
          })
        )}
      </AppModal>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MachineSelect({
  placeholder, options, valueId, open, onToggle, onSelect,
}: {
  placeholder: string;
  options: SimpleMachine[];
  valueId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const selected = options.find((o) => o.id === valueId);
  return (
    <View style={styles.selectWrap}>
      <Pressable style={[styles.selectTrigger, open && styles.selectTriggerOpen]} onPress={onToggle}>
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]} numberOfLines={1}>
          {selected ? selected.machineNo : placeholder}
        </Text>
        <ChevronDown
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open && (
        <View style={styles.selectDropdown}>
          {options.length === 0 ? (
            <Text style={styles.selectEmptyText}>None active.</Text>
          ) : (
            options.map((o) => {
              const active = o.id === valueId;
              return (
                <Pressable
                  key={o.id}
                  style={[styles.selectOption, active && styles.selectOptionActive]}
                  onPress={() => onSelect(o.id)}
                >
                  <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>{o.machineNo}</Text>
                  {active && <Check size={14} color={colors.accent} />}
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

function FilterTab({
  label, count, active, onPress, tone,
}: {
  label: string; count: number; active: boolean; onPress: () => void; tone?: 'pending' | 'assigned';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterTab,
        active && styles.filterTabActive,
        active && tone === 'pending' && styles.filterTabActivePending,
        active && tone === 'assigned' && styles.filterTabActiveAssigned,
      ]}
    >
      <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>{label}</Text>
      <Text style={[styles.filterTabCount, active && styles.filterTabTextActive]}>{count}</Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { position: 'relative' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm, paddingHorizontal: spacing.md,
  },
  pageHeading: { ...typography.h2, color: colors.textPrimary },
  topBarActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(28,28,46,0.05)',
  },
  iconButtonActive: { backgroundColor: colors.accent },

  progressText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, paddingHorizontal: spacing.md },

  selectRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.md, zIndex: 20 },
  selectWrap: { flex: 1, position: 'relative' },
  selectTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm,
    borderWidth: 1, borderColor: 'rgba(28,28,46,0.12)', backgroundColor: colors.white,
  },
  selectTriggerOpen: { borderColor: colors.accent },
  selectText: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  selectPlaceholder: { color: colors.textSecondary, fontWeight: '400' },
  selectDropdown: {
    position: 'absolute', top: 44, left: 0, right: 0, zIndex: 30,
    backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(28,28,46,0.1)',
    paddingVertical: spacing.xs,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  selectOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  selectOptionActive: { backgroundColor: colors.accentSoft },
  selectOptionText: { ...typography.body, fontSize: 14, color: colors.textPrimary },
  selectOptionTextActive: { fontWeight: '700', color: colors.accent },
  selectEmptyText: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  overviewWrap: { paddingTop: spacing.xs },
  overviewLabel: {
    ...typography.caption, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm,
  },
  groupAccordionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1,
  },
  groupTitle: { ...typography.body, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  groupCount: { ...typography.caption, color: colors.textSecondary },
  groupChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  groupChip: {
    backgroundColor: colors.accentSoft, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  groupChipText: { ...typography.caption, fontWeight: '600', color: colors.accent },

  pileListCard: { padding: spacing.sm, backgroundColor: colors.white },
  listHeader: { backgroundColor: colors.white, paddingBottom: spacing.xs },
  filterRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5,
    backgroundColor: 'rgba(28,28,46,0.05)',
  },
  filterTabActive: { backgroundColor: colors.accent },
  filterTabActivePending: { backgroundColor: '#f59e0b' },
  filterTabActiveAssigned: { backgroundColor: '#22c55e' },
  filterTabText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  filterTabCount: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  filterTabTextActive: { color: '#fff' },

  selectAllButton: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(28,28,46,0.12)',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  selectAllText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },

  selectionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.accentSoft, borderRadius: radius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  selectionText: { ...typography.caption, fontWeight: '700', color: colors.accent },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectionClear: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  selectionDoneButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: 6, paddingHorizontal: spacing.md,
  },
  selectionDoneText: { ...typography.caption, fontWeight: '700', color: '#fff' },

  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginVertical: spacing.lg },

  toastBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, backgroundColor: 'rgba(28,28,46,0.05)',
    borderWidth: 1, borderColor: colors.border,
  },
  toastText: { ...typography.caption, color: colors.textSecondary, flex: 1, marginRight: spacing.sm },
  toastUndo: { ...typography.caption, fontWeight: '700', color: colors.accent },

  modalSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.05)', marginBottom: spacing.md,
  },
  modalSearchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
});
