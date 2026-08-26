// src/components/plan/generate/steps/TeamAssignStep.tsx

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Drill, Forklift, Users } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import AssigneeChip from '@components/shared/AssigneeChip';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft, ShiftTeamAssignment } from '@/types/plan';
import {
  matchesRoleDesignation,
  getEngineerOrSupervisorCandidates,
  getOperatorMachineCandidates,
  getMachineRoleDisabledIds,
  getCrossRoleDisabledIds,
  getShiftInchargeDisabledIds,
  formatAssignmentLocation,
  findFirstMissingTeamField,
  type SimpleMachine,
  type DisabledAssignmentInfo,
} from '@/utils/personnelRoles';
import { useScrollToField } from '@hooks/useScrollToField';

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
  onUpdate: (patch: Partial<PlanDraft>) => void;
  /** Which shift's roster this instance edits — GeneratePlanScreen mounts one per shift. */
  shiftSlot: 1 | 2;
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
  personnel: SimplePersonnel[];
  shifts: SimpleShift[];
  scrollViewRef: React.RefObject<ScrollView | null>;
  scrollYRef: React.RefObject<number>;
}

type PickerTarget =
  | { role: 'SHIFT_INCHARGE' }
  | { role: 'ENGINEER'; machineId: string }
  | { role: 'SUPERVISOR'; machineId: string }
  | { role: 'MACHINE_OPERATOR'; machineId: string; type: 'RIG' | 'CRANE' };

function TeamRow({
  icon,
  label,
  assigneeName,
  onPress,
  rowRef,
  highlighted,
}: {
  icon: React.ReactNode;
  label: string;
  assigneeName: string | null;
  onPress: () => void;
  rowRef?: (el: View | null) => void;
  highlighted?: boolean;
}) {
  return (
    <Pressable
      ref={rowRef}
      style={[styles.machineTeamRow, highlighted && styles.machineTeamRowHighlighted]}
      onPress={onPress}
    >
      <View style={styles.machineTeamTopRow}>
        <View style={styles.machineIcon}>{icon}</View>
        <Text style={styles.machineTeamNo} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.machineTeamBottomRow}>
        <AssigneeChip name={assigneeName} onPress={onPress} />
      </View>
    </Pressable>
  );
}

function fieldKey(role: 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR', machineId: string): string {
  return `${role}:${machineId}`;
}

const TeamAssignStep = forwardRef<TeamAssignStepHandle, TeamAssignStepProps>(function TeamAssignStep({
  draft,
  onUpdate,
  shiftSlot,
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

  const shift1 = shifts[0];
  const shift2 = shifts[1];
  const tab1Label = shift1 ? `${shift1.name}` : 'Shift 1 (Day)';
  const tab2Label = shift2 ? `${shift2.name}` : 'Shift 2 (Night)';
  const currentShiftLabel = shiftSlot === 1 ? tab1Label : tab2Label;
  const otherShiftLabel = shiftSlot === 1 ? tab2Label : tab1Label;

  const machineNoFor = useMemo(() => {
    const map = new Map([...activeRigs, ...activeCranes].map((m) => [m.id, m.machineNo]));
    return (machineId: string) => map.get(machineId) ?? '';
  }, [activeRigs, activeCranes]);

  function toDisabledDetails(info: Map<string, DisabledAssignmentInfo>): Map<string, string> {
    return new Map(
      [...info].map(([id, entry]) => [
        id,
        formatAssignmentLocation(entry, machineNoFor, (s) => (s === 'current' ? currentShiftLabel : otherShiftLabel)),
      ]),
    );
  }

  const shiftIncharges = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('SHIFT_INCHARGE', p.designation)),
    [personnel],
  );
  // Engineer and Supervisor share one candidate pool — either designation can cover either
  // role (see getEngineerOrSupervisorCandidates).
  const engineerOrSupervisorCandidates = useMemo(
    () => getEngineerOrSupervisorCandidates(personnel),
    [personnel],
  );

  const team = shiftSlot === 1 ? draft.checklistPersonnel.shift1 : draft.checklistPersonnel.shift2;
  // The shift NOT currently being edited — used to disable (not hide) anyone already
  // assigned to the same role there, since nobody can work both shifts.
  const otherTeam = shiftSlot === 1 ? draft.checklistPersonnel.shift2 : draft.checklistPersonnel.shift1;

  // Clear the highlight the moment the field it points at gets filled in.
  useEffect(() => {
    if (!highlightKey) return;
    const [role, machineId] = highlightKey.split(':') as [PickerTarget['role'], string];
    const filled =
      role === 'ENGINEER' ? !!team.engineerByMachineId[machineId]
      : role === 'SUPERVISOR' ? !!team.supervisorByMachineId[machineId]
      : role === 'MACHINE_OPERATOR' ? !!team.operatorByMachineId[machineId]
      : false;
    if (filled) setHighlightKey(null);
  }, [team, highlightKey]);

  useImperativeHandle(ref, () => ({
    focusFirstMissing() {
      const rigIds = activeRigs.map((r) => r.id);
      const craneIds = activeCranes.map((c) => c.id);
      const missing = findFirstMissingTeamField(team, rigIds, craneIds);

      if (!missing) {
        setHighlightKey(null);
        return true;
      }

      const key = fieldKey(missing.role, missing.machineId);
      setHighlightKey(key);
      requestAnimationFrame(() => scrollToField(key));
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activeRigs, activeCranes, team, scrollToField]);

  function updateTeam(patch: Partial<ShiftTeamAssignment>) {
    const key = shiftSlot === 1 ? 'shift1' : 'shift2';
    onUpdate({
      checklistPersonnel: { ...draft.checklistPersonnel, [key]: { ...team, ...patch } },
    });
  }

  function setEngineer(machineId: string, personnelId: string | null) {
    const engineerByMachineId = { ...team.engineerByMachineId };
    if (personnelId) engineerByMachineId[machineId] = personnelId;
    else delete engineerByMachineId[machineId];
    updateTeam({ engineerByMachineId });
  }

  function setSupervisor(machineId: string, personnelId: string | null) {
    const supervisorByMachineId = { ...team.supervisorByMachineId };
    if (personnelId) supervisorByMachineId[machineId] = personnelId;
    else delete supervisorByMachineId[machineId];
    updateTeam({ supervisorByMachineId });
  }

  function setOperator(machineId: string, personnelId: string | null) {
    const operatorByMachineId = { ...team.operatorByMachineId };
    if (personnelId) operatorByMachineId[machineId] = personnelId;
    else delete operatorByMachineId[machineId];
    updateTeam({ operatorByMachineId });
  }

  const operatorCandidates = useMemo(() => {
    if (!pickerTarget || pickerTarget.role !== 'MACHINE_OPERATOR') return [];
    return getOperatorMachineCandidates(pickerTarget.type, personnel);
  }, [pickerTarget, personnel]);

  // ── Picker modal config, derived from whichever role/machine was tapped ──
  const pickerConfig = useMemo(() => {
    if (!pickerTarget) return null;
    switch (pickerTarget.role) {
      case 'SHIFT_INCHARGE':
        return {
          title: 'Assign Shift Incharge',
          personnel: shiftIncharges,
          selectedId: team.shiftInchargeId,
          allowNone: true,
          emptyLabel: 'No matching shift incharges synced for this site.',
          disabledDetails: toDisabledDetails(getShiftInchargeDisabledIds(otherTeam.shiftInchargeId)),
          onSelect: (id: string | null) => updateTeam({ shiftInchargeId: id }),
        };
      case 'ENGINEER':
        return {
          title: 'Assign Engineer',
          personnel: engineerOrSupervisorCandidates,
          selectedId: team.engineerByMachineId[pickerTarget.machineId] ?? null,
          allowNone: false,
          emptyLabel: 'No matching engineers synced for this site.',
          disabledDetails: toDisabledDetails(
            new Map([
              ...getMachineRoleDisabledIds(
                pickerTarget.machineId,
                team.engineerByMachineId,
                otherTeam.engineerByMachineId,
                { excludeSameShiftOtherMachines: false },
              ),
              ...getCrossRoleDisabledIds(team.supervisorByMachineId),
            ]),
          ),
          onSelect: (id: string | null) => setEngineer(pickerTarget.machineId, id),
        };
      case 'SUPERVISOR':
        return {
          title: 'Assign Supervisor',
          personnel: engineerOrSupervisorCandidates,
          selectedId: team.supervisorByMachineId[pickerTarget.machineId] ?? null,
          allowNone: true,
          emptyLabel: 'No matching supervisors synced for this site.',
          disabledDetails: toDisabledDetails(
            new Map([
              ...getMachineRoleDisabledIds(
                pickerTarget.machineId,
                team.supervisorByMachineId,
                otherTeam.supervisorByMachineId,
                { excludeSameShiftOtherMachines: false },
              ),
              ...getCrossRoleDisabledIds(team.engineerByMachineId),
            ]),
          ),
          onSelect: (id: string | null) => setSupervisor(pickerTarget.machineId, id),
        };
      case 'MACHINE_OPERATOR':
        return {
          title: 'Assign Operator',
          personnel: operatorCandidates,
          selectedId: team.operatorByMachineId[pickerTarget.machineId] ?? null,
          allowNone: true,
          emptyLabel: 'No matching machine operators synced for this site.',
          disabledDetails: toDisabledDetails(
            getMachineRoleDisabledIds(
              pickerTarget.machineId,
              team.operatorByMachineId,
              otherTeam.operatorByMachineId,
              { excludeSameShiftOtherMachines: true },
            ),
          ),
          onSelect: (id: string | null) => setOperator(pickerTarget.machineId, id),
        };
    }
  }, [
    pickerTarget,
    shiftIncharges,
    engineerOrSupervisorCandidates,
    operatorCandidates,
    team,
    otherTeam,
    machineNoFor,
    currentShiftLabel,
    otherShiftLabel,
  ]);

  return (
    <>
      <View style={styles.shiftHeadingRow}>
        <Text style={styles.shiftHeadingText} numberOfLines={1}>
          {currentShiftLabel}
        </Text>
      </View>

      <GlassCard style={styles.cardOuter}>
        <View style={styles.group}>
          <Text style={styles.sectionLabel}>Shift Incharge</Text>
          <TeamRow
            icon={<Users size={16} color={colors.accent} />}
            label="Shift Incharge"
            assigneeName={personnel.find((p) => p.id === team.shiftInchargeId)?.name ?? null}
            onPress={() => setPickerTarget({ role: 'SHIFT_INCHARGE' })}
          />
        </View>

        <View style={[styles.group, styles.groupDivider]}>
          <Text style={styles.sectionLabel}>Engineers</Text>
          {activeRigs.length === 0 ? (
            <Text style={styles.emptyText}>No active rigs — go back and activate at least one rig.</Text>
          ) : (
            activeRigs.map((r) => (
              <TeamRow
                key={r.id}
                rowRef={registerField(fieldKey('ENGINEER', r.id))}
                highlighted={highlightKey === fieldKey('ENGINEER', r.id)}
                icon={<Drill size={16} color={colors.accent} />}
                label={r.machineNo}
                assigneeName={personnel.find((p) => p.id === team.engineerByMachineId[r.id])?.name ?? null}
                onPress={() => setPickerTarget({ role: 'ENGINEER', machineId: r.id })}
              />
            ))
          )}
        </View>

        <View style={[styles.group, styles.groupDivider]}>
          <Text style={styles.sectionLabel}>Supervisors (Optional)</Text>
          {activeRigs.length === 0 ? (
            <Text style={styles.emptyText}>No active rigs — go back and activate at least one rig.</Text>
          ) : (
            activeRigs.map((r) => (
              <TeamRow
                key={r.id}
                rowRef={registerField(fieldKey('SUPERVISOR', r.id))}
                highlighted={highlightKey === fieldKey('SUPERVISOR', r.id)}
                icon={<Drill size={16} color={colors.accent} />}
                label={r.machineNo}
                assigneeName={personnel.find((p) => p.id === team.supervisorByMachineId[r.id])?.name ?? null}
                onPress={() => setPickerTarget({ role: 'SUPERVISOR', machineId: r.id })}
              />
            ))
          )}
        </View>

        <View style={[styles.group, styles.groupDivider]}>
          <Text style={styles.sectionLabel}>Rig Operators</Text>
          {activeRigs.length === 0 ? (
            <Text style={styles.emptyText}>No active rigs — go back and activate at least one rig.</Text>
          ) : (
            activeRigs.map((r) => (
              <TeamRow
                key={r.id}
                rowRef={registerField(fieldKey('MACHINE_OPERATOR', r.id))}
                highlighted={highlightKey === fieldKey('MACHINE_OPERATOR', r.id)}
                icon={<Drill size={16} color={colors.accent} />}
                label={r.machineNo}
                assigneeName={personnel.find((p) => p.id === team.operatorByMachineId[r.id])?.name ?? null}
                onPress={() => setPickerTarget({ role: 'MACHINE_OPERATOR', machineId: r.id, type: 'RIG' })}
              />
            ))
          )}
        </View>

        <View style={[styles.group, styles.groupDivider]}>
          <Text style={styles.sectionLabel}>Crane Operators</Text>
          {activeCranes.length === 0 ? (
            <Text style={styles.emptyText}>No active cranes — go back and activate at least one crane.</Text>
          ) : (
            activeCranes.map((c) => (
              <TeamRow
                key={c.id}
                rowRef={registerField(fieldKey('MACHINE_OPERATOR', c.id))}
                highlighted={highlightKey === fieldKey('MACHINE_OPERATOR', c.id)}
                icon={<Forklift size={16} color={colors.accent} />}
                label={c.machineNo}
                assigneeName={personnel.find((p) => p.id === team.operatorByMachineId[c.id])?.name ?? null}
                onPress={() => setPickerTarget({ role: 'MACHINE_OPERATOR', machineId: c.id, type: 'CRANE' })}
              />
            ))
          )}
        </View>
      </GlassCard>

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
            allowNone={pickerConfig.allowNone}
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
  shiftHeadingRow: {
    marginBottom: spacing.md,
  },
  shiftHeadingText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardOuter: { marginBottom: spacing.sm },
  group: { marginBottom: spacing.sm },
  groupDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  machineTeamRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28,28,46,0.04)',
    marginBottom: spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  machineTeamRowHighlighted: {
    borderColor: colors.danger,
  },
  machineTeamTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  machineTeamBottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  machineIcon: { width: 24, alignItems: 'center' },
  machineTeamNo: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
