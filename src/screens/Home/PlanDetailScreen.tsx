// src/screens/Home/PlanDetailScreen.tsx
//
// Read-only view of an existing plan, styled to match the preview step design.
// Shows the plan window, core team, machine timeline, and per-pile accordions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RefreshCw } from 'lucide-react-native';
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
import type { PilingDailyChecklist, PilingSitePersonnel, PilingShiftType, PilingChecklistPile, PilingMachine } from '@db/schema';
import PilesAccordion from '@components/plan/generate/preview/PilesAccordion';
import MachineTimelineAccordion from '@components/plan/generate/preview/MachineTimelineAccordion';
import CoreTeamAccordion from '@components/plan/generate/preview/CoreTeamAccordion';
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

    // Load checklist data
    const cl = await getChecklistById(checklistId);

    // Load checklist piles
    const cpList = await getChecklistPiles(checklistId);

    // Load all piles with dimensions
    const allPiles = await getPilesBySiteWithDimensions(user.siteId!);

    // Build a map for quick pile lookup
    const pileMap = new Map(allPiles.map((p) => [p.id, p]));

    // Load plan steps + recorded actuals
    const steps = await getPlanStepsForChecklist(checklistId);
    const actuals = await getActualStepsForChecklist(checklistId);

    // Load machines
    const rigs = await getMachinesByType(user.siteId!, 'RIG');
    const cranes = await getMachinesByType(user.siteId!, 'CRANE');

    // Load every checklist-personnel role assignment (Leadership, Shift
    // Incharge, and per-machine Engineer/Supervisor/Operator), resolving
    // every referenced person in one batch for the merged Core Team card.
    const personnelRows = cl ? await getChecklistPersonnel(cl.id) : [];
    const personnelIds = [...new Set(personnelRows.map((r) => r.personnelId))];
    const personnelList = personnelIds.length > 0 ? await getPersonnelByIds(personnelIds) : [];

    // Load shifts
    const shiftsList = await getAllShiftTypes();

    setChecklist(cl ?? null);
    setPlanSteps(steps);
    setActualSteps(actuals);
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
      const craneNo = cranes.find((m) => m.id === cp.craneId)?.machineNo ?? '—';
      return {
        id: cp.pileId,
        checklistPileId: cp.id,
        code: pile?.pileIdCode ?? cp.pileId,
        dia: pile?.dia ?? 0,
        depth: pile?.depth ?? 0,
        rigMachineNo: rigNo,
        craneMachineNo: craneNo,
        rigId: cp.rigId,
        craneId: cp.craneId,
      };
    });
    setDetailPiles(builtPiles);
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
  // MachineTimelineAccordion can never match a machine to its stops.
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

  if (loading) {
    return (
      <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
        <SafeAreaView style={[styles.flex, styles.center]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading plan details…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Text style={styles.pageTitle}>Plan Detail</Text>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing}
              hitSlop={10}
              style={styles.refreshBtn}
              accessibilityLabel="Refresh from server"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <RefreshCw size={16} color={colors.accent} />
              )}
            </Pressable>
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
          <CoreTeamAccordion
            leadership={leadershipDetail}
            shiftIncharge={shiftInchargeDetail}
            machineTeams={machineTeams}
            defaultOpen
          />

          {/* ── Visual timeline ─────────────────────────────────────────────── */}
          {checklist?.planStartTime && endIso && planSteps.length > 0 && (
            <MachineTimelineAccordion
              windowStart={new Date(checklist.planStartTime)}
              windowEnd={new Date(endIso)}
              steps={planSteps}
              activeRigs={machineInfos.filter((m) => m.type === 'RIG')}
              activeCranes={machineInfos.filter((m) => m.type === 'CRANE')}
              pileLabelById={pileLabelById}
            />
          )}

          {/* ── Piles (swipeable pill selector) ─────────────────────────────── */}
          <PilesAccordion piles={detailPiles} planSteps={planSteps} actualSteps={actualSteps} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },

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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
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
