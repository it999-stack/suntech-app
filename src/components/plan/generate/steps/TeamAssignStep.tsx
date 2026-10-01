// src/components/plan/generate/steps/TeamAssignStep.tsx
//
// Single Team Assignment step covering BOTH shifts: one card per machine with a
// Day and a Night column side by side (plus a Shift Incharge card). A person
// already holding a role — this one or its complementary one (Engineer <->
// Supervisor) — in EITHER shift is shown faded, not selectable: moving them to
// the other shift means unassigning them there first, then picking them here.
// Completeness of both shifts is checked only when Next is pressed
// (focusFirstMissing).

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import AppModal from '@components/shared/AppModal';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import { colors, spacing, typography } from '@/theme/theme';
import type { PlanDraft, ShiftTeamAssignment } from '@/types/plan';
import type { PlanDraftActions } from '@screens/Home/generatePlan/usePlanDraft';
import {
  matchesRoleDesignation,
  getEngineerOrSupervisorCandidates,
  getOperatorMachineCandidates,
  getMachineRoleDisabledIds,
  getCrossRoleDisabledIds,
  getShiftInchargeDisabledIds,
  formatAssignmentLocation,
  findFirstMissingPlanTeamField,
  type SimpleMachine,
  type DisabledAssignmentInfo,
} from '@/utils/personnelRoles';
import { useScrollToField } from '@hooks/useScrollToField';
import MachineTeamCard, { ShiftColumn } from './team-assign/MachineTeamCard';
import TeamRoleRow from './team-assign/TeamRoleRow';

export interface SimpleShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface TeamAssignStepHandle {
  focusFirstMissing: () => boolean;
}

interface TeamAssignStepProps {
  draft: PlanDraft;
  actions: Pick<PlanDraftActions, 'setShiftIncharge' | 'setMachineRole'>;
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
  personnel: SimplePersonnel[];
  shifts: SimpleShift[];
  scrollViewRef: React.RefObject<ScrollView | null>;
  scrollYRef: React.RefObject<number>;
}

type MachineRole = 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR';
type Slot = 1 | 2;

type PickerTarget =
  | { slot: Slot; role: 'SHIFT_INCHARGE' }
  | { slot: Slot; role: MachineRole; machineId: string; type: 'RIG' | 'CRANE' };

const ROLE_MAP_KEY = {
  ENGINEER: 'engineerByMachineId',
  SUPERVISOR: 'supervisorByMachineId',
  MACHINE_OPERATOR: 'operatorByMachineId',
} as const;

function fieldKey(slot: Slot, role: MachineRole, machineId: string): string {
  return `${slot}:${role}:${machineId}`;
}

const TeamAssignStep = forwardRef<TeamAssignStepHandle, TeamAssignStepProps>(function TeamAssignStep({
  draft,
  actions,
  activeRigs,
  activeCranes,
  personnel,
  shifts,
  scrollViewRef,
  scrollYRef,
}, ref) {
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const { registerField, scrollToField } = useScrollToField(scrollViewRef, scrollYRef);

  const shiftLabel = (slot: Slot): string => shifts[slot - 1]?.name ?? (slot === 1 ? 'Day Shift' : 'Night Shift');
  const teamFor = (slot: Slot): ShiftTeamAssignment =>
    slot === 1 ? draft.checklistPersonnel.shift1 : draft.checklistPersonnel.shift2;
  const nameOf = (id: string | null | undefined): string | null => personnel.find((p) => p.id === id)?.name ?? null;

  const machineNoFor = useMemo(() => {
    const map = new Map([...activeRigs, ...activeCranes].map((m) => [m.id, m.machineNo]));
    return (machineId: string) => map.get(machineId) ?? '';
  }, [activeRigs, activeCranes]);

  const shiftIncharges = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('SHIFT_INCHARGE', p.designation)),
    [personnel],
  );
  // Engineer and Supervisor share one candidate pool (see getEngineerOrSupervisorCandidates).
  const engineerOrSupervisorCandidates = useMemo(() => getEngineerOrSupervisorCandidates(personnel), [personnel]);

  // Clear the highlight the moment the field it points at gets filled in.
  useEffect(() => {
    if (!highlightKey) return;
    const [slot, role, machineId] = highlightKey.split(':') as [string, MachineRole, string];
    if (teamFor(Number(slot) as Slot)[ROLE_MAP_KEY[role]][machineId]) setHighlightKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.checklistPersonnel, highlightKey]);

  useImperativeHandle(ref, () => ({
    focusFirstMissing() {
      const missing = findFirstMissingPlanTeamField(
        draft.checklistPersonnel,
        activeRigs.map((r) => r.id),
        activeCranes.map((c) => c.id),
      );
      if (!missing) {
        setHighlightKey(null);
        return true;
      }
      const key = fieldKey(missing.slot, missing.role, missing.machineId);
      setHighlightKey(key);
      requestAnimationFrame(() => scrollToField(key));
      return false;
    },
  }), [draft.checklistPersonnel, activeRigs, activeCranes, scrollToField]);

  // ── Picker config for whichever slot/role/machine was tapped ─────────────
  const pickerConfig = useMemo(() => {
    if (!pickerTarget) return null;
    const { slot } = pickerTarget;
    const team = teamFor(slot);
    const other = teamFor(slot === 1 ? 2 : 1);
    const otherLabel = shiftLabel(slot === 1 ? 2 : 1);

    const toDisabledDetails = (info: Map<string, DisabledAssignmentInfo>) =>
      new Map(
        [...info].map(([id, entry]) => [
          id,
          formatAssignmentLocation(entry, machineNoFor, (s) => (s === 'current' ? shiftLabel(slot) : otherLabel)),
        ]),
      );

    if (pickerTarget.role === 'SHIFT_INCHARGE') {
      return {
        title: `Shift Incharge · ${shiftLabel(slot)}`,
        personnel: shiftIncharges,
        selectedId: team.shiftInchargeId,
        emptyLabel: 'No matching shift incharges synced for this site.',
        disabledDetails: toDisabledDetails(getShiftInchargeDisabledIds(other.shiftInchargeId)),
        onSelect: (id: string | null) => actions.setShiftIncharge(slot, id),
      };
    }

    const { role, machineId, type } = pickerTarget;
    const mapKey = ROLE_MAP_KEY[role];
    const complementaryMapKey = role === 'ENGINEER' ? 'supervisorByMachineId' : role === 'SUPERVISOR' ? 'engineerByMachineId' : null;
    const disabled = new Map<string, DisabledAssignmentInfo>([
      ...getMachineRoleDisabledIds(machineId, team[mapKey], other[mapKey], {
        excludeSameShiftOtherMachines: role === 'MACHINE_OPERATOR',
      }),
      // Engineer <-> Supervisor: can't hold the complementary role, this shift or the other.
      ...(complementaryMapKey
        ? [
            ...getCrossRoleDisabledIds(team[complementaryMapKey]),
            ...[...getCrossRoleDisabledIds(other[complementaryMapKey])].map(
              ([id, info]): [string, DisabledAssignmentInfo] => [id, { ...info, shift: 'other' }],
            ),
          ]
        : []),
    ]);

    return {
      title: `${role === 'ENGINEER' ? 'Engineer' : role === 'SUPERVISOR' ? 'Supervisor' : 'Operator'} · ${machineNoFor(machineId)} · ${shiftLabel(slot)}`,
      personnel: role === 'MACHINE_OPERATOR' ? getOperatorMachineCandidates(type, personnel) : engineerOrSupervisorCandidates,
      selectedId: team[mapKey][machineId] ?? null,
      emptyLabel: 'No matching personnel synced for this site.',
      disabledDetails: toDisabledDetails(disabled),
      onSelect: (id: string | null) => actions.setMachineRole(slot, role, machineId, id),
    };
  }, [pickerTarget, draft.checklistPersonnel, personnel, shiftIncharges, engineerOrSupervisorCandidates, machineNoFor, shifts, actions]);

  function roleRow(slot: Slot, role: MachineRole, machine: SimpleMachine, type: 'RIG' | 'CRANE', label: string, required: boolean, isLast: boolean) {
    const key = fieldKey(slot, role, machine.id);
    return (
      <TeamRoleRow
        key={key}
        rowRef={registerField(key)}
        highlighted={highlightKey === key}
        label={label}
        required={required}
        isLast={isLast}
        assigneeName={nameOf(teamFor(slot)[ROLE_MAP_KEY[role]][machine.id])}
        onPress={() => setPickerTarget({ slot, role, machineId: machine.id, type })}
      />
    );
  }

  const slots: Slot[] = [1, 2];

  return (
    <>
      {activeRigs.length === 0 && activeCranes.length === 0 && (
        <Text style={styles.emptyText}>No active machines. Go back and activate at least one rig or crane.</Text>
      )}

      <MachineTeamCard title="Shift Incharge">
        {slots.map((slot) => (
          <ShiftColumn key={slot} slot={slot} title={shiftLabel(slot)}>
            <TeamRoleRow
              label="Incharge"
              isLast
              assigneeName={nameOf(teamFor(slot).shiftInchargeId)}
              onPress={() => setPickerTarget({ slot, role: 'SHIFT_INCHARGE' })}
            />
          </ShiftColumn>
        ))}
      </MachineTeamCard>

      {activeRigs.map((rig) => (
        <MachineTeamCard key={rig.id} title={rig.machineNo} track="RIG">
          {slots.map((slot) => (
            <ShiftColumn key={slot} slot={slot} title={shiftLabel(slot)}>
              {roleRow(slot, 'ENGINEER', rig, 'RIG', 'Engineer', true, false)}
              {roleRow(slot, 'SUPERVISOR', rig, 'RIG', 'Supervisor', false, false)}
              {roleRow(slot, 'MACHINE_OPERATOR', rig, 'RIG', 'Rig Operator', true, true)}
            </ShiftColumn>
          ))}
        </MachineTeamCard>
      ))}

      {activeCranes.map((crane) => (
        <MachineTeamCard key={crane.id} title={crane.machineNo} track="CRANE">
          {slots.map((slot) => (
            <ShiftColumn key={slot} slot={slot} title={shiftLabel(slot)}>
              {roleRow(slot, 'MACHINE_OPERATOR', crane, 'CRANE', 'Crane Operator', true, true)}
            </ShiftColumn>
          ))}
        </MachineTeamCard>
      ))}

      <AppModal
        visible={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        title={pickerConfig?.title ?? ''}
        position="center"
      >
        {pickerConfig ? (
          <PersonnelPickerList
            personnel={pickerConfig.personnel}
            selectedId={pickerConfig.selectedId}
            allowNone
            emptyLabel={pickerConfig.emptyLabel}
            disabledDetails={pickerConfig.disabledDetails}
            onSelect={(id) => {
              pickerConfig.onSelect(id);
              setPickerTarget(null);
            }}
          />
        ) : null}
      </AppModal>
    </>
  );
});

export default TeamAssignStep;

const styles = StyleSheet.create({
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
});
