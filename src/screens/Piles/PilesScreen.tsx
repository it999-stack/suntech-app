// src/screens/Piles/PilesScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import PileStepsModal, { type CompletedStepRow } from '@components/piles/PileStepsModal';
import { colors, spacing } from '@theme/theme';
import {
  getPilesBySiteFiltered,
  getPileStatusStatsForSite,
  getPileCountsByLocationForSite,
  type PileWithStatus,
  type PileStatusStats,
} from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import { getCompletedStepsForPileOnDate } from '@repositories/planRepository';
import type { PilingLocation } from '@db/schema';
import { useAuthStore } from '@store/authStore';
import Pager from '@components/shared/Pager';
import { useAppConfig } from '@state/AppConfigContext';

import ScreenHeader from './components/ScreenHeader';
import SearchInput from '@components/shared/SearchInput';
import StatsGrid, { type StatFilter } from './components/StatsGrid';
import FilterBar, { type FilterChipData } from './components/FilterBar';
import DataList from './components/DataList';
import FiltersSheet, { type AreaOption } from './components/FiltersSheet';
import { DEFAULT_FILTERS, STATUS_META, type PilesFiltersState } from './components/types';

// Floor for how long the list's loading spinner stays visible — see its use
// in the pile-fetch effect below.
const MIN_LOADING_MS = 300;

function buildFilterChips(filters: PilesFiltersState, locations: PilingLocation[]): FilterChipData[] {
  const chips: FilterChipData[] = [];
  for (const areaId of filters.areaIds) {
    const name = locations.find((l) => l.id === areaId)?.name ?? areaId;
    chips.push({ key: `area:${areaId}`, label: name });
  }
  for (const status of filters.statuses) {
    chips.push({ key: `status:${status}`, label: STATUS_META[status].label });
  }
  return chips;
}

export default function PilesScreen() {
  const user = useAuthStore((s) => s.user);
  const siteId = user?.siteId;
  const { config } = useAppConfig();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<PilesFiltersState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PilesFiltersState>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PileWithStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PileStatusStats | null>(null);
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

  // Debounce the raw input before it drives a query — every keystroke would
  // otherwise fire a fresh SQL round-trip.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), config.pilesSearchDebounceMs);
    return () => clearTimeout(t);
  }, [search, config.pilesSearchDebounceMs]);

  // Keyed off appliedFilters (not draftFilters) — editing checkboxes inside
  // the still-open sheet must not reset pagination or refetch mid-edit.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, appliedFilters]);

  useEffect(() => {
    if (!siteId) return;
    const requestId = ++requestIdRef.current;
    const startedAt = Date.now();
    setLoading(true);
    // The list query is local SQLite, not a network call — it usually
    // resolves within a handful of milliseconds, faster than React gets a
    // chance to actually paint the "loading" frame. Without a floor, the
    // spinner's on/off state changes happen back-to-back in the same tick
    // and the user never sees it at all. MIN_LOADING_MS pads that out to a
    // duration a human can actually perceive.
    const finishNoEarlierThan = (run: () => void) => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= MIN_LOADING_MS) {
        run();
      } else {
        setTimeout(run, MIN_LOADING_MS - elapsed);
      }
    };
    getPilesBySiteFiltered({
      siteId,
      search: debouncedSearch,
      locationIds: appliedFilters.areaIds,
      statuses: appliedFilters.statuses,
      page,
      pageSize: config.pilesPageSize,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return; // stale response, drop it
        finishNoEarlierThan(() => {
          if (requestIdRef.current !== requestId) return;
          setItems(result.items);
          setTotal(result.total);
          setError(null);
          setLoading(false);
          setInitialLoading(false);
        });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        finishNoEarlierThan(() => {
          if (requestIdRef.current !== requestId) return;
          setError('Failed to load piles.');
          setLoading(false);
          setInitialLoading(false);
        });
      });
  }, [siteId, debouncedSearch, appliedFilters, page, refreshTick, config.pilesPageSize]);

  // Stat tiles — deliberately independent of the status filter (see
  // getPileStatusStatsForSite's doc comment) so toggling one status
  // checkbox doesn't zero out the other three tiles.
  useEffect(() => {
    if (!siteId) return;
    getPileStatusStatsForSite({
      siteId,
      search: debouncedSearch,
      locationIds: appliedFilters.areaIds,
    }).then(setStats);
  }, [siteId, debouncedSearch, appliedFilters, refreshTick]);

  // Locations + per-location pile counts for the filter sheet's Area section
  // and chip labels — fetched once per site/focus, independent of search text.
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

  const areaOptions: AreaOption[] = useMemo(
    () => locations.map((l) => ({ id: l.id, name: l.name, count: countByLocationId[l.id] ?? 0 })),
    [locations, countByLocationId],
  );
  const filterChips = useMemo(() => buildFilterChips(appliedFilters, locations), [appliedFilters, locations]);
  const activeFilterCount = filterChips.length;

  function openFiltersSheet(): void {
    setDraftFilters(appliedFilters);
    setSheetOpen(true);
  }
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setSheetOpen(false);
  }
  function cancelFilters(): void {
    setSheetOpen(false);
  }
  function removeFilterChip(key: string): void {
    const next = { ...appliedFilters };
    if (key.startsWith('area:')) next.areaIds = next.areaIds.filter((id) => `area:${id}` !== key);
    else if (key.startsWith('status:')) next.statuses = next.statuses.filter((s) => `status:${s}` !== key);
    setAppliedFilters(next);
  }
  function clearAllFilters(): void {
    setAppliedFilters(DEFAULT_FILTERS);
  }

  // StatsGrid tiles act as a quick single-status filter, radio-button style —
  // Total clears it, tapping a status selects it (independent of the Filters
  // sheet's own multi-select statuses, though they share state). Tapping the
  // already-active tile is a no-op — it stays selected rather than toggling
  // back to Total.
  const activeStatFilter: StatFilter = appliedFilters.statuses.length === 1 ? appliedFilters.statuses[0] : 'ALL';
  function selectStatFilter(filter: StatFilter): void {
    if (filter === 'ALL') {
      setAppliedFilters({ ...appliedFilters, statuses: [] });
    } else {
      setAppliedFilters({ ...appliedFilters, statuses: [filter] });
    }
  }

  // ── Steps modal (fetched lazily for the tapped pile, from whichever day
  // its status/statusDate actually came from — not necessarily today) ─────
  const [selectedPile, setSelectedPile] = useState<PileWithStatus | null>(null);
  const [selectedPileSteps, setSelectedPileSteps] = useState<CompletedStepRow[]>([]);
  const [selectedPileStepsLoading, setSelectedPileStepsLoading] = useState(false);

  useEffect(() => {
    if (!selectedPile?.statusDate) {
      setSelectedPileSteps([]);
      setSelectedPileStepsLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedPileStepsLoading(true);
    getCompletedStepsForPileOnDate(selectedPile.id, selectedPile.statusDate).then((steps) => {
      if (cancelled) return;
      setSelectedPileSteps(steps);
      setSelectedPileStepsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPile]);

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

  const totalPages = Math.max(1, Math.ceil(total / config.pilesPageSize));

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Sticky header */}
        <View style={styles.headerArea}>
          <ScreenHeader title="Piles" onFilterPress={openFiltersSheet} filterActive={activeFilterCount > 0} />
          <SearchInput value={search} onChangeText={setSearch} />
          <StatsGrid stats={stats} activeFilter={activeStatFilter} onSelectFilter={selectStatFilter} />
          <FilterBar
            chips={filterChips}
            activeCount={activeFilterCount}
            onOpenFilters={openFiltersSheet}
            onRemoveChip={removeFilterChip}
            onClear={clearAllFilters}
          />
        </View>

        {/* List scrolls in its own bounded area so the pager below stays
            pinned in view instead of scrolling out of reach. */}
        <View style={styles.listSection}>
          <DataList items={items} error={error} totalPilesSynced={totalPileCount} onPressItem={setSelectedPile} loading={loading} />

          <View style={styles.pagerFooter}>
            <Pager page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} />
          </View>
        </View>

        <FiltersSheet
          visible={sheetOpen}
          onCancel={cancelFilters}
          draft={draftFilters}
          onChangeDraft={setDraftFilters}
          onApply={applyFilters}
          areaOptions={areaOptions}
        />

        <PileStepsModal
          visible={!!selectedPile}
          onClose={() => setSelectedPile(null)}
          pileCode={selectedPile?.pileIdCode ?? ''}
          steps={selectedPileSteps}
          loading={selectedPileStepsLoading}
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

  listSection: { flex: 1, minHeight: 0 },

  pagerFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    alignItems: 'center',
    gap: spacing.xs,
  },

  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
