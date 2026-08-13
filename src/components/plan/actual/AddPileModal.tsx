// src/components/plan/actual/AddPileModal.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, LayoutAnimation } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import MachineSelect from '@components/plan/generate/steps/pile-assign/MachineSelect';
import {
  getPilesBySiteWithDimensionsPage,
  getPileCountsByLocationForSite,
  type PileWithDimension,
} from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import type { PilingMachine, PilingLocation } from '@db/schema';
import SearchToggleField from '@components/shared/SearchToggleField';
import PileGridCard from '@components/shared/PileGridCard';
import Pager from '@components/shared/Pager';
import EmptyState from '@components/shared/EmptyState';
import LocationFilterPillRow from '@components/shared/LocationFilterPillRow';
import { useAppConfig } from '@state/AppConfigContext';

interface AddPileModalProps {
  visible: boolean;
  onClose: () => void;
  siteId: string;
  /** Pile ids already in today's plan — excluded from search results. */
  excludePileIds: Set<string>;
  /** The machine whose sequence modal this was opened from — fixed, not editable here. */
  lockedMachine: { kind: 'rig' | 'crane'; machine: PilingMachine };
  rigs: PilingMachine[];
  cranes: PilingMachine[];
  isSaving: boolean;
  onConfirm: (input: { pileId: string; rigId: string; craneId: string }) => void;
}

export default function AddPileModal({
  visible,
  onClose,
  siteId,
  excludePileIds,
  lockedMachine,
  rigs,
  cranes,
  isSaving,
  onConfirm,
}: AddPileModalProps) {
  const { config } = useAppConfig();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeLocationId, setActiveLocationId] = useState('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PileWithDimension[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const [locations, setLocations] = useState<PilingLocation[]>([]);
  const [countByLocationId, setCountByLocationId] = useState<Record<string, number>>({});
  const [totalPileCount, setTotalPileCount] = useState(0);

  const [pendingPile, setPendingPile] = useState<PileWithDimension | null>(null);
  const [otherMachineId, setOtherMachineId] = useState<string | null>(null);

  // Debounce the raw input before it drives a query — every keystroke would
  // otherwise fire a fresh SQL round-trip.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), config.pilesSearchDebounceMs);
    return () => clearTimeout(t);
  }, [searchInput, config.pilesSearchDebounceMs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeLocationId]);

  // Stable string key so a parent re-render that recreates excludePileIds
  // (same contents, new Set instance) doesn't retrigger a fetch.
  const excludeKey = useMemo(() => Array.from(excludePileIds).sort().join(','), [excludePileIds]);

  useEffect(() => {
    if (!visible || !siteId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const excludeIds = excludeKey ? excludeKey.split(',') : [];
    getPilesBySiteWithDimensionsPage({
      siteId,
      search: debouncedSearch,
      locationId: activeLocationId,
      excludeIds,
      page,
      pageSize: config.pilesPageSize,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setItems(result.items);
        setTotal(result.total);
        setLoading(false);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, [visible, siteId, debouncedSearch, activeLocationId, page, excludeKey, config.pilesPageSize]);

  // Locations + per-location pile counts for the filter pill row — fetched
  // once per modal-open (not per keystroke/page), independent of search
  // text, mirroring PilesScreen.tsx's existing dimension-count behavior.
  useEffect(() => {
    if (!visible || !siteId) return;
    let cancelled = false;
    const excludeIds = excludeKey ? excludeKey.split(',') : [];
    Promise.all([getLocationsBySite(siteId), getPileCountsByLocationForSite(siteId, excludeIds)]).then(
      ([locationRows, counts]) => {
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
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visible, siteId, excludeKey]);

  const totalPages = Math.max(1, Math.ceil(total / config.pilesPageSize));

  if (!visible) return null;

  function toggleSearch() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (searchOpen) {
      setSearchInput('');
      setDebouncedSearch('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
    }
  }

  function reset() {
    requestIdRef.current++;
    setSearchOpen(false);
    setSearchInput('');
    setDebouncedSearch('');
    setActiveLocationId('all');
    setPage(1);
    setItems([]);
    setTotal(0);
    setPendingPile(null);
    setOtherMachineId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function confirm() {
    if (!pendingPile || !otherMachineId || isSaving) return;
    const rigId = lockedMachine.kind === 'rig' ? lockedMachine.machine.id : otherMachineId;
    const craneId = lockedMachine.kind === 'crane' ? lockedMachine.machine.id : otherMachineId;
    onConfirm({ pileId: pendingPile.id, rigId, craneId });
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      <View style={[styles.card, !pendingPile && styles.cardBrowsing]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Add a pile</Text>
          <Pressable onPress={handleClose} hitSlop={10}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {!pendingPile ? (
          <View style={styles.browseArea}>
            <SearchToggleField
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search pile code…"
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

            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>{total} PILES</Text>
              <Text style={styles.summaryText}>PAGE {page} OF {totalPages}</Text>
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              numColumns={2}
              style={styles.grid}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.columnWrapper}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <PileGridCard
                  code={item.pileIdCode}
                  dia={item.dia}
                  depth={item.depth}
                  area={item.area}
                  onPress={() => setPendingPile(item)}
                />
              )}
              ListEmptyComponent={
                !loading ? (
                  <EmptyState
                    icon="search"
                    title="No matching piles"
                    message={debouncedSearch ? 'No piles match your search.' : 'No piles available.'}
                  />
                ) : null
              }
            />

            <View style={styles.pagerRow}>
              {loading && <ActivityIndicator size="small" color={colors.accent} style={styles.pagerSpinner} />}
              <Pager page={page} totalPages={totalPages} onPageChange={setPage} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.selectedRow}>
              <Text style={styles.selectedLabel}>Pile {pendingPile.pileIdCode}</Text>
              {isSaving && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            <View pointerEvents={isSaving ? 'none' : 'auto'} style={isSaving && styles.dimmed}>
              <MachineSelect
                label="Rig"
                kind="rig"
                options={lockedMachine.kind === 'rig' ? [lockedMachine.machine] : rigs}
                valueId={lockedMachine.kind === 'rig' ? lockedMachine.machine.id : otherMachineId}
                onSelect={lockedMachine.kind === 'rig' ? () => {} : setOtherMachineId}
              />
              <MachineSelect
                label="Crane"
                kind="crane"
                options={lockedMachine.kind === 'crane' ? [lockedMachine.machine] : cranes}
                valueId={lockedMachine.kind === 'crane' ? lockedMachine.machine.id : otherMachineId}
                onSelect={lockedMachine.kind === 'crane' ? () => {} : setOtherMachineId}
              />
            </View>
            <Pressable
              onPress={confirm}
              disabled={!otherMachineId || isSaving}
              style={[styles.saveBtn, (!otherMachineId || isSaving) && styles.saveBtnDisabled]}
            >
              <Text style={styles.saveBtnText}>{isSaving ? 'Adding…' : 'Add to plan'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
    elevation: 21,
    backgroundColor: 'rgba(10,10,20,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardBrowsing: {
    height: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary },
  browseArea: {
    flex: 1,
    minHeight: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  summaryText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  grid: { flex: 1 },
  gridContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  columnWrapper: { gap: spacing.sm },
  pagerRow: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pagerSpinner: { marginBottom: spacing.xs },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  selectedLabel: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  dimmed: { opacity: 0.5 },
  saveBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
