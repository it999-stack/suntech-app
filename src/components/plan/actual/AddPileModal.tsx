// src/components/plan/actual/AddPileModal.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, typography } from '@theme/theme';
import MachineSelect from '@components/plan/generate/steps/pile-assign/MachineSelect';
import {
  getPilesBySite,
  getPilesBySiteWithDimensionsPage,
  getPileCountsByLocationForSite,
  type PileWithDimension,
} from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import { findResumeWorkForPiles } from '@/services/resumeWorkService';
import type { PilingMachine, PilingLocation } from '@db/schema';
import SearchToggleField from '@components/shared/SearchToggleField';
import PileGridCard from '@components/shared/PileGridCard';
import Pager from '@components/shared/Pager';
import EmptyState from '@components/shared/EmptyState';
import Button from '@components/shared/Button';
import LocationFilterPillRow from '@components/shared/LocationFilterPillRow';
import { useAppConfig } from '@state/AppConfigContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface AddPileModalProps {
  visible: boolean;
  onClose: () => void;
  siteId: string;
  checklistId: string;
  /** "YYYY-MM-DD" — the checklist's own date. Passed straight to
   * findResumeWorkForPiles as `beforeDate`, so "completed" means completed on
   * some checklist strictly before this one — same as usePlanDraft.ts's own
   * exclusion for the fresh-generate wizard. */
  targetDate: string;
  /** Pile CODES already in today's plan — excluded from search results.
   * Codes, not ids: pil_piles has no uniqueness constraint on
   * (site_id, pile_id_code) yet, so a sync can leave two different local
   * rows sharing the same code — excluding by id alone would let a
   * duplicate row for an already-planned pile slip through the picker. */
  excludePileCodes: Set<string>;
  /** The machine whose sequence modal this was opened from — fixed, not editable here. */
  lockedMachine: { kind: 'rig' | 'crane'; machine: PilingMachine };
  rigs: PilingMachine[];
  cranes: PilingMachine[];
  isSaving: boolean;
  onConfirm: (input: { pileId: string; rigId: string; craneId?: string }) => void;
}

export default function AddPileModal({
  visible,
  onClose,
  siteId,
  checklistId,
  targetDate,
  excludePileCodes,
  lockedMachine,
  rigs,
  cranes,
  isSaving,
  onConfirm,
}: AddPileModalProps) {
  const { config } = useAppConfig();
  const insets = useSafeAreaInsets();
  const availableHeight = SCREEN_HEIGHT - insets.top - insets.bottom;
  const cardMaxHeight = Math.min(SCREEN_HEIGHT * 1.0, availableHeight);
  const cardBrowsingHeight = Math.min(SCREEN_HEIGHT * 0.8, availableHeight);

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
  const [completedPileCodes, setCompletedPileCodes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!visible || !siteId) return;
    let cancelled = false;
    getPilesBySite(siteId).then((allPiles) => {
      const codeById = new Map(allPiles.map((p) => [p.id, p.pileIdCode]));
      findResumeWorkForPiles(siteId, allPiles.map((p) => p.id), targetDate).then((result) => {
        if (cancelled) return;
        const codes = result.completedPileIds
          .map((id) => codeById.get(id))
          .filter((code): code is string => !!code);
        setCompletedPileCodes(new Set(codes));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, siteId, targetDate]);

  const [pendingPile, setPendingPile] = useState<PileWithDimension | null>(null);
  const [otherMachineId, setOtherMachineId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPendingPile(null);
      setOtherMachineId(null);
    }
  }, [visible]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), config.pilesSearchDebounceMs);
    return () => clearTimeout(t);
  }, [searchInput, config.pilesSearchDebounceMs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeLocationId]);

  const excludeKey = useMemo(
    () => Array.from(new Set([...excludePileCodes, ...completedPileCodes])).sort().join(','),
    [excludePileCodes, completedPileCodes],
  );

  useEffect(() => {
    if (!visible || !siteId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const excludeCodes = excludeKey ? excludeKey.split(',') : [];
    getPilesBySiteWithDimensionsPage({
      siteId,
      search: debouncedSearch,
      locationId: activeLocationId,
      excludeCodes,
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
    const excludeCodes = excludeKey ? excludeKey.split(',') : [];
    Promise.all([getLocationsBySite(siteId), getPileCountsByLocationForSite(siteId, excludeCodes)]).then(
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

  // No `if (!visible) return null` here — AppModal below needs to keep
  // receiving `visible` as it actually transitions to false so its own
  // close tween can play; an early return here would unmount AppModal
  // (and skip the tween) the instant visible flips, same bug fixed for
  // ReorderPilesModal.
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

  // Rig is mandatory, crane is optional. When the locked machine is the rig,
  // otherMachineId (the crane) may stay unset — the pile is added rig-only.
  // When the locked machine is the crane, otherMachineId (the rig) is
  // required, since a pile can never be added without one.
  const canConfirm = !!pendingPile && !isSaving && (lockedMachine.kind === 'rig' || !!otherMachineId);

  function confirm() {
    if (!canConfirm || !pendingPile) return;
    const rigId = lockedMachine.kind === 'rig' ? lockedMachine.machine.id : otherMachineId!;
    const craneId = lockedMachine.kind === 'crane' ? lockedMachine.machine.id : (otherMachineId ?? undefined);
    onConfirm({ pileId: pendingPile.id, rigId, craneId });
  }

  return (
    <AppModal
      visible={visible}
      onClose={handleClose}
      position="bottom"
      scrollable={false}
      showCloseButton={false}
    >
      <View
        style={[
          styles.content,
          { maxHeight: cardMaxHeight },
          { height: cardBrowsingHeight },
        ]}
      >
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
          <View style={styles.pendingArea}>
            <ScrollView
              style={styles.pendingScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                  label={lockedMachine.kind === 'rig' ? 'Crane (optional)' : 'Crane'}
                  kind="crane"
                  options={lockedMachine.kind === 'crane' ? [lockedMachine.machine] : cranes}
                  valueId={lockedMachine.kind === 'crane' ? lockedMachine.machine.id : otherMachineId}
                  onSelect={lockedMachine.kind === 'crane' ? () => {} : setOtherMachineId}
                  onClear={lockedMachine.kind === 'rig' ? () => setOtherMachineId(null) : undefined}
                />
              </View>
            </ScrollView>
            <Button
              label="Add to plan"
              loading={isSaving}
              disabled={!canConfirm}
              onPress={confirm}
              style={styles.saveBtn}
            />
          </View>
        )}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  // AppModal supplies the backdrop, sheet chrome, keyboard avoidance, and
  // header (title + close) now — this just bounds the content area to the
  // same browsing-height/keyboard-aware sizing the old hand-rolled card used.
  content: {
    width: '100%',
  },
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
  // pendingArea/pendingScroll: flex:1 + minHeight:0 is what lets
  // pendingScroll actually shrink to "whatever's left after the footer"
  // instead of growing to fit all its content — the standard RN recipe for
  // a fixed-position footer below a scrollable region. minHeight:0
  // overrides a flex child's default min-height:auto, which would otherwise
  // refuse to shrink below its content's natural size.
  pendingArea: { flex: 1, minHeight: 0 },
  pendingScroll: { flex: 1, minHeight: 0 },
  dimmed: { opacity: 0.5 },
  saveBtn: { marginTop: spacing.sm },
});
