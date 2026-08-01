// src/components/plan/generate/preview/CoreTeamAccordion.tsx
//
// Merged "Core Team" card: Leadership, Shift Incharge, and per-machine
// Engineer/Supervisor/Operator teams, in one accordion. Shared between the
// generate-plan wizard's Preview step (rows tappable via `onPressRole`, to
// open a picker modal there) and PlanDetailScreen (read-only — `onPressRole`
// omitted, so rows render as static, non-interactive).

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Users, Drill, Forklift } from 'lucide-react-native';
import SummaryAccordion from './SummaryAccordion';
import Avatar from '@components/shared/Avatar';
import Divider from '@components/shared/Divider';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { getMachineColor, buildTypeIndexById } from '@/utils/helpers';

export interface LeadershipDetail {
  pmName: string | null;
  pmDesignation: string | null;
  peName: string | null;
  peDesignation: string | null;
}

export interface ShiftInchargeDetail {
  shift1Label: string;
  shift1Name: string | null;
  shift1Designation: string | null;
  shift2Label: string;
  shift2Name: string | null;
  shift2Designation: string | null;
}

export interface MachineTeamDetail {
  id: string;
  machineNo: string;
  type: 'RIG' | 'CRANE' | 'COMPRESSOR';
  engineerName: string | null;
  supervisorName: string | null;
  operatorName: string | null;
}

export type RoleTarget =
  | { role: 'PROJECT_MANAGER' | 'PLANNING_ENGINEER' }
  | { role: 'SHIFT_INCHARGE'; slot: 1 | 2 }
  | { role: 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR'; machineId: string };

interface CoreTeamAccordionProps {
  leadership: LeadershipDetail;
  shiftIncharge: ShiftInchargeDetail;
  machineTeams: MachineTeamDetail[];
  defaultOpen?: boolean;
  /** Omit for read-only screens — rows render as static, non-interactive. */
  onPressRole?: (target: RoleTarget) => void;
}

// ─── Row components ─────────────────────────────────────────────────────────

function TeamPersonRow({
  name,
  designation,
  tone,
  badgeText,
  onPress,
}: {
  name: string | null;
  designation: string | null;
  tone: 'neutral' | 'day' | 'night';
  badgeText?: string;
  onPress?: () => void;
}) {
  const assigned = !!name;
  return (
    <Pressable
      style={[
        styles.personRow,
        tone === 'day' ? styles.personRowDay : tone === 'night' ? styles.personRowNight : styles.personRowNeutral,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Avatar name={name} size={40} />
      <View style={styles.personInfo}>
        <Text style={[styles.personName, !assigned && styles.personNameEmpty]}>
          {assigned ? name : 'None assigned'}
        </Text>
        {assigned && designation ? <Text style={styles.personDesignation}>{designation}</Text> : null}
      </View>
      {badgeText ? (
        <View style={[styles.personBadge, tone === 'night' ? styles.personBadgeNight : styles.personBadgeDay]}>
          <Text
            style={[styles.personBadgeText, tone === 'night' ? styles.personBadgeTextNight : styles.personBadgeTextDay]}
          >
            {badgeText}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function MachineRoleAvatar({
  label,
  name,
  highlight = false,
  onPress,
}: {
  label: string;
  name: string | null;
  highlight?: boolean;
  onPress?: () => void;
}) {
  const assigned = !!name;
  return (
    <Pressable style={styles.roleSlot} onPress={onPress} disabled={!onPress}>
      <Avatar name={name} size={36} variant={highlight ? 'filled' : 'outline'} />
      <Text style={[styles.roleSlotName, !assigned && styles.roleSlotNameEmpty]} numberOfLines={1}>
        {assigned ? name : 'Not assigned'}
      </Text>
      <Text style={styles.roleSlotLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CoreTeamAccordion({
  leadership,
  shiftIncharge,
  machineTeams,
  defaultOpen,
  onPressRole,
}: CoreTeamAccordionProps) {
  const typeIndexById = useMemo(() => buildTypeIndexById(machineTeams), [machineTeams]);

  const summary =
    [leadership.pmName, leadership.peName, shiftIncharge.shift1Name, shiftIncharge.shift2Name]
      .filter(Boolean)
      .join(' · ') || 'None assigned';

  return (
    <SummaryAccordion
      icon={<Users size={18} color={colors.accent} />}
      title="Core Team"
      summary={summary}
      defaultOpen={defaultOpen}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Leadership</Text>
      </View>
      <TeamPersonRow
        name={leadership.pmName}
        designation={leadership.pmDesignation}
        tone="neutral"
        onPress={onPressRole ? () => onPressRole({ role: 'PROJECT_MANAGER' }) : undefined}
      />
      <TeamPersonRow
        name={leadership.peName}
        designation={leadership.peDesignation}
        tone="neutral"
        onPress={onPressRole ? () => onPressRole({ role: 'PLANNING_ENGINEER' }) : undefined}
      />

      <Divider marginVertical={spacing.sm} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Shift Incharge</Text>
      </View>
      <TeamPersonRow
        name={shiftIncharge.shift1Name}
        designation={shiftIncharge.shift1Designation}
        tone="day"
        badgeText="Day"
        onPress={onPressRole ? () => onPressRole({ role: 'SHIFT_INCHARGE', slot: 1 }) : undefined}
      />
      <TeamPersonRow
        name={shiftIncharge.shift2Name}
        designation={shiftIncharge.shift2Designation}
        tone="night"
        badgeText="Night"
        onPress={onPressRole ? () => onPressRole({ role: 'SHIFT_INCHARGE', slot: 2 }) : undefined}
      />

      <Divider marginVertical={spacing.sm} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Machine Teams</Text>
      </View>
      {machineTeams.length === 0 ? (
        <Text style={styles.emptyText}>No active machines.</Text>
      ) : (
        machineTeams.map((m) => (
          <View key={m.id} style={styles.machineBlock}>
            <View style={styles.machineHeader}>
              {m.type === 'RIG' ? (
                <Drill size={14} color={colors.accent} />
              ) : (
                <Forklift size={14} color={getMachineColor(m, typeIndexById[m.id] ?? 0)} />
              )}
              <Text style={styles.machineTitle}>{m.machineNo}</Text>
            </View>
            <View style={styles.machineRolesRow}>
              {m.type === 'RIG' ? (
                <MachineRoleAvatar
                  label="Engineer"
                  name={m.engineerName}
                  highlight
                  onPress={onPressRole ? () => onPressRole({ role: 'ENGINEER', machineId: m.id }) : undefined}
                />
              ) : (
                <View style={styles.roleSlot} />
              )}
              <MachineRoleAvatar
                label="Supervisor"
                name={m.supervisorName}
                onPress={onPressRole ? () => onPressRole({ role: 'SUPERVISOR', machineId: m.id }) : undefined}
              />
              <MachineRoleAvatar
                label="Operator"
                name={m.operatorName}
                onPress={onPressRole ? () => onPressRole({ role: 'MACHINE_OPERATOR', machineId: m.id }) : undefined}
              />
            </View>
          </View>
        ))
      )}
    </SummaryAccordion>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { marginBottom: spacing.xs },
  sectionHeaderText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  // Leadership / Shift Incharge rows
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  personRowNeutral: {
    backgroundColor: 'rgba(28,28,46,0.03)',
    borderColor: colors.border,
  },
  personRowDay: {
    backgroundColor: 'rgba(249,115,22,0.05)',
    borderColor: 'rgba(249,115,22,0.15)',
  },
  personRowNight: {
    backgroundColor: 'rgba(79,70,229,0.05)',
    borderColor: 'rgba(79,70,229,0.15)',
  },
  personInfo: { flex: 1 },
  personName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  personNameEmpty: { color: colors.textSecondary, fontStyle: 'italic', fontWeight: '400' },
  personDesignation: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  personBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  personBadgeDay: { backgroundColor: 'rgba(249,115,22,0.15)' },
  personBadgeNight: { backgroundColor: 'rgba(79,70,229,0.15)' },
  personBadgeText: { ...typography.caption, fontWeight: '700', fontSize: 10 },
  personBadgeTextDay: { color: '#c2410c' },
  personBadgeTextNight: { color: '#4338ca' },

  // Machine Teams
  machineBlock: { marginBottom: spacing.md },
  machineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  machineTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  machineRolesRow: {
    flexDirection: 'row',
  },
  roleSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
  },
  roleSlotName: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  roleSlotNameEmpty: { color: colors.textSecondary, fontStyle: 'italic', fontWeight: '400' },
  roleSlotLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
