// src/screens/Home/PlanDetailScreen.tsx
//
// Read-only view of an existing plan, styled to match the preview step design.
// Shows the plan window, core team, machine timeline, and per-pile accordions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RefreshCw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Button from '@components/shared/Button';
import { colors, spacing, typography } from '@theme/theme';
import { HomeStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { apiClient } from '@services/apiClient';
import {
  getChecklistById,
  getChecklistPiles,
  getChecklistPersonnel,
  hydrateChecklistFromServer,
} from '@repositories/checklistRepository';
import {
  getPlanStepsForChecklist,
  getActualStepsForChecklist,
  type PlanStepWithMeta,
  type ActualStepWithMeta,
} from '@repositories/planRepository';
import { getPilesBySiteWithDimensions } from '@repositories/pilesRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelByIds } from '@repositories/personnelRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getSteps } from '@repositories/stepsRepository';
import type { PilingDailyChecklist, PilingSitePersonnel, PilingShiftType, PilingChecklistPile, PilingMachine, PilingStep } from '@db/schema';
import { useNonWorkingWindows } from './fillActual/useNonWorkingWindows';
import PilesCard from '@components/plan/generate/preview/PilesCard';
import MachineTimelineCard from '@components/plan/generate/preview/MachineTimelineCard';
import CoreTeamCard from '@/components/plan/generate/preview/CoreTeamCard';
import PlanWindowBar from '@components/plan/generate/preview/PlanWindowBar';
import { fmtPlanTime as formatPlanTime, planEndTime } from '@/types/plan';
import { type MachineInfo } from '@/types/timeline';
import type { PreviewPile } from '@app-types/previewTypes';

type PlanDetailRouteProp = RouteProp<HomeStackParamList, 'PlanDetail'>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlanDetailScreen() {
  const route = useRoute<PlanDetailRouteProp>();
  const { checklistId } = route.params;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<PilingDailyChecklist | null>(null);
  const [planSteps, setPlanSteps] = useState<PlanStepWithMeta[]>([]);
  const [allSteps, setAllSteps] = useState<PilingStep[]>([]);
  const [actualSteps, setActualSteps] = useState<ActualStepWithMeta[]>([]);
  const [detailPiles, setDetailPiles] = useState<PreviewPile[]>([]);
  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);
  const [checklistPiles, setChecklistPiles] = useState<PilingChecklistPile[]>([]);
  const [rigs, setRigs] = useState<PilingMachine[]>([]);
  const [cranes, setCranes] = useState<PilingMachine[]>([]);
  const [checklistPersonnel, setChecklistPersonnelRows] = useState<
    Awaited<ReturnType<typeof getChecklistPersonnel>>
  >([]);

  // Reads whatever is currently cached in local SQLite — used both on mount
  // and after a refresh has pulled fresh data down from the server. Plans
  // are server-owned (see plan_generation_service.py), so this screen never
  // writes to the checklist itself, only reflects what's been synced.
  const loadLocalData = useCallback(async (): Promise<void> => {
    if (!checklistId || !user?.siteId) return;
    const siteId = user.siteId;

    // Two stages, committed separately: the plan's shape first (piles,
    // machines, team), so the Timeline and Piles cards paint their real
    // layout dimmed under the loading overlay — same as the wizard's Preview
    // step, which knows its piles/machines before its schedule — then the
    // schedule itself fills them in.
    const [cl, cpList, allPiles, rigs, cranes, personnelRows, shiftsList, stepCatalog] = await Promise.all([
      getChecklistById(checklistId),
      getChecklistPiles(checklistId),
      getPilesBySiteWithDimensions(siteId),
      getMachinesByType(siteId, 'RIG'),
      getMachinesByType(siteId, 'CRANE'),
      getChecklistPersonnel(checklistId),
      getAllShiftTypes(),
      getSteps(),
    ]);

    const pileMap = new Map(allPiles.map((p) => [p.id, p]));
    const personnelIds = [...new Set(personnelRows.map((r) => r.personnelId))];
    const personnelList = personnelIds.length > 0 ? await getPersonnelByIds(personnelIds) : [];

    setChecklist(cl ?? null);
    setAllSteps(stepCatalog);
    setPersonnel(personnelList);
    setChecklistPersonnelRows(personnelRows);
    setShifts(shiftsList);
    setChecklistPiles(cpList);
    setRigs(rigs);
    setCranes(cranes);

    // Build detail piles
    const builtPiles: PreviewPile[] = cpList.map((cp) => {
      const pile = pileMap.get(cp.pileId);
      const rigNo = rigs.find((m) => m.id === cp.rigId)?.machineNo ?? '—';
      // Undefined (not '—') when no crane is assigned at all — a genuinely
      // rig-only pile — so TrackChoiceTiles hides the Crane tile for it.
      const craneNo = cp.craneId ? (cranes.find((m) => m.id === cp.craneId)?.machineNo ?? '—') : undefined;
      return {
        id: cp.pileId,
        checklistPileId: cp.id,
        code: pile?.pileIdCode ?? cp.pileId,
        dia: pile?.dia ?? 0,
        depth: pile?.depth ?? 0,
        rigMachineNo: rigNo,
        craneMachineNo: craneNo,
        rigId: cp.rigId,
        craneId: cp.craneId ?? undefined,
      };
    });
    setDetailPiles(builtPiles);

    const [steps, actuals] = await Promise.all([
      getPlanStepsForChecklist(checklistId),
      getActualStepsForChecklist(checklistId),
    ]);
    setPlanSteps(steps);
    setActualSteps(actuals);
  }, [checklistId, user?.siteId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLocalData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadLocalData]);
  // Pulls this checklist's latest server state into local SQLite, then
  // re-reads local state — this is the only way to get fresh data while
  // viewing a plan, since generation itself requires connectivity and this
  // screen is otherwise a pure offline read of the local cache.
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!checklistId) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { data } = await apiClient.get(`/piling/checklists/${checklistId}`);
      await hydrateChecklistFromServer(data);
      await loadLocalData();
    } catch {
      setRefreshError('Could not refresh — check your connection.');
    } finally {
      setRefreshing(false);
    }
  }, [checklistId, loadLocalData]);

  // Compute derived values
  const endIso = checklist?.planStartTime ? planEndTime(checklist.planStartTime) : '';

  // ── Leadership detail (Project Manager / Planning Engineer) ─────────────
  const leadershipDetail = useMemo(() => {
    const pmId = checklistPersonnel.find((r) => r.role === 'PROJECT_MANAGER')?.personnelId;
    const peId = checklistPersonnel.find((r) => r.role === 'PLANNING_ENGINEER')?.personnelId;
    const pm = personnel.find((p) => p.id === pmId);
    const pe = personnel.find((p) => p.id === peId);
    return {
      pmName: pm?.name ?? null,
      pmDesignation: pm?.designation ?? null,
      peName: pe?.name ?? null,
      peDesignation: pe?.designation ?? null,
    };
  }, [checklistPersonnel, personnel]);

  // ── Shift incharge detail ────────────────────────────────────────────────
  const shift1 = shifts[0];
  const shift2 = shifts[1];
  const shiftInchargeDetail = useMemo(() => {
    const s1 = shift1 ? `${shift1.name} (${shift1.startTime}–${shift1.endTime})` : 'Shift 1';
    const s2 = shift2 ? `${shift2.name} (${shift2.startTime}–${shift2.endTime})` : 'Shift 2';
    const si1Id = checklistPersonnel.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 1)?.personnelId;
    const si2Id = checklistPersonnel.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 2)?.personnelId;
    const si1 = personnel.find((p) => p.id === si1Id);
    const si2 = personnel.find((p) => p.id === si2Id);
    return {
      shift1Label: s1,
      shift1Name: si1?.name ?? null,
      shift1Designation: si1?.designation ?? null,
      shift2Label: s2,
      shift2Name: si2?.name ?? null,
      shift2Designation: si2?.designation ?? null,
    };
  }, [shift1, shift2, checklistPersonnel, personnel]);

  // Machine info for timeline — id must be the real machine UUID (matching
  // plan_steps.assignedMachineId), not the display machineNo, or
  // MachineTimelineCard can never match a machine to its stops.
  const machineInfos = useMemo<MachineInfo[]>(() => {
    const usedRigIds = new Set(checklistPiles.map((cp) => cp.rigId).filter(Boolean));
    const usedCraneIds = new Set(checklistPiles.map((cp) => cp.craneId).filter(Boolean));
    return [
      ...rigs.filter((r) => usedRigIds.has(r.id)).map((r) => ({ id: r.id, machineNo: r.machineNo, type: 'RIG' as const })),
      ...cranes.filter((c) => usedCraneIds.has(c.id)).map((c) => ({ id: c.id, machineNo: c.machineNo, type: 'CRANE' as const })),
    ];
  }, [checklistPiles, rigs, cranes]);

  // ── Machine teams detail (Engineer / Supervisor / Operator per machine, per shift) ──
  const machineTeams = useMemo(() => {
    const idFor = (role: string, machineId: string, slot: 1 | 2) =>
      checklistPersonnel.find((r) => r.role === role && r.machineId === machineId && r.shiftSlot === slot)?.personnelId;
    const nameFor = (role: string, machineId: string, slot: 1 | 2) =>
      personnel.find((p) => p.id === idFor(role, machineId, slot))?.name ?? null;
    return machineInfos.map((m) => ({
      id: m.id,
      machineNo: m.machineNo,
      type: m.type,
      engineerName1: nameFor('ENGINEER', m.id, 1),
      engineerName2: nameFor('ENGINEER', m.id, 2),
      supervisorName1: nameFor('SUPERVISOR', m.id, 1),
      supervisorName2: nameFor('SUPERVISOR', m.id, 2),
      operatorName1: nameFor('MACHINE_OPERATOR', m.id, 1),
      operatorName2: nameFor('MACHINE_OPERATOR', m.id, 2),
    }));
  }, [machineInfos, checklistPersonnel, personnel]);

  // Pile label map for timeline
  const pileLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    detailPiles.forEach((p) => {
      map[p.checklistPileId] = `Pile ${p.code}`;
    });
    return map;
  }, [detailPiles]);

  /**
   * Which steps this plan covers, as PilesCard's `selectedStepIds`. The wizard
   * reads this straight off the draft, but a saved checklist has nowhere to
   * put it — pil_daily_checklists stores no step selection — so it's recovered
   * as the union of every step actually scheduled anywhere in the plan.
   *
   * The consequence: a step is shown on a pile that lacks it only if some
   * OTHER pile got it scheduled. A step selected for the plan but scheduled on
   * no pile at all can't be recovered and stays hidden — nothing persisted
   * records that it was ever chosen.
   */
  const selectedStepIds = useMemo(
    () => [...new Set(planSteps.map((s) => s.stepId))],
    [planSteps],
  );

  const { windowsByMachineId } = useNonWorkingWindows({ checklist, planSteps });

  // This screen renders its full layout immediately, even before the initial
  // load finishes — the Machine Timeline and Piles cards show their own
  // in-body BusyOverlay spinner (isRecomputing={loading}) instead of
  // blocking the whole screen behind one spinner. Keeps the header (and the
  // refresh button) interactive the instant the screen opens.
  return (
    <LinearGradient colors={colors.backdropGradient} style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Text style={styles.pageTitle}>Plan Detail</Text>
            <Button
              icon={RefreshCw}
              variant="secondary"
              size="md"
              iconColor={colors.accent}
              loading={refreshing}
              disabled={refreshing}
              hitSlop={10}
              accessibilityLabel="Refresh from server"
              onPress={handleRefresh}
              style={styles.refreshBtn}
            />
          </View>
          {refreshError && <Text style={styles.syncTextError}>{refreshError}</Text>}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── Main card ─────────────────────────────────────────────────────── */}
          <PlanWindowBar
            startLabel={checklist?.planStartTime ? formatPlanTime(checklist.planStartTime) : '—'}
            endLabel={endIso ? formatPlanTime(endIso) : '—'}
            show
          />

          {/* ── Core Team (Leadership / Shift Incharge / Machine Teams) ──────── */}
          <CoreTeamCard
            leadership={leadershipDetail}
            shiftIncharge={shiftInchargeDetail}
            machineTeams={machineTeams}
          />

          {/* ── Visual timeline ─────────────────────────────────────────────── */}
          {(loading || (checklist?.planStartTime && endIso && planSteps.length > 0)) && (
            <MachineTimelineCard
              windowStart={checklist?.planStartTime ? new Date(checklist.planStartTime) : new Date()}
              windowEnd={endIso ? new Date(endIso) : new Date()}
              steps={planSteps}
              activeRigs={machineInfos.filter((m) => m.type === 'RIG')}
              activeCranes={machineInfos.filter((m) => m.type === 'CRANE')}
              pileLabelById={pileLabelById}
              isRecomputing={loading || refreshing}
            />
          )}

          {/* ── Piles (swipeable pill selector) ─────────────────────────────── */}
          <PilesCard
            piles={detailPiles}
            planSteps={planSteps}
            actualSteps={actualSteps}
            allSteps={allSteps}
            selectedStepIds={selectedStepIds}
            windowsByMachineId={windowsByMachineId}
            isRecomputing={loading || refreshing}
          />
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  refreshBtn: {
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderWidth: 0,
  },
  syncTextError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
});
