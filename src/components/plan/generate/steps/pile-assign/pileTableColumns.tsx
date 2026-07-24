// Column + row-action definitions for the pile IndexTable — split out of
// PileAssignStep so that file stays focused on state, not render config.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { IndexTableColumn, IndexTableAction } from '@components/shared/IndexTable';
import type { EligiblePile, MachineKind } from './types';
import type { PlanDraft } from '@/types/plan';

interface BuildColumnsArgs {
  assignments: PlanDraft['assignments'];
  machineLabel: (kind: MachineKind, machineId: string) => string;
  activeAreaId: string;
  areaNameById: Map<string, string>;
}

export function buildColumns({
  assignments, machineLabel, activeAreaId, areaNameById,
}: BuildColumnsArgs): IndexTableColumn<EligiblePile>[] {
  return [
    {
      key: 'pile',
      header: 'Pile',
      render: (p) => (
        <>
          <Text style={styles.code}>{p.code}</Text>
          <Text style={styles.spec}>Ø{p.dia}mm · {p.depth}m</Text>
          {activeAreaId === 'all' && p.areaId && areaNameById.get(p.areaId) && (
            <View style={styles.areaPill}>
              <Text style={styles.areaPillText}>{areaNameById.get(p.areaId)}</Text>
            </View>
          )}
        </>
      ),
    },
    {
      key: 'machines',
      header: 'Machines',
      width: 140,
      render: (p) => {
        const asgn = assignments[p.id];
        const rigLabel = asgn?.rig ? machineLabel('rig', asgn.rig) : null;
        const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;
        return rigLabel && craneLabel ? (
          <View style={styles.pillRow}>
            <View style={styles.pill}><Text style={styles.pillText}>{rigLabel}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>{craneLabel}</Text></View>
          </View>
        ) : (
          <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>
        );
      },
    },
  ];
}

export function buildRowActions(args: {
  isPileFullyAssigned: (id: string) => boolean;
  onAssign: (id: string) => void;
  onViewDetails: (p: EligiblePile) => void;
  onUnassign: (id: string) => void;
}): IndexTableAction<EligiblePile>[] {
  return [
    { label: 'Assign machines', onPress: (p) => args.onAssign(p.id) },
    { label: 'View details', onPress: (p) => args.onViewDetails(p) },
    { label: 'Unassign', danger: true, show: (p) => args.isPileFullyAssigned(p.id), onPress: (p) => args.onUnassign(p.id) },
  ];
}

const styles = StyleSheet.create({
  code: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  pillText: { ...typography.caption, fontWeight: '600', color: colors.accent },
  pillEmpty: { borderWidth: 1, borderColor: 'rgba(28,28,46,0.15)', borderStyle: 'dashed', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },
  areaPill: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: 'rgba(28,28,46,0.06)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  areaPillText: { ...typography.caption, fontSize: 10, fontWeight: '600', color: colors.textSecondary },
});