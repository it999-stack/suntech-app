// src/components/plan/generate/preview/CoreTeamAccordion.tsx
//
// Merged "Core Team" card: Leadership, Shift Incharge, and per-machine
// Engineer/Supervisor/Operator teams, in one accordion. Shared between the
// generate-plan wizard's Preview step (rows tappable via `onPressRole`, to
// open a picker modal there) and PlanDetailScreen (read-only — `onPressRole`
// omitted, so rows render as static, non-interactive).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import SummaryAccordion from './SummaryAccordion';
import Avatar from '@components/shared/Avatar';
import Divider from '@components/shared/Divider';
import InfoRow from '@components/shared/InfoRow';
import MachineBadge from '@components/shared/MachineBadge';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { formatDesignation } from '@/utils/personnelRoles';

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
  engineerName1: string | null;
  engineerName2: string | null;
  supervisorName1: string | null;
  supervisorName2: string | null;
  operatorName1: string | null;
  operatorName2: string | null;
}

export type RoleTarget =
  | { role: 'PROJECT_MANAGER' | 'PLANNING_ENGINEER' }
  | { role: 'SHIFT_INCHARGE'; slot: 1 | 2 }
  | { role: 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR'; machineId: string; slot: 1 | 2 };

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
  label,
  tone,
  badgeText,
  onPress,
}: {
  name: string | null;
  designation: string | null;
  label: string;
  tone: 'neutral' | 'day' | 'night';
  badgeText?: string;
  onPress?: () => void;
}) {
  const assigned = !!name;
  return (
    <InfoRow
      leading={<Avatar name={name} size={40} />}
      title={assigned ? name! : 'None assigned'}
      titleMuted={!assigned}
      caption={assigned && designation ? formatDesignation(designation) : label}
      tone={tone}
      onPress={onPress}
      trailing={
        badgeText ? (
          <View style={[styles.personBadge, tone === 'night' ? styles.personBadgeNight : styles.personBadgeDay]}>
            <Text
              style={[styles.personBadgeText, tone === 'night' ? styles.personBadgeTextNight : styles.personBadgeTextDay]}
            >
              {badgeText}
            </Text>
          </View>
        ) : undefined
      }
    />
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
  return (
    <SummaryAccordion
      icon={<Users size={18} color={colors.accent} />}
      title="Core Team"
      summary="Team members assigned to today's plan"
      defaultOpen={defaultOpen}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Leadership</Text>
      </View>
      <TeamPersonRow
        name={leadership.pmName}
        designation={leadership.pmDesignation}
        label="Project Manager"
        tone="neutral"
        onPress={onPressRole ? () => onPressRole({ role: 'PROJECT_MANAGER' }) : undefined}
      />
      <TeamPersonRow
        name={leadership.peName}
        designation={leadership.peDesignation}
        label="Planning Engineer"
        tone="neutral"
        onPress={onPressRole ? () => onPressRole({ role: 'PLANNING_ENGINEER' }) : undefined}
      />

      <Divider marginVertical={spacing.md} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Shift Incharge</Text>
      </View>
      <TeamPersonRow
        name={shiftIncharge.shift1Name}
        designation={shiftIncharge.shift1Designation}
        label="Shift Incharge"
        tone="day"
        badgeText="Day"
        onPress={onPressRole ? () => onPressRole({ role: 'SHIFT_INCHARGE', slot: 1 }) : undefined}
      />
      <TeamPersonRow
        name={shiftIncharge.shift2Name}
        designation={shiftIncharge.shift2Designation}
        label="Shift Incharge"
        tone="night"
        badgeText="Night"
        onPress={onPressRole ? () => onPressRole({ role: 'SHIFT_INCHARGE', slot: 2 }) : undefined}
      />

      <Divider marginVertical={spacing.md} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Machine Teams</Text>
      </View>
      {machineTeams.length === 0 ? (
        <Text style={styles.emptyText}>No active machines.</Text>
      ) : (
        machineTeams.map((m) => {
          const operatorLabel =
            m.type === 'RIG' ? 'Rig Operator' : m.type === 'CRANE' ? 'Crane Operator' : 'Compressor Operator';
          const roles = m.type === 'RIG'
            ? [
                { role: 'ENGINEER' as const, label: 'Engineer', name1: m.engineerName1, name2: m.engineerName2 },
                { role: 'SUPERVISOR' as const, label: 'Supervisor', name1: m.supervisorName1, name2: m.supervisorName2 },
                { role: 'MACHINE_OPERATOR' as const, label: operatorLabel, name1: m.operatorName1, name2: m.operatorName2 },
              ]
            : [{ role: 'MACHINE_OPERATOR' as const, label: operatorLabel, name1: m.operatorName1, name2: m.operatorName2 }];

          return (
            <View key={m.id} style={styles.machineBlock}>
              <View style={styles.machineHeader}>
                <MachineBadge track={m.type} label={m.machineNo} />
              </View>

              {([1, 2] as const).map((slot) => (
                <React.Fragment key={slot}>
                  {slot === 2 ? (
                    <Divider style={{ marginTop: spacing.md - spacing.sm, marginBottom: spacing.md }} />
                  ) : null}
                  {roles.map((r) => (
                    <TeamPersonRow
                      key={r.role}
                      name={slot === 1 ? r.name1 : r.name2}
                      designation={null}
                      label={r.label}
                      tone={slot === 1 ? 'day' : 'night'}
                      badgeText={slot === 1 ? 'Day' : 'Night'}
                      onPress={onPressRole ? () => onPressRole({ role: r.role, machineId: m.id, slot }) : undefined}
                    />
                  ))}
                </React.Fragment>
              ))}
            </View>
          )
        }
        )
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

  // Leadership / Shift Incharge row badges (row shell itself lives in shared InfoRow)
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
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
