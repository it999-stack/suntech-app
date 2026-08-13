// src/screens/Home/FillActualScreen.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '@app-types/navigation';
import { ChevronLeft, PencilLine, Drill, Forklift, Coffee } from 'lucide-react-native';
import { colors, spacing, typography, radius } from '@theme/theme';
import { toLocalIsoString, resolveOvernightDate, resolveActualTimeAnchor, formatTimeWithDay } from '@utils/formatTime';
import { stepWorkStart } from '@utils/helpers';
import { buildMachineFloorIndex, nextFreeTimeOnOrAfter } from '@utils/machineFloor';
import { usePlan, type LogMachineEventInput, type EditPlanPileInput } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import PileProgressCard from '@components/plan/actual/PileProgressCard';
import PileStepsModal from '@components/plan/actual/PileStepsModal';
import MachineEventsModal from '@components/plan/actual/MachineEventsModal';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import ReorderPilesOverlay, { type ReorderPile } from '@components/plan/generate/preview/ReorderPilesOverlay';
import AddPileModal from '@components/plan/actual/AddPileModal';
import EmptyState from '@components/shared/EmptyState';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { getPilesBySite } from '@repositories/pilesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getMachineEventsForChecklist } from '@repositories/machineEventsRepository';
import { getNonWorkingWindowsByShift } from '@repositories/shiftsRepository';
import { resolveWindows, type EffectivePlanWindow } from '@/services/pilingPlannerService';
import { splitStepByInternalWindows } from '@components/plan/generate/preview/previewUtils';
import type { PilingMachine, PilingPile, PilingSitePersonnel, PilMachineEvent, PilingNonWorkingWindow } from '@db/schema';
import type { ActualEntry, PileGroup } from '@app-types/plan';

const EMPTY_PILE_GROUPS: PileGroup[] = [];

type MachineBadge = { id: string; machineNo: string; type: 'RIG' | 'CRANE' };

/** Convert ISO timestamp to minutes-since-midnight (used by old components). */
function isoToMinutes(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return undefined;
  }
}

/** An open self-logged idle session on one machine — resolved from the most
 * recent IDLE_START on that machine with no later IDLE_END. */
export interface OpenIdleSession {
  since: string;
  notes: string | null;
}

/** Shown above a machine's own pile list while it has an open idle session —
 * "between log actual piles" per the feature request, not a plain pile card
 * so it doesn't read as one. Tapping it opens the End Idle form for this
 * machine, closing out the same session (same pile/step it was started on). */
function MachineIdleTile({ since, notes, onPress }: OpenIdleSession & { onPress: () => void }) {
  return (
    <Pressable style={styles.idleTile} onPress={onPress}>
      <Coffee size={18} color={colors.warning} />
      <View style={styles.idleTileTextWrap}>
        <Text style={styles.idleTileTitle}>Machine idle — tap to end idle</Text>
        <Text style={styles.idleTileSubtitle}>
          Since {formatTimeWithDay(since)}
          {notes ? ` · ${notes}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

interface MachinePilesPageProps {
  activeGroups: PileGroup[];
  upcomingGroups: PileGroup[];
  openIdle?: OpenIdleSession;
  onOpenPile: (checklistPileId: string) => void;
  onEndIdle?: () => void;
}

/** One machine's page inside the badge pager. Memoized because SwipeableTabBar's PagerView
 * mounts every machine's page up front (needed for swipe), so without this every machine
 * would re-render on any unrelated change (e.g. another pile's step being logged). */
const MachinePilesPage = React.memo(function MachinePilesPage({
  activeGroups,
  upcomingGroups,
  openIdle,
  onOpenPile,
  onEndIdle,
}: MachinePilesPageProps) {
  return (
    <View style={styles.machinePage}>
      {openIdle && onEndIdle && (
        <MachineIdleTile since={openIdle.since} notes={openIdle.notes} onPress={onEndIdle} />
      )}

      {activeGroups.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Up Next</Text>
          {activeGroups.map((group) => (
            <PileProgressCard
              key={group.checklistPileId}
              pileCode={group.pileCode}
              rig={group.rig}
              crane={group.crane}
              steps={group.steps}
              hasBreakdownWarning={group.hasBreakdownWarning}
              isBlockedByIdle={group.isBlockedByIdle}
              onPress={() => onOpenPile(group.checklistPileId)}
            />
          ))}
        </>
      )}

      {upcomingGroups.length > 0 && (
        <>
          {activeGroups.length > 0 && <Text style={styles.sectionHeader}>Remaining Piles</Text>}
          {upcomingGroups.map((group) => (
            <PileProgressCard
              key={group.checklistPileId}
              pileCode={group.pileCode}
              rig={group.rig}
              crane={group.crane}
              steps={group.steps}
              hasBreakdownWarning={group.hasBreakdownWarning}
              isBlockedByIdle={group.isBlockedByIdle}
              onPress={() => onOpenPile(group.checklistPileId)}
            />
          ))}
        </>
      )}
    </View>
  );
});

type FillActualsRouteProp = RouteProp<HomeStackParamList, 'FillActuals'>;

export default function FillActualsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<FillActualsRouteProp>();
  const user = useAuthStore((s) => s.user);
  const siteId = user?.siteId ?? '';
  const deviceWorkingDate = useWorkingDate();
  const workingDate = route.params?.date ?? deviceWorkingDate;

  const {
    checklist,
    planSteps,
    actualSteps,
    checklistPiles,
    isLoading,
    conflictNotice,
    dismissConflictNotice,
    loadChecklist,
    setActualTime,
    clearActualTime,
    setRemarks,
    logMachineEvent,
    editPlanMidDay,
  } = usePlan();

  // ── Load the working date's checklist on mount ─────────────────────────
  useEffect(() => {
    if (siteId) loadChecklist(siteId, workingDate);
  }, [siteId, workingDate, loadChecklist]);

  // ── Surface genuine sync conflicts instead of silently overwriting ──────
  useEffect(() => {
    if (!conflictNotice) return;
    // Alert.alert('Updated elsewhere', conflictNotice, [
    //   { text: 'OK', onPress: dismissConflictNotice },
    // ]);
  }, [conflictNotice, dismissConflictNotice]);

  // ── Local machine + pile name lookups ───────────────────────────────────
  const [machines, setMachines] = useState<PilingMachine[]>([]);
  const [machineMap, setMachineMap] = useState<Map<string, string>>(new Map());
  const [pileMap, setPileMap] = useState<Map<string, PilingPile>>(new Map());
  const [personnelMap, setPersonnelMap] = useState<Map<string, PilingSitePersonnel>>(new Map());
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Shift Incharge (Shift 1) for the header subtitle — the closest
  // equivalent to what "supervisor" used to mean before the multi-role
  // system replaced it.
  const [shiftIncharge1Id, setShiftIncharge1Id] = useState<string | null>(null);
  useEffect(() => {
    if (!checklist) {
      setShiftIncharge1Id(null);
      return;
    }
    getChecklistPersonnel(checklist.id)
      .then((rows) => {
        const row = rows.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 1);
        setShiftIncharge1Id(row?.personnelId ?? null);
      })
      .catch(() => setShiftIncharge1Id(null));
  }, [checklist]);

  useEffect(() => {
    if (!siteId) return;
    setLookupsLoading(true);
    (async () => {
      const [fetchedMachines, piles, personnel] = await Promise.all([
        getMachinesBySite(siteId),
        getPilesBySite(siteId),
        getPersonnelBySite(siteId),
      ]);
      setMachines(fetchedMachines);
      setMachineMap(new Map(fetchedMachines.map((m) => [m.id, m.machineNo])));
      setPileMap(new Map(piles.map((p) => [p.id, p])));
      setPersonnelMap(new Map(personnel.map((p) => [p.id, p])));
      setLookupsLoading(false);
    })();
  }, [siteId]);

  // Reloaded after logging any machine event — a breakdown/idle status flip
  // (setMachineStatusLocal) and this checklist's event history both need to
  // be visible immediately (blocking, the idle tile, the banners), not only
  // after the next full lookups reload.
  const reloadMachines = useCallback(async () => {
    if (!siteId) return;
    const fetched = await getMachinesBySite(siteId);
    setMachines(fetched);
    setMachineMap(new Map(fetched.map((m) => [m.id, m.machineNo])));
  }, [siteId]);

  const [machineEvents, setMachineEvents] = useState<PilMachineEvent[]>([]);
  const reloadMachineEvents = useCallback(async () => {
    if (!checklist) {
      setMachineEvents([]);
      return;
    }
    setMachineEvents(await getMachineEventsForChecklist(checklist.id));
  }, [checklist]);
  useEffect(() => {
    reloadMachineEvents();
  }, [reloadMachineEvents]);

  const machineStatusById = useMemo(
    () => new Map(machines.map((m) => [m.id, m.status])),
    [machines],
  );

  // Resolves each machine's most recent IDLE_START with no later IDLE_END —
  // the pile/step it carries is the same one the End Idle action must close
  // the session out against (PilingMachineEvent requires a pile/step, so
  // ending idle reuses whichever pile/step it was started from).
  const openIdleByMachineId = useMemo(() => {
    const sorted = [...machineEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const openByMachine = new Map<string, PilMachineEvent>();
    for (const e of sorted) {
      if (!e.machineId) continue;
      if (e.eventType === 'IDLE_START') openByMachine.set(e.machineId, e);
      else if (e.eventType === 'IDLE_END') openByMachine.delete(e.machineId);
    }
    return openByMachine;
  }, [machineEvents]);

  const idleSessionByMachineId = useMemo(() => {
    const map = new Map<string, OpenIdleSession>();
    for (const [machineId, e] of openIdleByMachineId) {
      map.set(machineId, { since: e.occurredAt, notes: e.notes });
    }
    return map;
  }, [openIdleByMachineId]);

  const checklistPileIdByPileId = useMemo(
    () => new Map(checklistPiles.map((cp) => [cp.pileId, cp.id])),
    [checklistPiles],
  );

  // ── Non-working windows (lunch, shift change, etc.) for break labels ────
  // Re-derived here rather than persisted at generation time — see
  // splitStepByInternalWindows below; this is the same overlap logic the
  // Generate Plan Preview screen already uses, just re-run against whatever's
  // actually synced locally so it works regardless of which device generated
  // the plan.
  const [rawWindows, setRawWindows] = useState<PilingNonWorkingWindow[]>([]);
  useEffect(() => {
    if (!checklist?.shiftTypeId) {
      setRawWindows([]);
      return;
    }
    getNonWorkingWindowsByShift(checklist.shiftTypeId).then(setRawWindows).catch(() => {});
  }, [checklist?.shiftTypeId]);

  const windowsByMachineId = useMemo((): Record<string, EffectivePlanWindow[]> => {
    if (!checklist?.planStartTime || !rawWindows.length) return {};
    const resolved = resolveWindows(rawWindows, new Date(checklist.planStartTime));
    const windows: EffectivePlanWindow[] = resolved.map((w) => ({
      id: w.id,
      label: w.label,
      start: toLocalIsoString(w.start),
      end: toLocalIsoString(w.end),
    }));
    const machineIds = new Set(planSteps.map((s) => s.assignedMachineId).filter((id): id is string => !!id));
    const map: Record<string, EffectivePlanWindow[]> = {};
    for (const machineId of machineIds) map[machineId] = windows;
    return map;
  }, [rawWindows, checklist?.planStartTime, planSteps]);

  // ── Build pile groups from context data ─────────────────────────────────
  const pileGroups = useMemo((): PileGroup[] => {
    if (!checklistPiles.length) return [];

    return checklistPiles.map((cp) => {
      const pile = pileMap.get(cp.pileId);

      // Steps for this checklist-pile, merged plan + actual — sorted by
      // sequence order so "previous step" is well-defined for anchor math
      // below (handleSetActualTime relies on the same ordering).
      const cpPlanSteps = planSteps
        .filter((s) => s.checklistPileId === cp.id)
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === cp.id);

      const steps: ActualEntry[] = cpPlanSteps.map((ps, idx) => {
        const actual = cpActualSteps.find((a) => a.stepId === ps.stepId);
        const prevPlan = idx > 0 ? cpPlanSteps[idx - 1] : null;
        const prevActual = prevPlan ? cpActualSteps.find((a) => a.stepId === prevPlan.stepId) : null;
        const anchorStep = { plannedStart: ps.plannedStart, plannedEnd: ps.plannedEnd, actualStart: actual?.actualStart };
        const planBreaks = splitStepByInternalWindows(ps, windowsByMachineId)?.breaks;

        return {
          stepId: ps.stepId,
          pileId: cp.pileId,
          pileCode: pile?.pileIdCode ?? cp.pileId,
          stepName: ps.stepName,
          track: ps.track as 'RIG' | 'CRANE' | 'COMPRESSOR',
          sequenceOrder: ps.sequenceOrder,
          plannedStart: isoToMinutes(stepWorkStart(ps)) ?? 0,
          // Preserve undefined (rather than fabricating midnight) when this
          // step is "continuing" — it never had a committed end time.
          plannedEnd: isoToMinutes(ps.plannedEnd),
          actualStart: isoToMinutes(actual?.actualStart ?? null),
          actualEnd: isoToMinutes(actual?.actualEnd ?? null),
          plannedStartIso: stepWorkStart(ps),
          plannedEndIso: ps.plannedEnd ?? undefined,
          actualStartIso: actual?.actualStart ?? undefined,
          actualEndIso: actual?.actualEnd ?? undefined,
          remarks: actual?.remarks ?? undefined,
          assignedMachineId: ps.assignedMachineId ?? undefined,
          assignedMachineNo: ps.assignedMachineNo || undefined,
          bufferMinutes: ps.bufferMinutes ?? 0,
          planBreaks: planBreaks && planBreaks.length > 0 ? planBreaks : undefined,
          startAnchorIso: resolveActualTimeAnchor(
            'actualStart',
            anchorStep,
            prevPlan
              ? { plannedStart: prevPlan.plannedStart, plannedEnd: prevPlan.plannedEnd, actualEnd: prevActual?.actualEnd }
              : null,
            checklist?.planStartTime,
          ),
          endAnchorIso: resolveActualTimeAnchor('actualEnd', anchorStep, null, checklist?.planStartTime),
        };
      });

      // Machine events (breakdown reporting) only apply to the current step —
      // the one step actively being worked, regardless of track — so the
      // warning only fires when that specific step's assigned machine is down.
      const currentStep = [...steps]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .find((s) => s.actualEnd === undefined);
      const hasBreakdownWarning =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'BREAKDOWN';

      // Same shape as hasBreakdownWarning, but for a self-logged idle session
      // (status IDLE) — unlike breakdown, this actually blocks the current
      // step's time entry (see PileStepsModal), not just an advisory banner.
      const isBlockedByIdle =
        !!currentStep &&
        currentStep.assignedMachineId != null &&
        machineStatusById.get(currentStep.assignedMachineId) === 'IDLE';

      return {
        checklistPileId: cp.id,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        rig: machineMap.get(cp.rigId) ?? cp.rigId,
        crane: machineMap.get(cp.craneId) ?? cp.craneId,
        rigId: cp.rigId,
        craneId: cp.craneId,
        steps,
        hasBreakdownWarning,
        isBlockedByIdle,
      };
    });
  }, [checklistPiles, planSteps, actualSteps, pileMap, machineMap, machineStatusById, checklist?.planStartTime, windowsByMachineId]);

  // ── Cross-pile machine floor ─────────────────────────────────────────────
  // A machine works one pile at a time, but a checklist has many piles — the
  // Log Actuals screen must not let a step's actual start be logged earlier
  // than the same machine's last logged actual_end on a DIFFERENT pile. Built
  // from pileGroups (already whole-checklist, already-joined per step).
  const machineFloorIndex = useMemo(() => buildMachineFloorIndex(pileGroups), [pileGroups]);

  // ── Up-next pile, per machine ────────────────────────────────────────────
  // A pile's own "current step" isn't the same as "this pile's machine is
  // actively on it right now" — a machine works piles one at a time in
  // seq_no order, so several not-yet-finished piles assigned to the same
  // rig can each nominally have an unfinished rig step even though the rig
  // has only reached the first one. The real signal, per machine, is the
  // earliest-seq_no pile that still has an unfinished step assigned to it —
  // pileGroups is already seq_no order, so the first match per machine is
  // that machine's front-of-queue pile.
  const frontPileIdByMachineId = useMemo(() => {
    const machineIds = new Set<string>();
    pileGroups.forEach((g) =>
      g.steps.forEach((s) => {
        if (s.assignedMachineId) machineIds.add(s.assignedMachineId);
      }),
    );

    const map = new Map<string, string>();
    machineIds.forEach((machineId) => {
      const front = pileGroups.find((g) =>
        g.steps.some((s) => s.assignedMachineId === machineId && s.actualEnd === undefined),
      );
      if (front) map.set(machineId, front.checklistPileId);
    });
    return map;
  }, [pileGroups]);

  // ── Machine badges shown at the top — every Rig/Crane used in today's plan ─
  const activeMachines = useMemo((): MachineBadge[] => {
    const byMachineNo = (a: string, b: string) =>
      (machineMap.get(a) ?? a).localeCompare(machineMap.get(b) ?? b);
    const rigIds = Array.from(new Set(checklistPiles.map((cp) => cp.rigId))).sort(byMachineNo);
    const craneIds = Array.from(new Set(checklistPiles.map((cp) => cp.craneId))).sort(byMachineNo);
    return [
      ...rigIds.map((id) => ({ id, machineNo: machineMap.get(id) ?? id, type: 'RIG' as const })),
      ...craneIds.map((id) => ({ id, machineNo: machineMap.get(id) ?? id, type: 'CRANE' as const })),
    ];
  }, [checklistPiles, machineMap]);

  // ── Piles bucketed by machine — every pile has both a rig and a crane, so
  // it naturally appears (unchanged) on both its rig's page and its crane's page ─
  const pileGroupsByMachineId = useMemo(() => {
    const map = new Map<string, PileGroup[]>();
    for (const g of pileGroups) {
      const rigList = map.get(g.rigId);
      if (rigList) rigList.push(g);
      else map.set(g.rigId, [g]);
      const craneList = map.get(g.craneId);
      if (craneList) craneList.push(g);
      else map.set(g.craneId, [g]);
    }
    return map;
  }, [pileGroups]);

  // Precomputed once per real data change (not inline in renderPage, which SwipeableTabBar's
  // PagerView calls for every machine up front) so each page's props stay reference-stable
  // and MachinePilesPage's React.memo can actually skip untouched machine pages.
  const machinePagesById = useMemo(() => {
    const map = new Map<string, { activeGroups: PileGroup[]; upcomingGroups: PileGroup[] }>();
    for (const m of activeMachines) {
      const bucket = pileGroupsByMachineId.get(m.id) ?? EMPTY_PILE_GROUPS;
      const frontId = frontPileIdByMachineId.get(m.id);
      map.set(m.id, {
        activeGroups: bucket.filter((g) => g.checklistPileId === frontId),
        upcomingGroups: bucket.filter((g) => g.checklistPileId !== frontId),
      });
    }
    return map;
  }, [activeMachines, pileGroupsByMachineId, frontPileIdByMachineId]);

  const machineBadgeItems = useMemo((): SwipeableTabItem[] => {
    return activeMachines.map((m) => {
      const meta = m.type === 'RIG' ? colors.machines.rig : colors.machines.crane;
      const Icon = m.type === 'RIG' ? Drill : Forklift;
      return {
        value: m.id,
        label: m.machineNo,
        color: meta.color,
        renderIcon: (color: string, active: boolean) => (
          <Icon size={14} color={active ? color : colors.textSecondary} />
        ),
      };
    });
  }, [activeMachines]);

  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(undefined);

  // ── Modal state ─────────────────────────────────────────────────────────
  const [openCpId, setOpenCpId] = useState<string | null>(null);
  const openGroup = pileGroups.find((g) => g.checklistPileId === openCpId) ?? null;

  // ── Per-machine sequence editing (reorder / add / remove) ────────────────
  // Splices a reordered subset (one machine's piles) back into the full pile
  // order, leaving every other pile's position untouched — same helper the
  // now-deleted EditPlanScreen and the plan-generation wizard both used.
  function mergeOrder(fullOrder: string[], subsetNewOrder: string[]): string[] {
    const subsetIds = new Set(subsetNewOrder);
    let i = 0;
    return fullOrder.map((id) => (subsetIds.has(id) ? subsetNewOrder[i++] : id));
  }

  const rigs = useMemo(() => machines.filter((m) => m.type === 'RIG'), [machines]);
  const cranes = useMemo(() => machines.filter((m) => m.type === 'CRANE'), [machines]);

  const activeMachine = activeMachines.find(
    (m) => m.id === (selectedMachineId ?? activeMachines[0]?.id),
  );

  // Real DB-derived progress (not something the user edits locally) — looked
  // up by pileId so it still applies to piles sitting in the local draft below.
  const pileProgressByPileId = useMemo(() => {
    const map = new Map<string, { hasProgress: boolean; isRunning: boolean }>();
    for (const g of pileGroups) {
      map.set(g.pileId, {
        hasProgress: g.steps.some((s) => s.actualStart != null),
        isRunning: g.steps.some((s) => s.actualStart != null && s.actualEnd == null),
      });
    }
    return map;
  }, [pileGroups]);

  // Local draft for the sequence modal — reorder/add/remove only mutate this;
  // nothing is sent to the server until the modal's Save is tapped.
  const [draftRows, setDraftRows] = useState<EditPlanPileInput[] | null>(null);

  const sequencePiles = useMemo((): ReorderPile[] => {
    if (!activeMachine || !draftRows) return [];
    return draftRows
      .filter((r) => (activeMachine.type === 'RIG' ? r.rigId : r.craneId) === activeMachine.id)
      // A running pile's machine/position can't change until its current
      // step finishes — excluded from the reorderable subset entirely.
      .filter((r) => !pileProgressByPileId.get(r.pileId)?.isRunning)
      .map((r) => ({
        id: r.pileId,
        label: `Pile ${pileMap.get(r.pileId)?.pileIdCode ?? r.pileId}`,
        // Already has progress — the scheduler always places resuming piles
        // ahead of fresh ones regardless of position, so it's pinned rather
        // than offered a reorder control with no effect.
        locked: !!pileProgressByPileId.get(r.pileId)?.hasProgress,
      }));
  }, [activeMachine, draftRows, pileProgressByPileId, pileMap]);

  const [sequenceModalOpen, setSequenceModalOpen] = useState(false);
  const [sequenceRemountKey, setSequenceRemountKey] = useState(0);
  const [addPileModalOpen, setAddPileModalOpen] = useState(false);
  const [isSavingSequence, setIsSavingSequence] = useState(false);

  function openSequenceModal() {
    setDraftRows(checklistPiles.map((cp) => ({ pileId: cp.pileId, rigId: cp.rigId, craneId: cp.craneId })));
    setSequenceModalOpen(true);
  }

  function closeSequenceModal() {
    setSequenceModalOpen(false);
    setDraftRows(null);
  }

  // The only action that actually persists — reorder/add/remove below only
  // touch the local draft, so this sends everything accumulated in one go.
  async function handleReorderConfirm(newSubsetOrder: string[]) {
    if (!checklist || !draftRows) return;
    const fullOrder = draftRows.map((r) => r.pileId);
    const merged = mergeOrder(fullOrder, newSubsetOrder);
    const byPileId = new Map(draftRows.map((r) => [r.pileId, r]));
    const piles: EditPlanPileInput[] = merged.map((pileId) => byPileId.get(pileId)!);

    setIsSavingSequence(true);
    try {
      await editPlanMidDay(siteId, checklist.id, workingDate, piles);
      setDraftRows(null);
    } catch (err) {
      const message =
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Please try again.');
      Alert.alert('Could not save changes', message);
      throw err;
    } finally {
      setIsSavingSequence(false);
    }
  }

  function handleRemovePile(pileId: string) {
    setDraftRows((prev) => (prev ?? []).filter((r) => r.pileId !== pileId));
  }

  function handleAddPileConfirm(input: EditPlanPileInput) {
    setDraftRows((prev) => [...(prev ?? []), input]);
    // Forces ReorderPilesOverlay to remount so it picks up the newly added
    // pile (it only reads its `piles` prop once, on mount).
    setSequenceRemountKey((k) => k + 1);
    setAddPileModalOpen(false);
  }

  // ── Adapt setActualTime for the modal, which calls by stepId only ────────
  // PlanContext expects: setActualTime(checklistPileId, stepId, field, isoTimestamp)
  // We need to wrap it — the open group gives us checklistPileId.
  //
  // The picked value is only a time-of-day (minutes-since-midnight) unless
  // the caller passes explicitDate (the user tapped the picker's header
  // calendar and chose a specific day) — in that case we trust it exactly,
  // no inference. Otherwise we must resolve which calendar day it belongs
  // to ourselves: we anchor on the nearest real ISO timestamp already known
  // for this step sequence (the previous step's actual end for a start
  // time, or this step's own actual start for an end time) and roll forward
  // a day if the picked time-of-day is earlier than the anchor's, so
  // overnight continuations land on the correct date instead of always
  // being forced onto "today".
  const handleSetActualTime = useCallback(
    async (
      stepId: string,
      field: 'actualStart' | 'actualEnd',
      minutesSinceMidnight: number,
      explicitDate?: Date,
    ) => {
      if (!openGroup) return;

      let dt: Date;
      if (explicitDate) {
        dt = explicitDate;
      } else {
        const cpPlanSteps = planSteps
          .filter((s) => s.checklistPileId === openGroup.checklistPileId)
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
        const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === openGroup.checklistPileId);
        const idx = cpPlanSteps.findIndex((s) => s.stepId === stepId);

        const thisPlan = cpPlanSteps[idx];
        const thisActual = cpActualSteps.find((a) => a.stepId === stepId);
        const prevPlan = idx > 0 ? cpPlanSteps[idx - 1] : null;
        const prevActual = prevPlan ? cpActualSteps.find((a) => a.stepId === prevPlan.stepId) : null;

        let anchorIso = resolveActualTimeAnchor(
          field,
          { plannedStart: thisPlan?.plannedStart, plannedEnd: thisPlan?.plannedEnd, actualStart: thisActual?.actualStart },
          prevPlan
            ? { plannedStart: prevPlan.plannedStart, plannedEnd: prevPlan.plannedEnd, actualEnd: prevActual?.actualEnd }
            : null,
          checklist?.planStartTime,
        );

        // Keep the persisted calendar day in sync with what the picker
        // validated against: if this machine has another pile's busy interval
        // overlapping the same-pile anchor, anchor the day-rollover math past
        // it instead — otherwise a long idle gap could resolve to the wrong
        // day here even though the picker's own validation passed. Applies to
        // both start and finish entries — the finish-time picker gets the
        // same machineConflictCheck validation now, so its save path needs
        // the same day-rollover anchor. nextFreeTimeOnOrAfter never returns
        // earlier than its `from` argument, so this is always safe to apply
        // unconditionally (a no-op when nothing conflicts).
        if (thisPlan?.assignedMachineId) {
          const nextFree = nextFreeTimeOnOrAfter(
            machineFloorIndex,
            thisPlan.assignedMachineId,
            stepId,
            new Date(anchorIso),
          );
          anchorIso = toLocalIsoString(nextFree);
        }

        dt = resolveOvernightDate(anchorIso, minutesSinceMidnight);
      }

      await setActualTime(openGroup.checklistPileId, stepId, field, toLocalIsoString(dt));
    },
    [openGroup, planSteps, actualSteps, checklist, machineFloorIndex, setActualTime],
  );

  const handleClearActualTime = useCallback(
    async (stepId: string, field: 'actualStart' | 'actualEnd') => {
      if (!openGroup) return;
      await clearActualTime(openGroup.checklistPileId, stepId, field);
    },
    [openGroup, clearActualTime],
  );

  const handleSaveRemarks = useCallback(
    async (stepId: string, text: string) => {
      if (!openGroup) return;
      await setRemarks(openGroup.checklistPileId, stepId, text);
    },
    [openGroup, setRemarks],
  );

  const handleLogMachineEvent = useCallback(
    async (stepId: string, input: LogMachineEventInput) => {
      if (!openGroup) return;
      await logMachineEvent(openGroup.checklistPileId, stepId, input);
      await Promise.all([reloadMachines(), reloadMachineEvents()]);
    },
    [openGroup, logMachineEvent, reloadMachines, reloadMachineEvents],
  );

  // ── Ending an idle session from its tile (not tied to any open pile modal) ─
  const [idleEndFor, setIdleEndFor] = useState<{
    machineId: string;
    machineNo: string;
    track: 'RIG' | 'CRANE' | 'COMPRESSOR';
    checklistPileId: string;
    stepId: string;
  } | null>(null);

  const handleOpenEndIdle = useCallback(
    (machineId: string, track: 'RIG' | 'CRANE') => {
      const open = openIdleByMachineId.get(machineId);
      const checklistPileId = open ? checklistPileIdByPileId.get(open.pileId) : undefined;
      if (!open || !checklistPileId || !open.stepId) return;
      setIdleEndFor({
        machineId,
        machineNo: machineMap.get(machineId) ?? machineId,
        track,
        checklistPileId,
        stepId: open.stepId,
      });
    },
    [openIdleByMachineId, checklistPileIdByPileId, machineMap],
  );

  const handleLogIdleEnd = useCallback(
    async (input: LogMachineEventInput) => {
      if (!idleEndFor) return;
      await logMachineEvent(idleEndFor.checklistPileId, idleEndFor.stepId, input);
      await Promise.all([reloadMachines(), reloadMachineEvents()]);
      setIdleEndFor(null);
    },
    [idleEndFor, logMachineEvent, reloadMachines, reloadMachineEvents],
  );

  const idleEndHistory = useMemo(
    () => (idleEndFor ? machineEvents.filter((e) => e.machineId === idleEndFor.machineId) : []),
    [machineEvents, idleEndFor],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Log Actuals</Text>
            <View style={{ width: 22 }} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(isLoading || lookupsLoading) && (
            <ActivityIndicator
              size="large"
              color={colors.accent}
              style={{ marginTop: spacing.xxl }}
            />
          )}

          {!isLoading && !lookupsLoading && !checklist && (
            <EmptyState
              icon="calendar"
              title="No plan generated"
              message="No plan has been created for today yet."
            />
          )}

          {!isLoading && !lookupsLoading && checklist && pileGroups.length === 0 && (
            <EmptyState
              icon="layers"
              title="No piles in plan"
              message="Today's plan doesn't include any piles yet."
            />
          )}

          {!isLoading && !lookupsLoading && activeMachines.length > 0 && (
            <SwipeableTabBar
              items={machineBadgeItems}
              value={selectedMachineId ?? activeMachines[0].id}
              onChange={setSelectedMachineId}
              scrollHint="dots"
              pillVariant="piles"
              trailingAccessory={
                <Pressable
                  style={styles.sequenceBtn}
                  onPress={openSequenceModal}
                  hitSlop={spacing.sm}
                >
                  <PencilLine size={16} color={colors.textSecondary} />
                </Pressable>
              }
              renderPage={(item) => {
                const page = machinePagesById.get(item.value) ?? {
                  activeGroups: EMPTY_PILE_GROUPS,
                  upcomingGroups: EMPTY_PILE_GROUPS,
                };
                const machine = activeMachines.find((m) => m.id === item.value);
                return (
                  <MachinePilesPage
                    activeGroups={page.activeGroups}
                    upcomingGroups={page.upcomingGroups}
                    openIdle={idleSessionByMachineId.get(item.value)}
                    onOpenPile={setOpenCpId}
                    onEndIdle={machine ? () => handleOpenEndIdle(machine.id, machine.type) : undefined}
                  />
                );
              }}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      {openGroup && (
        <PileStepsModal
          group={openGroup}
          machines={machines}
          machineFloorIndex={machineFloorIndex}
          onClose={() => setOpenCpId(null)}
          onSetActualTime={handleSetActualTime}
          onClearActualTime={handleClearActualTime}
          onSaveRemarks={handleSaveRemarks}
          onLogMachineEvent={handleLogMachineEvent}
        />
      )}

      {idleEndFor && (
        <MachineEventsModal
          visible
          pileCode={idleEndFor.machineNo}
          stepName="Idle session"
          defaultTrack={idleEndFor.track}
          initialEventType="IDLE_END"
          machines={machines}
          currentMachineIdByTrack={{ [idleEndFor.track]: idleEndFor.machineId }}
          history={idleEndHistory}
          onClose={() => setIdleEndFor(null)}
          onLogMachineEvent={handleLogIdleEnd}
        />
      )}

      {sequenceModalOpen && activeMachine && (
        <ReorderPilesOverlay
          key={sequenceRemountKey}
          visible
          onClose={closeSequenceModal}
          machine={activeMachine}
          piles={sequencePiles}
          onReorder={handleReorderConfirm}
          onRemove={handleRemovePile}
          onAddPile={() => setAddPileModalOpen(true)}
          isUpdating={isSavingSequence}
          confirmLabel="Save Changes"
          subtitleText="Reorder, add, or remove piles, then save"
        />
      )}

      {addPileModalOpen && activeMachine && (
        <AddPileModal
          visible
          onClose={() => setAddPileModalOpen(false)}
          siteId={siteId}
          excludePileIds={new Set((draftRows ?? []).map((r) => r.pileId))}
          lockedMachine={{
            kind: activeMachine.type === 'RIG' ? 'rig' : 'crane',
            machine: machines.find((m) => m.id === activeMachine.id)!,
          }}
          rigs={rigs}
          cranes={cranes}
          isSaving={isSavingSequence}
          onConfirm={handleAddPileConfirm}
        />
      )}
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: { ...typography.h2, color: colors.textPrimary, fontWeight: '700' },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  machinePage: {
    gap: spacing.md,
  },
  idleTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  idleTileTextWrap: { flex: 1 },
  idleTileTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
  },
  idleTileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sequenceBtn: {
    paddingHorizontal: spacing.sm,
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
