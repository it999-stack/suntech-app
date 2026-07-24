// src/screens/Home/PlanDetailScreen.tsx
//
// Read-only view of an existing plan, styled to match the preview step design.
// Shows the plan window, supervisors, machine timeline, and per-pile accordions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Clock, Users, RefreshCw } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import Accordion from '@components/shared/Accordion';
import { colors, spacing, radius, typography } from '@theme/theme';
import { HomeStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { apiClient } from '@services/apiClient';
import {
  getChecklistById,
  getChecklistPiles,
  hydrateChecklistFromServer,
} from '@repositories/checklistRepository';
import { formatTime } from '@utils/formatTime';
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
import { fmtPlanTime as formatPlanTime, planEndTime } from '@/types/plan';
import { formatMinutes, computeWorkingMinutes, computeElapsedMinutes } from '@components/plan/generate/preview/previewUtils';
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
  const [supervisors, setSupervisors] = useState<PilingSitePersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);
  const [checklistPiles, setChecklistPiles] = useState<PilingChecklistPile[]>([]);
  const [rigs, setRigs] = useState<PilingMachine[]>([]);
  const [cranes, setCranes] = useState<PilingMachine[]>([]);

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

    // Load supervisors
    const supervisorIds: string[] = [];
    if (cl?.supervisorId) supervisorIds.push(cl.supervisorId);
    if (cl?.supervisorId2) supervisorIds.push(cl.supervisorId2);
    const supervisorList = supervisorIds.length > 0 ? await getPersonnelByIds(supervisorIds) : [];

    // Load shifts
    const shiftsList = await getAllShiftTypes();

    setChecklist(cl ?? null);
    setPlanSteps(steps);
    setActualSteps(actuals);
    setSupervisors(supervisorList);
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
  const workingMinutes = useMemo(() => computeWorkingMinutes(planSteps), [planSteps]);
  const elapsedMinutes = useMemo(() => computeElapsedMinutes(planSteps), [planSteps]);
  const progressPct = elapsedMinutes > 0
    ? Math.min(100, Math.round((workingMinutes / elapsedMinutes) * 100))
    : 0;

  // Supervisor display data
  const supervisor1 = supervisors.find((s) => checklist && s.id === checklist.supervisorId);
  const supervisor2 = supervisors.find((s) => checklist && s.id === checklist.supervisorId2);
  
  const shift1 = shifts[0];
  const shift2 = shifts[1];
  const shift1Name = shift1?.name ?? 'Shift 1';
  const shift2Name = shift2?.name ?? 'Shift 2';

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

  // Pile label map for timeline
  const pileLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    detailPiles.forEach((p) => {
      map[p.checklistPileId] = `Pile ${p.code}`;
    });
    return map;
  }, [detailPiles]);

  // Steps sorted by sequence
  const sortedSteps = useMemo(() => {
    return [...planSteps].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
  }, [planSteps]);

  // Supervisor summary
  const supervisorSummary = [supervisor1?.name, supervisor2?.name]
    .filter(Boolean)
    .join(' · ') || 'None assigned';

  // Selected step count
  const selectedStepsCount = sortedSteps.length;

  // "Last synced" reflects pilingDailyChecklists.updatedAt, which is only
  // ever stamped by hydrateChecklistFromServer — i.e. the last time this
  // screen's data was confirmed from the server, not just touched locally.
  const lastSyncedLabel = checklist?.updatedAt
    ? formatTime(new Date(checklist.updatedAt).toISOString())
    : null;

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
            <View style={styles.flexShrink}>
              <Text style={styles.pageTitle}>Plan Detail</Text>
              {checklist?.date && (
                <Text style={styles.dateText}>
                  {new Date(checklist.date).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              )}
            </View>
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
          {(refreshError || lastSyncedLabel) && (
            <Text style={[styles.syncText, refreshError && styles.syncTextError]}>
              {refreshError ?? `Last synced at ${lastSyncedLabel}`}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── Main card ─────────────────────────────────────────────────────── */}
          <GlassCard innerStyle={styles.mainPad}>
            <View style={styles.mainHeaderRow}>
              <Clock size={16} color={colors.accent} />
              <Text style={styles.mainLabel}>Plan Window</Text>
            </View>
            <Text style={styles.mainWindowValue}>
              {checklist?.planStartTime ? formatPlanTime(checklist.planStartTime) : '—'} → {endIso ? formatPlanTime(endIso) : '—'}
            </Text>

            <View style={styles.statGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Working time</Text>
                <Text style={styles.statValue}>{formatMinutes(workingMinutes)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Elapsed (incl. breaks)</Text>
                <Text style={styles.statValue}>{formatMinutes(elapsedMinutes)}</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>

            <View style={styles.mainFooterRow}>
              <View>
                <Text style={styles.footerLabel}>Piles in plan</Text>
                <Text style={styles.footerValue}>{detailPiles.length}</Text>
              </View>
              <View style={styles.footerRight}>
                <Text style={styles.footerLabel}>Total steps</Text>
                <Text style={styles.footerValue}>{selectedStepsCount}</Text>
              </View>
            </View>
          </GlassCard>

          {/* ── Supervisors accordion ───────────────────────────────────────── */}
          <Accordion
            defaultOpen
            header={
              <View style={styles.headerRow}>
                <Users size={18} color={colors.accent} />
                <View style={styles.headerInfo}>
                  <Text style={styles.headerTitle}>Supervisors</Text>
                  <Text style={styles.headerSummary}>{supervisorSummary}</Text>
                </View>
              </View>
            }
          >
            <SupervisorCard
              shiftLabel={shift1Name}
              name={supervisor1?.name ?? null}
              designation={supervisor1?.designation ?? null}
              tone="day"
            />
            <SupervisorCard
              shiftLabel={shift2Name}
              name={supervisor2?.name ?? null}
              designation={supervisor2?.designation ?? null}
              tone="night"
            />
          </Accordion>

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

// ─── Supervisor card ────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function SupervisorCard({
  shiftLabel,
  name,
  designation,
  tone,
}: {
  shiftLabel: string;
  name: string | null;
  designation: string | null;
  tone: 'day' | 'night';
}) {
  const assigned = !!name;
  return (
    <View style={[styles.supCard, tone === 'night' && styles.supCardNight]}>
      <View style={[styles.supAvatar, !assigned && styles.supAvatarEmpty]}>
        <Text style={styles.supAvatarText}>{assigned ? initials(name!) : '—'}</Text>
      </View>
      <View style={styles.supInfo}>
        <Text style={styles.supShiftLabel}>{shiftLabel}</Text>
        <Text style={[styles.supName, !assigned && styles.supNameEmpty]}>
          {assigned ? name : 'None assigned'}
        </Text>
        {assigned && designation ? (
          <Text style={styles.supDesignation}>{designation}</Text>
        ) : null}
      </View>
      <View style={[styles.supBadge, tone === 'night' ? styles.supBadgeNight : styles.supBadgeDay]}>
        <Text style={[styles.supBadgeText, tone === 'night' ? styles.supBadgeTextNight : styles.supBadgeTextDay]}>
          {tone === 'day' ? 'Day' : 'Night'}
        </Text>
      </View>
    </View>
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
  flexShrink: { flexShrink: 1 },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  syncTextError: {
    color: colors.danger,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  // Main card
  mainPad: { padding: spacing.lg },
  mainHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  mainLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mainWindowValue: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.glassFill,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  mainFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    paddingTop: spacing.md,
  },
  footerRight: { alignItems: 'flex-end' },
  footerLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerValue: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    marginTop: 2,
  },

  // Supervisors
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerInfo: { flex: 1 },
  headerTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  headerSummary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  supCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(249,115,22,0.05)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.15)',
  },
  supCardNight: {
    backgroundColor: 'rgba(79,70,229,0.05)',
    borderColor: 'rgba(79,70,229,0.15)',
  },
  supAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supAvatarEmpty: { backgroundColor: 'rgba(28,28,46,0.12)' },
  supAvatarText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
  supInfo: { flex: 1 },
  supShiftLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontSize: 10,
  },
  supName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 1,
  },
  supNameEmpty: { color: colors.textSecondary, fontStyle: 'italic', fontWeight: '400' },
  supDesignation: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  supBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  supBadgeDay: { backgroundColor: 'rgba(249,115,22,0.15)' },
  supBadgeNight: { backgroundColor: 'rgba(79,70,229,0.15)' },
  supBadgeText: { ...typography.caption, fontWeight: '700', fontSize: 10 },
  supBadgeTextDay: { color: '#c2410c' },
  supBadgeTextNight: { color: '#4338ca' },
});

