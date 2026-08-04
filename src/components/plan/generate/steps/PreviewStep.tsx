// src/components/plan/generate/steps/PreviewStep.tsx
//
// Step 7 — read-only summary of the full generated plan.
// Orchestrates smaller components: main card, timeline bar, summary accordions,
// and per-pile accordions.

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import PersonnelPickerList from '@components/shared/PersonnelPickerList';
import { colors, spacing, typography } from '@/theme/theme';
import { fmtPlanTime, planEndTime } from '@/types/plan';
import {
  matchesRoleDesignation,
  getOperatorMachineCandidates,
  getMachineRoleDisabledIds,
  getShiftInchargeDisabledIds,
} from '@/utils/personnelRoles';

import type { PlanDraft, ShiftTeamAssignment } from '@/types/plan';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { PreviewPile } from '@app-types/previewTypes';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import SummaryAccordion from '../preview/SummaryAccordion';
import CoreTeamAccordion, { type RoleTarget } from '../preview/CoreTeamAccordion';
import MachineTimelineAccordion from '../preview/MachineTimelineAccordion';
import PilesAccordion from '../preview/PilesAccordion';
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
  onUpdate: (patch: Partial<PlanDraft>) => void;
  /** Not-yet-confirmed Rig/Crane tile selections, owned by GeneratePlanScreen so the
   * "Confirm Reassignment" action can live in its fixed footer instead of here. Tapping
   * a tile only ever calls onPendingTrackOverridesChange — never onUpdate() — so nothing
   * recomputes until the parent's Confirm button commits it into `draft`. */
  pendingTrackOverrides: Record<string, string[]>;
  onPendingTrackOverridesChange: (
    updater: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
  ) => void;
  planSteps: PlanStepWithMeta[];
  /** True while the plan preview is (re)generating. Only shows the full-screen spinner on the
   * very first load (no planSteps yet) — a recompute triggered later (e.g. by a track
   * reassignment) never blanks the screen; the footer's Save Changes/Generate Plan button is
   * the only place that shows a pending recompute. */
  isLoading?: boolean;
  /** Non-working windows actually applied per machine, from generatePlanPreview(). */
  windowsByMachineId?: Record<string, EffectivePlanWindow[]>;
  piles: PreviewPile[];
  warningPileCodes?: string[];
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
  onUpdate,
  pendingTrackOverrides,
  onPendingTrackOverridesChange,
  planSteps,
  isLoading,
  windowsByMachineId,
  piles,
  warningPileCodes = [],
  onNavigateToStep,
  onEditMachine,
  activeRigs = [],
  activeCranes = [],
  personnel = [],
  shifts = [],
}: PreviewStepProps) {
  const [rolePickerTarget, setRolePickerTarget] = useState<RoleTarget | null>(null);

  const endIso = planEndTime(draft.planStartTime);

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
  const engineerCandidates = useMemo(() => personnel.filter((p) => matchesRoleDesignation('ENGINEER', p.designation)), [personnel]);
  const supervisorCandidates = useMemo(() => personnel.filter((p) => matchesRoleDesignation('SUPERVISOR', p.designation)), [personnel]);

  function teamForSlot(slot: 1 | 2): ShiftTeamAssignment {
    return slot === 1 ? cp.shift1 : cp.shift2;
  }
  // The OTHER shift's team — used to disable (not hide) anyone already assigned to the same
  // role there, since nobody can work both shifts.
  function otherTeamForSlot(slot: 1 | 2): ShiftTeamAssignment {
    return slot === 1 ? cp.shift2 : cp.shift1;
  }
  function updateTeamForSlot(slot: 1 | 2, patch: Partial<ShiftTeamAssignment>) {
    const key = slot === 1 ? 'shift1' : 'shift2';
    updatePersonnel({ [key]: { ...teamForSlot(slot), ...patch } });
  }

  // Only the very first load (nothing generated yet) gets the full-screen spinner — a
  // recompute triggered later (e.g. tapping a Rig/Crane tile) never blanks this screen;
  // the footer's Save Changes/Generate Plan button is the only place that shows it's pending.
  if (isLoading && planSteps.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Calculating plan preview…</Text>
      </View>
    );
  }

  function updatePersonnel(patch: Partial<PlanDraft['checklistPersonnel']>) {
    onUpdate({ checklistPersonnel: { ...cp, ...patch } });
  }

  // Tap handler for a CRANE-track step's Rig/Crane tiles — mutates only the pending
  // state owned by GeneratePlanScreen, never onUpdate(), so nothing recomputes until
  // its Confirm Reassignment action (in the fixed footer) commits it into `draft`.
  function getTrackChoice(pile: PreviewPile, step: PlanStepWithMeta) {
    // Deliberately does NOT fall back to step.track when not in the list: that field
    // only updates on Confirm (the recompute), while taps only touch this pending
    // list — falling back to it made reverting an already-Rig step back to Crane a
    // dead end (removing it from the list still read the stale, unconfirmed
    // step.track === 'RIG'). The list itself is already the full source of truth:
    // edit-mode reopen reconstructs it from the persisted plan's real assignments
    // (see GeneratePlanScreen's edit-seeding effect), so it's never missing a
    // previously-overridden step in the first place.
    const overridden = pendingTrackOverrides[pile.checklistPileId] ?? [];
    const selected: TrackChoice = overridden.includes(step.stepId) ? 'RIG' : 'CRANE';
    return {
      selected,
      onSelect: (track: TrackChoice) => {
        onPendingTrackOverridesChange((prev) => {
          const current = prev[pile.checklistPileId] ?? [];
          const next =
            track === 'RIG'
              ? current.includes(step.stepId) ? current : [...current, step.stepId]
              : current.filter((id: string) => id !== step.stepId);
          return { ...prev, [pile.checklistPileId]: next };
        });
      },
    };
  }

  function machineNoFor(machineId: string): string {
    return machineTeams.find((m) => m.id === machineId)?.machineNo ?? '';
  }

  function getRolePickerConfig(target: RoleTarget) {
    switch (target.role) {
      case 'PROJECT_MANAGER':
        return {
          title: 'Project Manager',
          personnel: pmCandidates,
          selectedId: cp.projectManagerId,
          allowNone: false,
          onSelect: (id: string | null) => updatePersonnel({ projectManagerId: id }),
        };
      case 'PLANNING_ENGINEER':
        return {
          title: 'Planning Engineer',
          personnel: peCandidates,
          selectedId: cp.planningEngineerId,
          allowNone: false,
          onSelect: (id: string | null) => updatePersonnel({ planningEngineerId: id }),
        };
      case 'SHIFT_INCHARGE':
        return {
          title: target.slot === 1 ? 'Shift Incharge (Day)' : 'Shift Incharge (Night)',
          personnel: shiftInchargeCandidates,
          selectedId: teamForSlot(target.slot).shiftInchargeId,
          allowNone: true,
          disabledIds: getShiftInchargeDisabledIds(otherTeamForSlot(target.slot).shiftInchargeId),
          onSelect: (id: string | null) => updateTeamForSlot(target.slot, { shiftInchargeId: id }),
        };
      case 'ENGINEER': {
        const team = teamForSlot(target.slot);
        return {
          title: `Engineer — ${machineNoFor(target.machineId)} (${target.slot === 1 ? 'Day' : 'Night'})`,
          personnel: engineerCandidates,
          selectedId: team.engineerByMachineId[target.machineId] ?? null,
          allowNone: false,
          disabledIds: getMachineRoleDisabledIds(
            target.machineId,
            team.engineerByMachineId,
            otherTeamForSlot(target.slot).engineerByMachineId,
            { excludeSameShiftOtherMachines: false },
          ),
          onSelect: (id: string | null) => {
            const engineerByMachineId = { ...team.engineerByMachineId };
            if (id) engineerByMachineId[target.machineId] = id;
            else delete engineerByMachineId[target.machineId];
            updateTeamForSlot(target.slot, { engineerByMachineId });
          },
        };
      }
      case 'SUPERVISOR': {
        const team = teamForSlot(target.slot);
        return {
          title: `Supervisor — ${machineNoFor(target.machineId)} (${target.slot === 1 ? 'Day' : 'Night'})`,
          personnel: supervisorCandidates,
          selectedId: team.supervisorByMachineId[target.machineId] ?? null,
          allowNone: true,
          disabledIds: getMachineRoleDisabledIds(
            target.machineId,
            team.supervisorByMachineId,
            otherTeamForSlot(target.slot).supervisorByMachineId,
            { excludeSameShiftOtherMachines: false },
          ),
          onSelect: (id: string | null) => {
            const supervisorByMachineId = { ...team.supervisorByMachineId };
            if (id) supervisorByMachineId[target.machineId] = id;
            else delete supervisorByMachineId[target.machineId];
            updateTeamForSlot(target.slot, { supervisorByMachineId });
          },
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
          disabledIds: getMachineRoleDisabledIds(
            target.machineId,
            team.operatorByMachineId,
            otherTeamForSlot(target.slot).operatorByMachineId,
            { excludeSameShiftOtherMachines: true },
          ),
          onSelect: (id: string | null) => {
            const operatorByMachineId = { ...team.operatorByMachineId };
            if (id) operatorByMachineId[target.machineId] = id;
            else delete operatorByMachineId[target.machineId];
            updateTeamForSlot(target.slot, { operatorByMachineId });
          },
        };
      }
    }
  }

  const rolePickerConfig = rolePickerTarget ? getRolePickerConfig(rolePickerTarget) : null;

  return (
    <>
      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <PlanWindowBar startLabel={fmtPlanTime(draft.planStartTime)} endLabel={fmtPlanTime(endIso)} />

      {/* ── Core Team (Leadership / Shift Incharge / Machine Teams) ──────── */}
      <CoreTeamAccordion
        leadership={leadershipDetail}
        shiftIncharge={shiftInchargeDetail}
        machineTeams={machineTeams}
        defaultOpen
        onPressRole={setRolePickerTarget}
      />

      {/* ── Visual timeline ─────────────────────────────────────────────── */}
      <MachineTimelineAccordion
        windowStart={new Date(draft.planStartTime)}
        windowEnd={new Date(endIso)}
        steps={planSteps}
        activeRigs={activeRigs}
        activeCranes={activeCranes}
        pileLabelById={pileLabelById}
        onEditMachine={onEditMachine}
        windowsByMachineId={windowsByMachineId}
      />

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

      {/* ── Piles (swipeable pill selector) ─────────────────────────────── */}
      <PilesAccordion
        piles={piles}
        planSteps={planSteps}
        getTrackChoice={getTrackChoice}
        windowsByMachineId={windowsByMachineId}
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
            disabledIds={'disabledIds' in rolePickerConfig ? rolePickerConfig.disabledIds : undefined}
            onSelect={(id) => {
              rolePickerConfig.onSelect(id);
              setRolePickerTarget(null);
            }}
          />
        ) : null}
      </AppModal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: {
    minHeight: 600,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detailLine: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
});
