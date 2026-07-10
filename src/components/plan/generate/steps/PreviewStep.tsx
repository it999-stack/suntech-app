// src/components/plan/generate/steps/PreviewStep.tsx
//
// Step 7 — read-only summary of the full generated plan.
// Orchestrates smaller components: main card, timeline bar, summary accordions,
// and per-pile accordions.

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock, Truck, Users, ListChecks, AlertTriangle } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { fmtPlanTime, planEndTime } from '@/types/plan';
import type { PlanDraft } from '@/types/plan';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { PreviewPile } from '../preview/previewTypes';
import { formatMinutes, computeWorkingMinutes, computeElapsedMinutes } from '../preview/previewUtils';
import SummaryAccordion from '../preview/SummaryAccordion';
import PlanTimelineBar from '../preview/PlanTimelineBar';
import PileAccordion from '../preview/PileAccordion';

// Re-export for consumers
export type { PreviewPile } from '../preview/previewTypes';

// ─── Simple data types for accordion details ──────────────────────────────────

export interface MachineDetail {
  id: string;
  machineNo: string;
  type: 'RIG' | 'CRANE';
  description?: string | null;
}

export interface PersonnelDetail {
  id: string;
  name: string;
  designation: string;
}

export interface ShiftDetail {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface StepDetail {
  id: string;
  stepName: string;
  track: string;
  sequenceOrder: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewStepProps {
  draft: PlanDraft;
  planSteps: PlanStepWithMeta[];
  piles: PreviewPile[];
  supervisor1Name: string | null;
  supervisor2Name: string | null;
  activeRigCount: number;
  activeCraneCount: number;
  totalStepsCount: number;
  warningPileCodes?: string[];
  onNavigateToStep: (step: Step) => void;
  /** Detailed data for the Machines accordion body. */
  activeRigs?: MachineDetail[];
  activeCranes?: MachineDetail[];
  /** Detailed data for the Supervisors accordion body. */
  personnel?: PersonnelDetail[];
  shifts?: ShiftDetail[];
  /** Detailed data for the Steps accordion body. */
  selectedSteps?: StepDetail[];
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function PreviewStep({
  draft,
  planSteps,
  piles,
  supervisor1Name,
  supervisor2Name,
  activeRigCount,
  activeCraneCount,
  totalStepsCount,
  warningPileCodes = [],
  onNavigateToStep,
  activeRigs = [],
  activeCranes = [],
  personnel = [],
  shifts = [],
  selectedSteps = [],
}: PreviewStepProps) {
  const endIso = planEndTime(draft.planStartTime);

  const workingMinutes = useMemo(() => computeWorkingMinutes(planSteps), [planSteps]);
  const elapsedMinutes = useMemo(() => computeElapsedMinutes(planSteps), [planSteps]);
  const progressPct = elapsedMinutes > 0
    ? Math.min(100, Math.round((workingMinutes / elapsedMinutes) * 100))
    : 0;

  const selectedStepsCount = draft.selectedStepIds.length;
  const supervisorSummary = [supervisor1Name, supervisor2Name]
    .filter(Boolean)
    .join(' · ') || 'None assigned';

  // ── Machines detail ──────────────────────────────────────────────────────
  const machinesDetail = useMemo(() => {
    const rigLines = activeRigs.map((r) => `• ${r.machineNo}${r.description ? ` — ${r.description}` : ''}`);
    const craneLines = activeCranes.map((c) => `• ${c.machineNo}${c.description ? ` — ${c.description}` : ''}`);
    return { rigLines, craneLines };
  }, [activeRigs, activeCranes]);

  // ── Supervisors detail ───────────────────────────────────────────────────
  const supervisorDetail = useMemo(() => {
    const shift1 = shifts[0];
    const shift2 = shifts[1];
    const s1 = shift1 ? `${shift1.name} (${shift1.startTime}–${shift1.endTime})` : 'Shift 1';
    const s2 = shift2 ? `${shift2.name} (${shift2.startTime}–${shift2.endTime})` : 'Shift 2';
    const sup1 = personnel.find((p) => p.id === draft.supervisorId);
    const sup2 = personnel.find((p) => p.id === draft.supervisorId2);
    return {
      shift1Label: s1,
      shift1Name: sup1?.name ?? null,
      shift1Designation: sup1?.designation ?? null,
      shift2Label: s2,
      shift2Name: sup2?.name ?? null,
      shift2Designation: sup2?.designation ?? null,
    };
  }, [shifts, personnel, draft.supervisorId, draft.supervisorId2]);

  return (
    <>
      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <GlassCard innerStyle={styles.mainPad}>
        <View style={styles.mainHeaderRow}>
          <Clock size={16} color={colors.accent} />
          <Text style={styles.mainLabel}>Plan Window</Text>
        </View>
        <Text style={styles.mainWindowValue}>
          {fmtPlanTime(draft.planStartTime)} → {fmtPlanTime(endIso)}
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
            <Text style={styles.footerValue}>{piles.length}</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.footerLabel}>Total steps</Text>
            <Text style={styles.footerValue}>{selectedStepsCount}</Text>
          </View>
        </View>
      </GlassCard>

      {/* ── Visual timeline ─────────────────────────────────────────────── */}
      <PlanTimelineBar
        windowStart={new Date(draft.planStartTime)}
        windowEnd={new Date(endIso)}
        steps={planSteps}
        activeRigs={activeRigs}
        activeCranes={activeCranes}
      />

      {/* ── Machines accordion ──────────────────────────────────────────── */}
      <SummaryAccordion
        icon={<Truck size={18} color={colors.accent} />}
        title="Machines"
        summary={`${activeRigCount} rig${activeRigCount === 1 ? '' : 's'} · ${activeCraneCount} crane${activeCraneCount === 1 ? '' : 's'} active`}
        onEdit={() => onNavigateToStep('machines')}
      >
        {activeRigs.length > 0 && (
          <View style={styles.machineGroup}>
            <Text style={styles.detailSectionTitle}>Rigs</Text>
            <View style={styles.chipWrap}>
              {activeRigs.map((r) => (
                <View key={r.id} style={[styles.machineChip, styles.machineChipRig]}>
                  <View style={[styles.machineChipDot, styles.dotRig]} />
                  <Text style={styles.machineChipText}>{r.machineNo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {activeCranes.length > 0 && (
          <View style={styles.machineGroup}>
            <Text style={styles.detailSectionTitle}>Cranes</Text>
            <View style={styles.chipWrap}>
              {activeCranes.map((c) => (
                <View key={c.id} style={[styles.machineChip, styles.machineChipCrane]}>
                  <View style={[styles.machineChipDot, styles.dotCrane]} />
                  <Text style={styles.machineChipText}>{c.machineNo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {activeRigs.length === 0 && activeCranes.length === 0 && (
          <Text style={styles.detailEmpty}>No machines selected for this plan.</Text>
        )}
      </SummaryAccordion>

      {/* ── Supervisors accordion ───────────────────────────────────────── */}
      <SummaryAccordion
        icon={<Users size={18} color={colors.accent} />}
        title="Supervisors"
        summary={supervisorSummary}
        onEdit={() => onNavigateToStep('supervisors')}
      >
        <SupervisorCard
          shiftLabel={supervisorDetail.shift1Label}
          name={supervisorDetail.shift1Name}
          designation={supervisorDetail.shift1Designation}
          tone="day"
        />
        <SupervisorCard
          shiftLabel={supervisorDetail.shift2Label}
          name={supervisorDetail.shift2Name}
          designation={supervisorDetail.shift2Designation}
          tone="night"
        />
      </SummaryAccordion>

      {/* ── Steps accordion ─────────────────────────────────────────────── */}
      <SummaryAccordion
        icon={<ListChecks size={18} color={colors.accent} />}
        title="Steps included"
        summary={`${selectedStepsCount} of ${totalStepsCount} selected`}
        onEdit={() => onNavigateToStep('steps')}
      >
        {selectedSteps.length === 0 ? (
          <Text style={styles.detailEmpty}>No steps selected for this plan.</Text>
        ) : (
          selectedSteps.map((s) => (
            <View key={s.id} style={styles.stepDetailRow}>
              <View style={[styles.stepTrackDot, { backgroundColor: s.track === 'RIG' ? '#7c3aed' : '#0369a1' }]} />
              <View style={styles.stepDetailInfo}>
                <Text style={styles.stepDetailName}>{s.stepName}</Text>
                <Text style={styles.stepDetailMeta}>{s.track} · #{s.sequenceOrder}</Text>
              </View>
            </View>
          ))
        )}
      </SummaryAccordion>

      {/* ── Duration warnings ───────────────────────────────────────────── */}
      {warningPileCodes.length > 0 && (
        <SummaryAccordion
          icon={<AlertTriangle size={18} color={colors.warning} />}
          title="Duration warnings"
          summary={`${warningPileCodes.length} pile${warningPileCodes.length === 1 ? '' : 's'} using default 60m durations`}
          tone="warning"
          onEdit={() => onNavigateToStep('piles')}
        >
          <Text style={styles.detailLine}>
            The following piles have no matching dimension templates and will use a default 60-minute duration per step:
          </Text>
          {warningPileCodes.map((code, i) => (
            <Text key={i} style={styles.detailLine}>• {code}</Text>
          ))}
        </SummaryAccordion>
      )}

      {/* ── Per-pile accordions ──────────────────────────────────────────── */}
      {piles.map((pile) => {
        const steps = planSteps.filter((s) => s.checklistPileId === pile.checklistPileId);
        return <PileAccordion key={pile.id} pile={pile} steps={steps} />;
      })}

      {piles.length === 0 && (
        <Text style={styles.emptyText}>No piles in this plan.</Text>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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

  // Machines — chips
  machineGroup: { marginBottom: spacing.sm },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  machineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
  },
  machineChipRig: {
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderColor: 'rgba(124,58,237,0.25)',
  },
  machineChipCrane: {
    backgroundColor: 'rgba(3,105,161,0.08)',
    borderColor: 'rgba(3,105,161,0.25)',
  },
  machineChipDot: { width: 6, height: 6, borderRadius: 3 },
  machineChipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dotRig: { backgroundColor: '#7c3aed' },
  dotCrane: { backgroundColor: '#0369a1' },

  // Supervisors — avatar cards
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

  // Steps — track groups with rail
  trackGroup: { marginBottom: spacing.md },
  trackGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  trackPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  trackPillRig: { backgroundColor: 'rgba(124,58,237,0.12)' },
  trackPillCrane: { backgroundColor: 'rgba(3,105,161,0.12)' },
  trackPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  trackPillTextRig: { color: '#7c3aed' },
  trackPillTextCrane: { color: '#0369a1' },
  trackGroupCount: { ...typography.caption, color: colors.textSecondary },
  trackRail: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    gap: spacing.xs,
  },
  trackRailRig: { borderLeftColor: 'rgba(124,58,237,0.3)' },
  trackRailCrane: { borderLeftColor: 'rgba(3,105,161,0.3)' },
  railStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  railDot: { width: 6, height: 6, borderRadius: 3, marginLeft: -19 },
  railStepName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  railStepOrder: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Accordion detail styles
  detailSection: {
    marginBottom: spacing.sm,
  },
  detailSectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  detailLine: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  detailEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  stepDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stepTrackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepDetailInfo: { flex: 1 },
  stepDetailName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepDetailMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },

  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});