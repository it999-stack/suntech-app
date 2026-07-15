// src/screens/Home/PlanDetailScreen.tsx
//
// Read-only view of an existing plan, styled to match the preview step design.
// Shows the plan window, supervisors, machine timeline, and per-pile accordions.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Clock, Users } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import Accordion from '@components/shared/Accordion';
import { colors, spacing, radius, typography } from '@theme/theme';
import { HomeStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { getChecklistById, getChecklistPiles } from '@repositories/checklistRepository';
import { getPlanStepsForChecklist, type PlanStepWithMeta } from '@repositories/planRepository';
import { getPilesBySiteWithDimensions } from '@repositories/pilesRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelByIds } from '@repositories/personnelRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import type { PilingDailyChecklist, PilingPersonnel, PilingShiftType } from '@db/schema';
import PileAccordion from '@components/plan/generate/preview/PileAccordion';
import MachineTimelineAccordion from '@components/plan/generate/preview/MachineTimelineAccordion';
import { fmtPlanTime as formatPlanTime, planEndTime } from '@/types/plan';
import { formatMinutes, computeWorkingMinutes, computeElapsedMinutes } from '@components/plan/generate/preview/previewUtils';
import { type MachineInfo } from '@/types/timeline';

type PlanDetailRouteProp = RouteProp<HomeStackParamList, 'PlanDetail'>;

// ─── Types ─────────────────────────────────────────────────────────────────

interface DetailPile {
  id: string;
  code: string;
  dia: number;
  depth: number;
  rigMachineNo: string;
  craneMachineNo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlanDetailScreen() {
  const route = useRoute<PlanDetailRouteProp>();
  const { checklistId } = route.params;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<PilingDailyChecklist | null>(null);
  const [planSteps, setPlanSteps] = useState<PlanStepWithMeta[]>([]);
  const [detailPiles, setDetailPiles] = useState<DetailPile[]>([]);
  const [supervisors, setSupervisors] = useState<PilingPersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);

  useEffect(() => {
    if (!checklistId || !user?.siteId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Load checklist data
        const cl = await getChecklistById(checklistId);
        
        // Load checklist piles
        const cpList = await getChecklistPiles(checklistId);
        
        // Load all piles with dimensions
        const allPiles = await getPilesBySiteWithDimensions(user.siteId!);
        
        // Build a map for quick pile lookup
        const pileMap = new Map(allPiles.map((p) => [p.id, p]));
        
        // Load plan steps
        const steps = await getPlanStepsForChecklist(checklistId);
        
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
        
        if (!cancelled) {
          setChecklist(cl ?? null);
          setPlanSteps(steps);
          setSupervisors(supervisorList);
          setShifts(shiftsList);
          
          // Build detail piles
          const builtPiles: DetailPile[] = cpList.map((cp) => {
            const pile = pileMap.get(cp.pileId);
            const rigNo = rigs.find((m) => m.id === cp.rigId)?.machineNo ?? '—';
            const craneNo = cranes.find((m) => m.id === cp.craneId)?.machineNo ?? '—';
            return {
              id: cp.pileId,
              code: pile?.pileIdCode ?? cp.pileId,
              dia: pile?.dia ?? 0,
              depth: pile?.depth ?? 0,
              rigMachineNo: rigNo,
              craneMachineNo: craneNo,
            };
          });
          setDetailPiles(builtPiles);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [checklistId, user?.siteId]);

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

  // Machine info for timeline
  const machineInfos = useMemo<MachineInfo[]>(() => {
    const seenRigs = new Set<string>();
    const seenCranes = new Set<string>();
    
    const result: MachineInfo[] = [];
    
    detailPiles.forEach((p) => {
      if (p.rigMachineNo !== '—' && !seenRigs.has(p.rigMachineNo)) {
        seenRigs.add(p.rigMachineNo);
        result.push({ id: p.rigMachineNo, machineNo: p.rigMachineNo, type: 'RIG' });
      }
      if (p.craneMachineNo !== '—' && !seenCranes.has(p.craneMachineNo)) {
        seenCranes.add(p.craneMachineNo);
        result.push({ id: p.craneMachineNo, machineNo: p.craneMachineNo, type: 'CRANE' });
      }
    });
    
    return result;
  }, [detailPiles]);

  // Pile label map for timeline
  const pileLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    planSteps.forEach((s) => {
      if (s.checklistPileId) {
        const pile = detailPiles.find((p) => p.id === s.checklistPileId.replace('cp_', ''));
        map[s.checklistPileId] = pile ? `Pile ${pile.code}` : 'Unknown pile';
      }
    });
    return map;
  }, [planSteps, detailPiles]);

  // Group plan steps by checklistPileId for PileAccordion
  const stepsByPileId = useMemo(() => {
    const map: Record<string, PlanStepWithMeta[]> = {};
    planSteps.forEach((s) => {
      const key = s.checklistPileId ?? 'unknown';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [planSteps]);

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

          {/* ── Per-pile accordions ──────────────────────────────────────────── */}
          {detailPiles.map((pile) => (
            <PileAccordion
              key={pile.id}
              pile={pile as any}
              steps={stepsByPileId[pile.id] || []}
            />
          ))}

          {detailPiles.length === 0 && (
            <Text style={styles.emptyText}>No piles in this plan.</Text>
          )}
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
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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

  // Empty state
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

