// src/screens/Piles/PilesScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, LayoutAnimation } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import PileStepsModal, { type CompletedStepRow } from '@components/piles/PileStepsModal';
import { colors, spacing, radius, typography } from '@theme/theme';
import {
  getPilesBySiteWithDimensionsPage,
  getPileCountsByLocationForSite,
  type PileWithDimension,
} from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import type { PilingLocation } from '@db/schema';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import EmptyState from '@/components/shared/EmptyState';
import SearchToggleField from '@components/shared/SearchToggleField';
import LocationFilterPillRow from '@components/shared/LocationFilterPillRow';
import PileGridCard from '@components/shared/PileGridCard';
import Pager from '@components/shared/Pager';
import { derivePileStatus } from '@utils/helpers';
import { useAppConfig } from '@state/AppConfigContext';

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
  const siteId = user?.siteId;
  const { checklistPiles, planSteps, actualSteps } = usePlan();
  const { config } = useAppConfig();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeLocationId, setActiveLocationId] = useState('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PileWithDimension[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [locations, setLocations] = useState<PilingLocation[]>([]);
  const [countByLocationId, setCountByLocationId] = useState<Record<string, number>>({});
  const [totalPileCount, setTotalPileCount] = useState(0);

  // Tab screens stay mounted when you switch tabs, so a manual sync on the
  // Profile tab wouldn't otherwise be reflected here without leaving and
  // re-entering the tab — bump a tick on every focus to force a refetch.
  const [refreshTick, setRefreshTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshTick((t) => t + 1);
    }, []),
  );

  function toggleSearch(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (searchOpen) {
      setSearchInput('');
      setDebouncedSearch('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
    }
  }

  // Debounce the raw input before it drives a query — every keystroke would
  // otherwise fire a fresh SQL round-trip.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), config.pilesSearchDebounceMs);
    return () => clearTimeout(t);
  }, [searchInput, config.pilesSearchDebounceMs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeLocationId]);

  useEffect(() => {
    if (!siteId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    getPilesBySiteWithDimensionsPage({
      siteId,
      search: debouncedSearch,
      locationId: activeLocationId,
      page,
      pageSize: config.pilesPageSize,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return; // stale response, drop it
        setItems(result.items);
        setTotal(result.total);
        setError(null);
        setLoading(false);
        setInitialLoading(false);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setError('Failed to load piles.');
        setLoading(false);
        setInitialLoading(false);
      });
  }, [siteId, debouncedSearch, activeLocationId, page, refreshTick, config.pilesPageSize]);

  // Locations + per-location pile counts for the filter pill row — fetched
  // once per site/focus (not per keystroke/page), independent of search text.
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    Promise.all([getLocationsBySite(siteId), getPileCountsByLocationForSite(siteId)]).then(([locationRows, counts]) => {
      if (cancelled) return;
      setLocations(locationRows);
      const byId: Record<string, number> = {};
      let sum = 0;
      for (const c of counts) {
        sum += c.count;
        if (c.locationId) byId[c.locationId] = c.count;
      }
      setCountByLocationId(byId);
      setTotalPileCount(sum);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshTick]);

  const totalPages = Math.max(1, Math.ceil(total / config.pilesPageSize));

  // ── Status lookups (today's checklist only — small, independent of how
  // many piles are currently paged in) ────────────────────────────────────
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

  function statusForPile(pileId: string): 'pending' | 'in_progress' | 'completed' {
    const cp = checklistPileByPileId.get(pileId);
    if (!cp) return 'pending';
    const steps = planStepsByChecklistPileId.get(cp.id) ?? [];
    const actuals = actualsByChecklistPileId.get(cp.id) ?? [];
    return derivePileStatus(steps.length, actuals);
  }

  // ── Steps modal (computed lazily, only for the tapped pile) ─────────────
  const [selectedPile, setSelectedPile] = useState<PileWithDimension | null>(null);

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

  // ── Loading ─────────────────────────────────────────────────────────────
  if (initialLoading) {
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
              <Text style={styles.countText}>{total} shown</Text>
            </View>
          </View>

          <SearchToggleField
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search piles by code"
            icon={searchOpen ? 'x' : 'search'}
            onIconPress={toggleSearch}
            showField={searchOpen}
            autoFocus
            collapsedContent={
              <LocationFilterPillRow
                locations={locations}
                countByLocationId={countByLocationId}
                totalCount={totalPileCount}
                activeLocationId={activeLocationId}
                onLocationChange={setActiveLocationId}
              />
            }
          />
        </View>

        {/* Paginated grid — the list scrolls in its own bounded area so the
            pager below stays pinned in view instead of scrolling out of
            reach at the bottom of a long page (matches PileAssignStep /
            AddPileModal's list+pinned-pager layout). */}
        <View style={styles.listSection}>
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            renderItem={({ item }) => (
              <PileGridCard
                code={item.pileIdCode}
                dia={item.dia}
                depth={item.depth}
                area={item.area}
                badge="none"
                completed={statusForPile(item.id) === 'completed'}
                onPress={() => setSelectedPile(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}
            ListEmptyComponent={
              !error ? (
                <EmptyState
                  icon={totalPileCount === 0 ? 'download' : 'search'}
                  title={totalPileCount === 0 ? 'No piles synced' : 'No matches'}
                  message={
                    totalPileCount === 0
                      ? 'No piles synced yet. Pull data from the Profile tab.'
                      : 'No piles match your search or filter.'
                  }
                />
              ) : null
            }
          />

          <View style={styles.pagerFooter}>
            {loading && <ActivityIndicator size="small" color={colors.accent} style={styles.pagerSpinner} />}
            <Pager page={page} totalPages={totalPages} onPageChange={setPage} />
          </View>
        </View>

        <PileStepsModal
          visible={!!selectedPile}
          onClose={() => setSelectedPile(null)}
          pileCode={selectedPile?.pileIdCode ?? ''}
          steps={selectedPileSteps}
        />
      </SafeAreaView>
    </LinearGradient>
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

  columnWrapper: { gap: spacing.sm },

  listSection: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

  pagerFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pagerSpinner: { marginBottom: spacing.xs },

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
