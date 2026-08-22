// src/components/plan/actual/AddPileModal.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import MachineSelect from '@components/plan/generate/steps/pile-assign/MachineSelect';
import StepTimelineRow from '@components/plan/generate/preview/StepTimelineRow';
import { type TrackChoice } from '@components/plan/generate/preview/TrackChoiceTiles';
import {
  getPilesBySiteWithDimensionsPage,
  getPileCountsByLocationForSite,
  type PileWithDimension,
} from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import { getSteps } from '@repositories/stepsRepository';
import { getAllDurationTemplates } from '@repositories/durationTemplatesRepository';
import type { PilingMachine, PilingLocation, PilingStep } from '@db/schema';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import SearchToggleField from '@components/shared/SearchToggleField';
import PileGridCard from '@components/shared/PileGridCard';
import Pager from '@components/shared/Pager';
import EmptyState from '@components/shared/EmptyState';
import LocationFilterPillRow from '@components/shared/LocationFilterPillRow';
import { useAppConfig } from '@state/AppConfigContext';
import { usePlan, type EditPlanPileInput, type EditPlanPreviewStep } from '@state/PlanContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Breathing room from the very top of the screen once the card is pushed up
// flush against the keyboard, so its header never slides in under the status bar.
const TOP_CLEARANCE = 24;

interface AddPileModalProps {
  visible: boolean;
  onClose: () => void;
  siteId: string;
  checklistId: string;
  /** The Sequence editor's current in-progress draft — the pile being added
   * here is previewed alongside these so the preview's machine-availability
   * picture matches exactly what "Save Changes" would actually schedule. */
  draftRows: EditPlanPileInput[];
  /** Pile ids already in today's plan — excluded from search results. */
  excludePileIds: Set<string>;
  /** The machine whose sequence modal this was opened from — fixed, not editable here. */
  lockedMachine: { kind: 'rig' | 'crane'; machine: PilingMachine };
  rigs: PilingMachine[];
  cranes: PilingMachine[];
  isSaving: boolean;
  onConfirm: (input: { pileId: string; rigId: string; craneId?: string; stepTrackOverrides?: string[] }) => void;
}

export default function AddPileModal({
  visible,
  onClose,
  siteId,
  checklistId,
  draftRows,
  excludePileIds,
  lockedMachine,
  rigs,
  cranes,
  isSaving,
  onConfirm,
}: AddPileModalProps) {
  const { config } = useAppConfig();
  const { previewEditPlanMidDay } = usePlan();
  // Tracked so the card's own height can be clamped to whatever room is
  // actually left above the keyboard — otherwise a keyboard tall enough
  // (card height + keyboard height > screen height) pushes the card's top
  // off-screen above the status bar instead of just shrinking to fit.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const availableHeight = keyboardHeight > 0 ? SCREEN_HEIGHT - keyboardHeight - TOP_CLEARANCE : SCREEN_HEIGHT;
  const cardMaxHeight = Math.min(SCREEN_HEIGHT * 0.9, availableHeight);
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

  const [pendingPile, setPendingPile] = useState<PileWithDimension | null>(null);
  const [otherMachineId, setOtherMachineId] = useState<string | null>(null);

  // Applicable step catalog for the picked pile's dimension — same
  // "allSteps filtered to whatever has a duration template for this
  // dimension" derivation resumeWorkService.ts already uses elsewhere.
  const [applicableSteps, setApplicableSteps] = useState<PilingStep[]>([]);
  // Step ids whose CRANE-track step this pile should run on the Rig instead
  // — sent through as stepTrackOverrides on confirm.
  const [stepTrackOverrides, setStepTrackOverrides] = useState<string[]>([]);

  useEffect(() => {
    if (!pendingPile) {
      setApplicableSteps([]);
      setStepTrackOverrides([]);
      return;
    }
    let cancelled = false;
    Promise.all([getSteps(), getAllDurationTemplates(siteId)]).then(([allSteps, templates]) => {
      if (cancelled) return;
      const templateKeys = new Set(templates.map((t) => `${t.dimensionId}|${t.stepId}`));
      setApplicableSteps(allSteps.filter((s) => templateKeys.has(`${pendingPile.dimensionId}|${s.id}`)));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingPile, siteId]);

  // Real computed schedule for the pending pile — previewed alongside the
  // Sequence editor's current draft (draftRows) so the machine-availability
  // picture matches exactly what "Save Changes" would actually schedule.
  // Debounced: a pile/machine/track-toggle change fires a fresh preview call
  // (same 450ms-ish debounce the generation wizard's own track tiles use).
  const [previewPile, setPreviewPile] = useState<EditPlanPreviewStep[] | null>(null);
  const [previewComplete, setPreviewComplete] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingPile) {
      setPreviewPile(null);
      setPreviewError(null);
      return;
    }
    const rigId = lockedMachine.kind === 'rig' ? lockedMachine.machine.id : otherMachineId;
    if (!rigId) {
      setPreviewPile(null);
      setPreviewError(null);
      return;
    }
    const craneId = lockedMachine.kind === 'crane' ? lockedMachine.machine.id : (otherMachineId ?? undefined);
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      previewEditPlanMidDay(siteId, checklistId, [
        ...draftRows,
        { pileId: pendingPile.id, rigId, craneId, stepTrackOverrides },
      ])
        .then((result) => {
          if (cancelled) return;
          const pile = result.piles.find((p) => p.pileId === pendingPile.id) ?? null;
          setPreviewPile(pile?.steps ?? []);
          setPreviewComplete(pile?.isPlanComplete ?? true);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreviewPile(null);
          setPreviewError(
            (err as any)?.response?.data?.detail ||
              (err instanceof Error ? err.message : 'Could not compute a preview.'),
          );
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingPile,
    otherMachineId,
    stepTrackOverrides,
    // lockedMachine is a fresh object literal on every FillActualScreen
    // render — depend on its actual identity fields instead, or this
    // effect would restart its debounce on every unrelated parent re-render.
    lockedMachine.kind,
    lockedMachine.machine.id,
    draftRows,
    siteId,
    checklistId,
    previewEditPlanMidDay,
  ]);

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

  // Rig is mandatory, crane is optional. When the locked machine is the rig,
  // otherMachineId (the crane) may stay unset — the pile is added rig-only.
  // When the locked machine is the crane, otherMachineId (the rig) is
  // required, since a pile can never be added without one.
  const canConfirm = !!pendingPile && !isSaving && (lockedMachine.kind === 'rig' || !!otherMachineId);

  // Resolved rig/crane machine records for the step list's TrackChoiceTiles
  // below — mirrors the rig/crane resolution already done inline for the
  // MachineSelect rows just above.
  const resolvedRig =
    lockedMachine.kind === 'rig' ? lockedMachine.machine : rigs.find((r) => r.id === otherMachineId);
  const resolvedCrane =
    lockedMachine.kind === 'crane' ? lockedMachine.machine : cranes.find((c) => c.id === otherMachineId);

  function confirm() {
    if (!canConfirm || !pendingPile) return;
    const rigId = lockedMachine.kind === 'rig' ? lockedMachine.machine.id : otherMachineId!;
    const craneId = lockedMachine.kind === 'crane' ? lockedMachine.machine.id : (otherMachineId ?? undefined);
    onConfirm({ pileId: pendingPile.id, rigId, craneId, stepTrackOverrides });
  }

  // Every applicable step, real computed times where the preview scheduled
  // one, faded placeholders (isPlanned=false) for whatever it cut off —
  // exactly the diff PilesAccordion.tsx does against allSteps/planSteps for
  // the generation wizard's own live preview.
  const previewStepById = useMemo(
    () => new Map((previewPile ?? []).map((s) => [s.stepId, s])),
    [previewPile],
  );
  const displayRows: PlanStepWithMeta[] = applicableSteps.map((step) => {
    const scheduled = previewStepById.get(step.id);
    return {
      id: scheduled ? `${step.id}-scheduled` : `${step.id}-unplanned`,
      checklistPileId: '',
      stepId: step.id,
      stepName: step.stepName,
      sequenceOrder: step.sequenceOrder,
      track: scheduled?.track ?? step.track,
      businessTrack: step.track,
      plannedStart: scheduled?.plannedStart ?? '',
      plannedEnd: scheduled?.plannedEnd ?? null,
      durationMinutes: scheduled?.durationMinutes ?? 0,
      bufferMinutes: 0,
      assignedMachineId: scheduled?.assignedMachineId ?? null,
      assignedMachineNo: '',
      createdAt: 0,
      updatedAt: null,
    } as unknown as PlanStepWithMeta;
  });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
      <View
        style={[
          styles.card,
          { maxHeight: cardMaxHeight },
          !pendingPile && [styles.cardBrowsing, { height: cardBrowsingHeight }],
        ]}
      >
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
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

              {applicableSteps.length > 0 && (
                <View style={styles.stepsSection}>
                  <View style={styles.stepsSectionHeader}>
                    <Text style={styles.fieldLabel}>Steps</Text>
                    {previewLoading && <ActivityIndicator size="small" color={colors.accent} />}
                  </View>
                  {previewError ? (
                    <Text style={styles.previewErrorText}>{previewError}</Text>
                  ) : (
                    <>
                      {!previewComplete && (
                        <Text style={styles.previewHint}>
                          Not every step fits in the remaining plan window — faded steps carry over.
                        </Text>
                      )}
                      {displayRows.map((row, idx) => {
                        // No crane chosen at all — every CRANE step auto-runs on
                        // the rig, same rule as _resolve_step_execution's
                        // no_crane case. Nothing to toggle in that case.
                        const forcedRig = !resolvedCrane;
                        return (
                          <StepTimelineRow
                            key={row.stepId}
                            step={row}
                            isLast={idx === displayRows.length - 1}
                            isPlanned={row.plannedStart !== ''}
                            rigMachineNo={resolvedRig?.machineNo ?? '—'}
                            craneMachineNo={forcedRig ? undefined : resolvedCrane?.machineNo}
                            trackChoice={
                              forcedRig
                                ? undefined
                                : {
                                    selected: row.track === 'RIG' ? 'RIG' : ('CRANE' as TrackChoice),
                                    onSelect: (track) =>
                                      setStepTrackOverrides((prev) =>
                                        track === 'RIG'
                                          ? [...prev, row.stepId]
                                          : prev.filter((id) => id !== row.stepId),
                                      ),
                                  }
                            }
                          />
                        );
                      })}
                    </>
                  )}
                </View>
              )}
            </View>
            <Pressable
              onPress={confirm}
              disabled={!canConfirm}
              style={[styles.saveBtn, !canConfirm && styles.saveBtnDisabled]}
            >
              <Text style={styles.saveBtnText}>{isSaving ? 'Adding…' : 'Add to plan'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
      </KeyboardAvoidingView>
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
  keyboardAvoider: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.9,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardBrowsing: {
    height: SCREEN_HEIGHT * 0.8,
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
  stepsSection: { marginTop: spacing.md },
  stepsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  previewErrorText: {
    ...typography.caption,
    color: colors.danger,
    paddingVertical: spacing.sm,
  },
  previewHint: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
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
