// src/components/plan/generate/steps/PreviewStep.tsx
//
// Step 7 — read-only summary of the full generated plan.
// Orchestrates smaller components: main card, timeline bar, summary accordions,
// and per-pile accordions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import AppModal from '@components/shared/AppModal';
import PersonnelPickerList from '@components/shared/PersonnelPickerList';
import MachineAssignPanel from './pile-assign/MachineAssignPanel';
import { colors, spacing, typography } from '@/theme/theme';
import { fmtPlanTime, planEndTime } from '@/types/plan';
import {
  matchesRoleDesignation,
  getEngineerOrSupervisorCandidates,
  getOperatorMachineCandidates,
  getMachineRoleDisabledIds,
  getCrossRoleDisabledIds,
  getShiftInchargeDisabledIds,
  formatAssignmentLocation,
  type DisabledAssignmentInfo,
} from '@/utils/personnelRoles';

import type { PlanDraft, ShiftTeamAssignment } from '@/types/plan';
import type { PlanDraftActions } from '@screens/Home/generatePlan/usePlanDraft';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { PreviewPile } from '@app-types/previewTypes';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import type { PilingStep } from '@/db/schema';
import DurationWarningCard, { type UnschedulableStep } from '../preview/DurationWarningCard';
import CoreTeamCard, { type RoleTarget } from '../preview/CoreTeamCard';
import MachineTimelineCard from '../preview/MachineTimelineCard';
import PilesCard from '../preview/PilesCard';
import PlanWindowBar from '../preview/PlanWindowBar';
import { type TrackChoice } from '../preview/TrackChoiceTiles';

// Re-export for consumers
export type { PreviewPile } from '@app-types/previewTypes';

// ─── Simple data types for accordion details ──────────────────────────────────

export interface MachineDetail {
  id: string;
  machineNo: string;
  type: 'RIG' | 'CRANE' | 'COMPRESSOR';
  description?: string | null;
}

export interface PersonnelDetail {
  id: string;
  name: string;
  designation: string;
  isActive: boolean;
}

export interface ShiftDetail {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewStepProps {
  draft: PlanDraft;
  actions: Pick<PlanDraftActions, 'setMachineRole' | 'setShiftIncharge' | 'setProjectManager' | 'setPlanningEngineer' | 'assignPiles'>;
  /** Not-yet-confirmed Rig/Crane tile selections, owned by GeneratePlanScreen so the
   * "Confirm Reassignment" action can live in its fixed footer instead of here. Tapping
   * a tile only ever calls onPendingTrackOverridesChange — never a draft action — so nothing
   * recomputes until the debounced commit (see usePlanPreview) lands it into `draft`. */
  pendingTrackOverrides: Record<string, string[]>;
  onPendingTrackOverridesChange: (
    updater: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
  ) => void;
  planSteps: PlanStepWithMeta[];
  /** True while the plan preview is (re)generating — the first load, a later
   * recompute (e.g. a track reassignment), or the final Generate/Save submit.
   * Replaces this whole step's content with a centered spinner for as long as
   * it's true, same as FillActualScreen's own loading state; the footer
   * button stays visible (disabled, keeping its label) so the user always
   * has a sense of what's about to happen once it clears. */
  isLoading?: boolean;
  /** Global step catalog, in sequence order — lets PilesCard show every step
   * selected for this plan, not just the ones that got a scheduled time. */
  allSteps?: PilingStep[];
  /** Non-working windows actually applied per machine, from generatePlanPreview(). */
  windowsByMachineId?: Record<string, EffectivePlanWindow[]>;
  piles: PreviewPile[];
  /** Pile×step pairs the plan cannot schedule — see DurationWarningCard. */
  unschedulableSteps?: UnschedulableStep[];
  siteId: string;
  onNavigateToStep: (step: Step) => void;
  /** Opens the reorder overlay for a machine (pencil icon in the Machine Timeline). */
  onEditMachine: (machineId: string) => void;
  /** Detailed data for the Machines accordion body. */
  activeRigs?: MachineDetail[];
  activeCranes?: MachineDetail[];
  /** Detailed data for the Supervisors accordion body. */
  personnel?: PersonnelDetail[];
  shifts?: ShiftDetail[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PreviewStep({
  draft,
  actions,
  pendingTrackOverrides,
  onPendingTrackOverridesChange,
  planSteps,
  isLoading,
  allSteps = [],
  windowsByMachineId,
  piles,
  unschedulableSteps = [],
  siteId,
  onNavigateToStep,
  onEditMachine,
  activeRigs = [],
  activeCranes = [],
  personnel = [],
  shifts = [],
}: PreviewStepProps) {
  const [rolePickerTarget, setRolePickerTarget] = useState<RoleTarget | null>(null);
  const [machinePickerPileId, setMachinePickerPileId] = useState<string | null>(null);
  const [pendingRigId, setPendingRigId] = useState<string | null>(null);
  const [pendingCraneId, setPendingCraneId] = useState<string | null>(null);
  // True from Apply until the recompute it triggered finishes — the panel shows a
  // spinner and the modal stays open for this whole span.
  const [isApplyingMachine, setIsApplyingMachine] = useState(false);
  const appliedMachinePickerRef = useRef(false);

  useEffect(() => {
    if (!appliedMachinePickerRef.current) return;
    appliedMachinePickerRef.current = false;
    setIsApplyingMachine(false);
    setMachinePickerPileId(null);
  }, [planSteps]);

  const endIso = planEndTime(draft.planStartTime);

  // Stable Date references for MachineTimelineCard — passing `new Date(...)` literals
  // inline on every render would defeat its own internal useMemos.
  const windowStart = useMemo(() => new Date(draft.planStartTime), [draft.planStartTime]);
  const windowEnd = useMemo(() => new Date(endIso), [endIso]);

  // Stable across the component's lifetime (only depends on the setState it wraps) — passed
  // straight into PilesCard so tapping one pile's tile never changes the callback identity
  // seen by every other pile's memoized row.
  const handleToggleTrack = useCallback(
    (checklistPileId: string, stepId: string, track: TrackChoice) => {
      onPendingTrackOverridesChange((prev) => {
        const current = prev[checklistPileId] ?? [];
        const next =
          track === 'RIG'
            ? current.includes(stepId) ? current : [...current, stepId]
            : current.filter((id) => id !== stepId);
        return { ...prev, [checklistPileId]: next };
      });
    },
    [onPendingTrackOverridesChange],
  );

  // Stable except when draft.assignments itself changes — passed straight into
  // PilesCard for the same reason as handleToggleTrack above: PagerView mounts
  // every pile's page up front, so an unstable callback here would break every
  // memoized pile page's React.memo, not just the one being edited.
  const openMachinePicker = useCallback(
    (pileId: string) => {
      const current = draft.assignments[pileId];
      setPendingRigId(current?.rig ?? null);
      setPendingCraneId(current?.crane ?? null);
      setMachinePickerPileId(pileId);
    },
    [draft.assignments],
  );

  const cp = draft.checklistPersonnel;

  // ── Machines detail ──────────────────────────────────────────────────────
  const pileLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    piles.forEach((p) => {
      map[p.checklistPileId] = `Pile ${p.code ?? p.checklistPileId}`;
    });
    return map;
  }, [piles]);

  // ── Leadership detail (Project Manager / Planning Engineer) ─────────────
  const leadershipDetail = useMemo(() => {
    const pm = personnel.find((p) => p.id === cp.projectManagerId);
    const pe = personnel.find((p) => p.id === cp.planningEngineerId);
    return { pmName: pm?.name ?? null, pmDesignation: pm?.designation ?? null, peName: pe?.name ?? null, peDesignation: pe?.designation ?? null };
  }, [personnel, cp.projectManagerId, cp.planningEngineerId]);

  // ── Shift incharge detail ────────────────────────────────────────────────
  const shiftInchargeDetail = useMemo(() => {
    const shift1 = shifts[0];
    const shift2 = shifts[1];
    const s1 = shift1 ? `${shift1.name} (${shift1.startTime}–${shift1.endTime})` : 'Shift 1';
    const s2 = shift2 ? `${shift2.name} (${shift2.startTime}–${shift2.endTime})` : 'Shift 2';
    const si1 = personnel.find((p) => p.id === cp.shift1.shiftInchargeId);
    const si2 = personnel.find((p) => p.id === cp.shift2.shiftInchargeId);
    return {
      shift1Label: s1,
      shift1Name: si1?.name ?? null,
      shift1Designation: si1?.designation ?? null,
      shift2Label: s2,
      shift2Name: si2?.name ?? null,
      shift2Designation: si2?.designation ?? null,
    };
  }, [shifts, personnel, cp.shift1.shiftInchargeId, cp.shift2.shiftInchargeId]);

  // ── Machine teams detail (Engineer / Supervisor / Operator per machine, per shift) ──
  const machineTeams = useMemo(() => {
    const all = [...activeRigs, ...activeCranes];
    return all.map((m) => ({
      id: m.id,
      machineNo: m.machineNo,
      type: m.type,
      engineerName1: personnel.find((p) => p.id === cp.shift1.engineerByMachineId[m.id])?.name ?? null,
      engineerName2: personnel.find((p) => p.id === cp.shift2.engineerByMachineId[m.id])?.name ?? null,
      supervisorName1: personnel.find((p) => p.id === cp.shift1.supervisorByMachineId[m.id])?.name ?? null,
      supervisorName2: personnel.find((p) => p.id === cp.shift2.supervisorByMachineId[m.id])?.name ?? null,
      operatorName1: personnel.find((p) => p.id === cp.shift1.operatorByMachineId[m.id])?.name ?? null,
      operatorName2: personnel.find((p) => p.id === cp.shift2.operatorByMachineId[m.id])?.name ?? null,
    }));
  }, [activeRigs, activeCranes, personnel, cp.shift1, cp.shift2]);

  // ── Role-picker candidate lists (mirrors StartTimeStep/TeamAssignStep/
  // MachineSelectStep, triggered here from a row tap instead) ──
  const pmCandidates = useMemo(() => personnel.filter((p) => matchesRoleDesignation('PROJECT_MANAGER', p.designation)), [personnel]);
  const peCandidates = useMemo(() => personnel.filter((p) => matchesRoleDesignation('PLANNING_ENGINEER', p.designation)), [personnel]);
  const shiftInchargeCandidates = useMemo(() => personnel.filter((p) => matchesRoleDesignation('SHIFT_INCHARGE', p.designation)), [personnel]);
  // Engineer and Supervisor share one candidate pool — either designation can cover either
  // role (see getEngineerOrSupervisorCandidates).
  const engineerOrSupervisorCandidates = useMemo(() => getEngineerOrSupervisorCandidates(personnel), [personnel]);

  function teamForSlot(slot: 1 | 2): ShiftTeamAssignment {
    return slot === 1 ? cp.shift1 : cp.shift2;
  }
  // The OTHER shift's team — used to disable (not hide) anyone already assigned to the same
  // role there, since nobody can work both shifts.
  function otherTeamForSlot(slot: 1 | 2): ShiftTeamAssignment {
    return slot === 1 ? cp.shift2 : cp.shift1;
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Calculating plan preview…</Text>
      </View>
    );
  }

  // Apply stays open (spinner shown via isApplyingMachine) until the effect above
  // observes planSteps actually refresh, instead of closing immediately.
  function commitMachinePicker() {
    if (!machinePickerPileId || !pendingRigId) return;
    appliedMachinePickerRef.current = true;
    setIsApplyingMachine(true);
    actions.assignPiles([machinePickerPileId], pendingRigId, pendingCraneId);
  }

  function machineNoFor(machineId: string): string {
    return machineTeams.find((m) => m.id === machineId)?.machineNo ?? '';
  }

  function shiftLabelForSlot(slot: 1 | 2): string {
    const shift = shifts[slot - 1];
    return shift ? shift.name : slot === 1 ? 'Shift 1 (Day)' : 'Shift 2 (Night)';
  }

  function toDisabledDetails(
    info: Map<string, DisabledAssignmentInfo>,
    slot: 1 | 2,
  ): Map<string, string> {
    const currentLabel = shiftLabelForSlot(slot);
    const otherLabel = shiftLabelForSlot(slot === 1 ? 2 : 1);
    return new Map(
      [...info].map(([id, entry]) => [
        id,
        formatAssignmentLocation(entry, machineNoFor, (s) => (s === 'current' ? currentLabel : otherLabel)),
      ]),
    );
  }

  function getRolePickerConfig(target: RoleTarget) {
    switch (target.role) {
      case 'PROJECT_MANAGER':
        return {
          title: 'Project Manager',
          personnel: pmCandidates,
          selectedId: cp.projectManagerId,
          allowNone: false,
          onSelect: (id: string | null) => actions.setProjectManager(id),
        };
      case 'PLANNING_ENGINEER':
        return {
          title: 'Planning Engineer',
          personnel: peCandidates,
          selectedId: cp.planningEngineerId,
          allowNone: true,
          onSelect: (id: string | null) => actions.setPlanningEngineer(id),
        };
      case 'SHIFT_INCHARGE':
        return {
          title: target.slot === 1 ? 'Shift Incharge (Day)' : 'Shift Incharge (Night)',
          personnel: shiftInchargeCandidates,
          selectedId: teamForSlot(target.slot).shiftInchargeId,
          allowNone: true,
          disabledDetails: toDisabledDetails(
            getShiftInchargeDisabledIds(otherTeamForSlot(target.slot).shiftInchargeId),
            target.slot,
          ),
          onSelect: (id: string | null) => actions.setShiftIncharge(target.slot, id),
        };
      case 'ENGINEER': {
        const team = teamForSlot(target.slot);
        return {
          title: `Engineer — ${machineNoFor(target.machineId)} (${target.slot === 1 ? 'Day' : 'Night'})`,
          personnel: engineerOrSupervisorCandidates,
          selectedId: team.engineerByMachineId[target.machineId] ?? null,
          allowNone: false,
          disabledDetails: toDisabledDetails(
            new Map([
              ...getMachineRoleDisabledIds(
                target.machineId,
                team.engineerByMachineId,
                otherTeamForSlot(target.slot).engineerByMachineId,
                { excludeSameShiftOtherMachines: false },
              ),
              ...getCrossRoleDisabledIds(team.supervisorByMachineId),
            ]),
            target.slot,
          ),
          onSelect: (id: string | null) => actions.setMachineRole(target.slot, 'ENGINEER', target.machineId, id),
        };
      }
      case 'SUPERVISOR': {
        const team = teamForSlot(target.slot);
        return {
          title: `Supervisor — ${machineNoFor(target.machineId)} (${target.slot === 1 ? 'Day' : 'Night'})`,
          personnel: engineerOrSupervisorCandidates,
          selectedId: team.supervisorByMachineId[target.machineId] ?? null,
          allowNone: true,
          disabledDetails: toDisabledDetails(
            new Map([
              ...getMachineRoleDisabledIds(
                target.machineId,
                team.supervisorByMachineId,
                otherTeamForSlot(target.slot).supervisorByMachineId,
                { excludeSameShiftOtherMachines: false },
              ),
              ...getCrossRoleDisabledIds(team.engineerByMachineId),
            ]),
            target.slot,
          ),
          onSelect: (id: string | null) => actions.setMachineRole(target.slot, 'SUPERVISOR', target.machineId, id),
        };
      }
      case 'MACHINE_OPERATOR': {
        const team = teamForSlot(target.slot);
        const isRig = activeRigs.some((r) => r.id === target.machineId);
        return {
          title: `Operator — ${machineNoFor(target.machineId)} (${target.slot === 1 ? 'Day' : 'Night'})`,
          personnel: getOperatorMachineCandidates(isRig ? 'RIG' : 'CRANE', personnel),
          selectedId: team.operatorByMachineId[target.machineId] ?? null,
          allowNone: true,
          disabledDetails: toDisabledDetails(
            getMachineRoleDisabledIds(
              target.machineId,
              team.operatorByMachineId,
              otherTeamForSlot(target.slot).operatorByMachineId,
              { excludeSameShiftOtherMachines: true },
            ),
            target.slot,
          ),
          onSelect: (id: string | null) => actions.setMachineRole(target.slot, 'MACHINE_OPERATOR', target.machineId, id),
        };
      }
    }
  }

  const rolePickerConfig = rolePickerTarget ? getRolePickerConfig(rolePickerTarget) : null;

  return (
    <>
      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <PlanWindowBar startLabel={fmtPlanTime(draft.planStartTime)} endLabel={fmtPlanTime(endIso)} />

      {/* ── Duration warnings ───────────────────────────────────────────── */}
      <DurationWarningCard items={unschedulableSteps} siteId={siteId} />

      {/* ── Core Team (Leadership / Shift Incharge / Machine Teams) ──────── */}
      <CoreTeamCard
        leadership={leadershipDetail}
        shiftIncharge={shiftInchargeDetail}
        machineTeams={machineTeams}
        onPressRole={setRolePickerTarget}
      />

      {/* ── Visual timeline ─────────────────────────────────────────────── */}
      <MachineTimelineCard
        windowStart={windowStart}
        windowEnd={windowEnd}
        steps={planSteps}
        activeRigs={activeRigs}
        activeCranes={activeCranes}
        pileLabelById={pileLabelById}
        onEditMachine={onEditMachine}
        windowsByMachineId={windowsByMachineId}
      />

      {/* ── Piles (swipeable pill selector) ─────────────────────────────── */}
      <PilesCard
        piles={piles}
        planSteps={planSteps}
        overriddenTrackStepIdsByPileId={pendingTrackOverrides}
        onToggleTrack={handleToggleTrack}
        windowsByMachineId={windowsByMachineId}
        allSteps={allSteps}
        selectedStepIds={draft.selectedStepIds}
        resumeWorkByPileId={draft.resumeWorkByPileId}
        onPressMachineBadge={openMachinePicker}
      />

      {/* ── Core Team role picker ─────────────────────────────────────────── */}
      <AppModal
        visible={!!rolePickerTarget}
        onClose={() => setRolePickerTarget(null)}
        title={rolePickerConfig?.title}
        position="center"
      >
        {rolePickerConfig ? (
          <PersonnelPickerList
            personnel={rolePickerConfig.personnel}
            selectedId={rolePickerConfig.selectedId}
            allowNone={rolePickerConfig.allowNone}
            disabledDetails={'disabledDetails' in rolePickerConfig ? rolePickerConfig.disabledDetails : undefined}
            onSelect={(id) => {
              rolePickerConfig.onSelect(id);
              setRolePickerTarget(null);
            }}
          />
        ) : null}
      </AppModal>

      {/* ── Machine reassignment picker (Rig/Crane rows in PilesCard) ── */}
      <AppModal
        visible={!!machinePickerPileId}
        onClose={isApplyingMachine ? () => {} : () => setMachinePickerPileId(null)}
        title="Assign machines"
        position="center"
      >
        <MachineAssignPanel
          rigs={activeRigs}
          cranes={activeCranes}
          rigId={pendingRigId}
          craneId={pendingCraneId}
          onSelectRig={setPendingRigId}
          onSelectCrane={setPendingCraneId}
          onApply={commitMachinePicker}
          applyLabel="Apply"
          isApplying={isApplyingMachine}
        />
      </AppModal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // flex: 1 (not a fixed minHeight) so this actually centers in whatever
  // vertical space is available — relies on the parent ScrollView's
  // contentContainerStyle having flexGrow: 1 (see GeneratePlanScreen's
  // scrollContent) so that space is the full viewport, not just this view's
  // own natural size.
  loadingContainer: {
    flex: 1,
    minHeight: 600,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
