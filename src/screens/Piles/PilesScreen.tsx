// src/screens/Piles/PilesScreen.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import PileRow, { type PileRowData } from '@components/piles/PileRow';
import PileStepsModal, { type CompletedStepRow } from '@components/piles/PileStepsModal';
import { colors, spacing, radius, typography } from '@theme/theme';
import { usePilesAreasStore } from '@store/pilesAreasStore';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import EmptyState from '@/components/shared/EmptyState';
import { derivePileStatus } from '@utils/helpers';

const PAGE_SIZE = 50;

// Steps carry plannedStart/plannedEnd as ISO-ish datetime strings, so a
// straight ascending string/Date comparison sorts them chronologically.
// Any step missing a plannedStart sinks to the end rather than throwing
// off the order of the ones that do have a time.
function byPlannedStartAsc<T extends { plannedStart?: string }>(a: T, b: T): number {
  if (!a.plannedStart && !b.plannedStart) return 0;
  if (!a.plannedStart) return 1;
  if (!b.plannedStart) return -1;
  return new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime();
}

export default function PilesScreen() {
  const user = useAuthStore((s) => s.user);

  const { piles, areas, dimensions, isLoading: pilesLoading, error, loadAll } = usePilesAreasStore();
  const { checklistPiles, planSteps, actualSteps } = usePlan();

  useEffect(() => {
    loadAll(user?.siteId);
  }, [user?.siteId, loadAll]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeDimensionId, setActiveDimensionId] = useState<string>('all');

  function toggleSearch(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (searchOpen) {
      setQuery('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
    }
  }

  // ── Lookups ──────────────────────────────────────────────────────────────
  const areaNameById = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);
  const pileById = useMemo(() => new Map(piles.map((p) => [p.id, p])), [piles]);

  const checklistPileByPileId = useMemo(
    () => new Map(checklistPiles.map((cp) => [cp.pileId, cp])),
    [checklistPiles],
  );
  const planStepsByChecklistPileId = useMemo(() => {
    const map = new Map<string, typeof planSteps>();
    for (const s of planSteps) {
      const list = map.get(s.checklistPileId);
      if (list) list.push(s);
      else map.set(s.checklistPileId, [s]);
    }
    return map;
  }, [planSteps]);
  const actualsByChecklistPileId = useMemo(() => {
    const map = new Map<string, typeof actualSteps>();
    for (const a of actualSteps) {
      const list = map.get(a.checklistPileId);
      if (list) list.push(a);
      else map.set(a.checklistPileId, [a]);
    }
    return map;
  }, [actualSteps]);

  function statusForPile(pileId: string): PileRowData['status'] {
    const cp = checklistPileByPileId.get(pileId);
    if (!cp) return 'pending';
    const steps = planStepsByChecklistPileId.get(cp.id) ?? [];
    const actuals = actualsByChecklistPileId.get(cp.id) ?? [];
    return derivePileStatus(steps.length, actuals);
  }

  // ── Dimension pills ──────────────────────────────────────────────────────
  const pileCountByDimensionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of piles) map[p.dimensionId] = (map[p.dimensionId] ?? 0) + 1;
    return map;
  }, [piles]);

  const dimensionOptions = useMemo(
    () => dimensions.filter((d) => (pileCountByDimensionId[d.id] ?? 0) > 0),
    [dimensions, pileCountByDimensionId],
  );

  // ── Row data + filtering ─────────────────────────────────────────────────
  const rows = useMemo<PileRowData[]>(
    () =>
      piles.map((p) => ({
        id: p.id,
        code: p.code,
        dia: p.dia,
        depth: p.depth,
        areaName: p.areaId ? areaNameById.get(p.areaId) ?? null : null,
        status: statusForPile(p.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [piles, areaNameById, checklistPileByPileId, planStepsByChecklistPileId, actualsByChecklistPileId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery = !q || r.code.toLowerCase().includes(q);
      const matchesDimension =
        activeDimensionId === 'all' || pileById.get(r.id)?.dimensionId === activeDimensionId;
      return matchesQuery && matchesDimension;
    });
  }, [rows, query, activeDimensionId, pileById]);

  // ── Pagination (batches of 50, guarded against duplicate onEndReached) ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [query, activeDimensionId]);

  useEffect(() => {
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [visibleCount]);

  function handleEndReached() {
    if (loadingMoreRef.current) return;
    if (visibleCount >= filtered.length) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
  }

  const visibleRows = filtered.slice(0, visibleCount);

  // ── Steps modal (computed lazily, only for the tapped pile) ─────────────
  const [selectedPile, setSelectedPile] = useState<PileRowData | null>(null);

  const selectedPileSteps = useMemo<CompletedStepRow[]>(() => {
    if (!selectedPile) return [];
    const cp = checklistPileByPileId.get(selectedPile.id);
    if (!cp) return [];
    const steps = (planStepsByChecklistPileId.get(cp.id) ?? []).slice().sort(byPlannedStartAsc);
    const actuals = actualsByChecklistPileId.get(cp.id) ?? [];
    return steps
      .map((s) => {
        const actual = actuals.find((a) => a.stepId === s.stepId);
        return actual?.actualEnd && actual.actualStart
          ? {
              id: s.id,
              name: s.stepName ?? '',
              track: (s.track ?? 'RIG') as CompletedStepRow['track'],
              actualStart: actual.actualStart,
              actualEnd: actual.actualEnd,
            }
          : null;
      })
      .filter((s): s is CompletedStepRow => s !== null);
  }, [selectedPile, checklistPileByPileId, planStepsByChecklistPileId, actualsByChecklistPileId]);

  const shownCount = filtered.length;

  // ── Loading ─────────────────────────────────────────────────────────────
  if (pilesLoading) {
    return (
      <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
        <SafeAreaView style={[styles.flex, styles.center]} edges={['top']}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.emptyText}>Loading piles…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Sticky header */}
        <View style={styles.headerArea}>
          <View style={styles.titleRow}>
            <Text style={styles.h1}>Piles</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{shownCount} shown</Text>
            </View>
          </View>

          <View style={styles.toolbarRow}>
            <View style={styles.flexSlot}>
              {searchOpen ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search piles by code"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                  autoFocus
                  returnKeyType="search"
                />
              ) : dimensionOptions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                  <Pill
                    label={`All (${piles.length})`}
                    active={activeDimensionId === 'all'}
                    onPress={() => setActiveDimensionId('all')}
                  />
                  {dimensionOptions.map((d) => (
                    <Pill
                      key={d.id}
                      label={`${d.label && d.label.trim() ? d.label : `Ø${d.dia}mm · ${d.depth}m`} (${pileCountByDimensionId[d.id] ?? 0})`}
                      active={activeDimensionId === d.id}
                      onPress={() => setActiveDimensionId(d.id)}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <Pressable style={styles.iconBtn} onPress={toggleSearch} hitSlop={spacing.sm}>
              {searchOpen ? <X size={16} color={colors.textSecondary} /> : <Search size={16} color={colors.textSecondary} />}
            </Pressable>
          </View>
        </View>

        {/* Paginated list */}
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PileRow pile={item} onPress={() => setSelectedPile(item)} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.4}
          onEndReached={handleEndReached}
          ListHeaderComponent={error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.accent} style={styles.footerSpinner} /> : null}
          ListEmptyComponent={
            !error ? (
              <EmptyState
                icon={piles.length === 0 ? 'download' : 'search'}
                title={piles.length === 0 ? 'No piles synced' : 'No matches'}
                message={
                  piles.length === 0
                    ? 'No piles synced yet. Pull data from the Profile tab.'
                    : 'No piles match your search or filter.'
                }
              />
            ) : null
          }
        />

        <PileStepsModal
          visible={!!selectedPile}
          onClose={() => setSelectedPile(null)}
          pileCode={selectedPile?.code ?? ''}
          steps={selectedPileSteps}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  h1: {
    ...typography.h1,
    color: colors.textPrimary,
  },

  countBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  countText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
  },

  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  input: {
    ...typography.caption,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    color: colors.textPrimary,
  },
  iconBtn: {
    padding: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pill: {
    minWidth: 84,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pillTextActive: { color: colors.textInverse },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  footerSpinner: {
    marginVertical: spacing.lg,
  },

  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  errorText: {
    ...typography.body,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
