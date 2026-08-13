// src/components/plan/generate/steps/TeamAssignStep.tsx
//
// Shift Incharge, Engineers, Supervisors, and Machine Operators — all
// assigned per shift, in one open card (no per-section collapse). Merges
// the former separate TeamAssignStep + ShiftInchargeStep into one screen: a
// Shift 1 / Shift 2 tab switch (local UI state, not persisted) selects
// which shift's roster is being edited. Supervisors are rig-only now — no
// crane pairing, no "1 rig max" cap; one supervisor may cover any number
// of rigs.
//
// Exposes an imperative handle (focusFirstMissing) so GeneratePlanScreen's
// Continue button can, instead of just staying disabled, jump the user to
// whichever shift/row is still unfilled.

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
  getOperatorMachineCandidates,
  getMachineRoleDisabledIds,
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
  /**
   * True if both shifts are fully staffed. If not, switches to the first
   * incomplete shift's tab, scrolls to and highlights its first missing
   * row, and returns false.
   */
  focusFirstMissing: () => boolean;
}

interface TeamAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
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
  activeRigs,
  activeCranes,
  personnel,
  shifts,
  scrollViewRef,
  scrollYRef,
}, ref) {
  const [activeTab, setActiveTab] = useState<1 | 2>(1);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const { registerField, scrollToField } = useScrollToField(scrollViewRef, scrollYRef);

  const shift1 = shifts[0];
  const shift2 = shifts[1];
  const tab1Label = shift1 ? `${shift1.name}` : 'Shift 1 (Day)';
  const tab2Label = shift2 ? `${shift2.name}` : 'Shift 2 (Night)';
  const currentShiftLabel = activeTab === 1 ? tab1Label : tab2Label;
  const otherShiftLabel = activeTab === 1 ? tab2Label : tab1Label;

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
  const engineers = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('ENGINEER', p.designation)),
    [personnel],
  );
  const supervisors = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('SUPERVISOR', p.designation)),
    [personnel],
  );

  const team = activeTab === 1 ? draft.checklistPersonnel.shift1 : draft.checklistPersonnel.shift2;
  // The shift NOT currently being edited — used to disable (not hide) anyone already
  // assigned to the same role there, since nobody can work both shifts.
  const otherTeam = activeTab === 1 ? draft.checklistPersonnel.shift2 : draft.checklistPersonnel.shift1;

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
      const missingShift1 = findFirstMissingTeamField(draft.checklistPersonnel.shift1, rigIds, craneIds);
      const missingShift2 = findFirstMissingTeamField(draft.checklistPersonnel.shift2, rigIds, craneIds);

      const target = missingShift1
        ? { tab: 1 as const, field: missingShift1 }
        : missingShift2
          ? { tab: 2 as const, field: missingShift2 }
          : null;

      if (!target) {
        setHighlightKey(null);
        return true;
      }

      const key = fieldKey(target.field.role, target.field.machineId);
      setActiveTab(target.tab);
      setHighlightKey(key);
      requestAnimationFrame(() => scrollToField(key));
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activeRigs, activeCranes, draft.checklistPersonnel, scrollToField]);

  function updateTeam(patch: Partial<ShiftTeamAssignment>) {
    const key = activeTab === 1 ? 'shift1' : 'shift2';
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
          personnel: engineers,
          selectedId: team.engineerByMachineId[pickerTarget.machineId] ?? null,
          allowNone: false,
          emptyLabel: 'No matching engineers synced for this site.',
          disabledDetails: toDisabledDetails(
            getMachineRoleDisabledIds(
              pickerTarget.machineId,
              team.engineerByMachineId,
              otherTeam.engineerByMachineId,
              { excludeSameShiftOtherMachines: false },
            ),
          ),
          onSelect: (id: string | null) => setEngineer(pickerTarget.machineId, id),
        };
      case 'SUPERVISOR':
        return {
          title: 'Assign Supervisor',
          personnel: supervisors,
          selectedId: team.supervisorByMachineId[pickerTarget.machineId] ?? null,
          allowNone: true,
          emptyLabel: 'No matching supervisors synced for this site.',
          disabledDetails: toDisabledDetails(
            getMachineRoleDisabledIds(
              pickerTarget.machineId,
              team.supervisorByMachineId,
              otherTeam.supervisorByMachineId,
              { excludeSameShiftOtherMachines: false },
            ),
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
    engineers,
    supervisors,
    operatorCandidates,
    team,
    otherTeam,
    machineNoFor,
    currentShiftLabel,
    otherShiftLabel,
  ]);

  return (
    <>
      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, activeTab === 1 && styles.tabActive]} onPress={() => setActiveTab(1)}>
          <Text style={[styles.tabText, activeTab === 1 && styles.tabTextActive]} numberOfLines={1}>
            {tab1Label}
          </Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 2 && styles.tabActive]} onPress={() => setActiveTab(2)}>
          <Text style={[styles.tabText, activeTab === 2 && styles.tabTextActive]} numberOfLines={1}>
            {tab2Label}
          </Text>
        </Pressable>
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
          <Text style={styles.sectionLabel}>Supervisors</Text>
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
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
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
