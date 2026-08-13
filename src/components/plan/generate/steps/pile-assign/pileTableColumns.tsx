// Column + row-action definitions for the pile IndexTable — split out of
// PileAssignStep so that file stays focused on state, not render config.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { IndexTableColumn } from '@components/shared/IndexTable';
import type { EligiblePile, MachineKind } from './types';
import type { PlanDraft } from '@/types/plan';

interface BuildColumnsArgs {
  assignments: PlanDraft['assignments'];
  machineLabel: (kind: MachineKind, machineId: string) => string;
}

export function buildColumns({
  assignments, machineLabel,
}: BuildColumnsArgs): IndexTableColumn<EligiblePile>[] {
  return [
    {
      key: 'pile',
      header: 'Pile',
      render: (p) => (
        <>
          <Text style={styles.code}>{p.code}</Text>
          <Text style={styles.spec}>Ø{p.dia}mm · {p.depth}m</Text>
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
            <View style={[styles.machineBadge, { backgroundColor: colors.machines.rig.soft, borderColor: colors.machines.rig.color }]}>
              <Text style={[styles.machineBadgeText, { color: colors.machines.rig.color }]}>{rigLabel}</Text>
            </View>
            <View style={[styles.machineBadge, { backgroundColor: colors.machines.crane.soft, borderColor: colors.machines.crane.color }]}>
              <Text style={[styles.machineBadgeText, { color: colors.machines.crane.color }]}>{craneLabel}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>
        );
      },
    },
  ];
}

const styles = StyleSheet.create({
  code: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pillRow: { flexDirection: 'column', gap: spacing.xs },
  machineBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  machineBadgeText: { ...typography.caption, fontWeight: '700' },
  pillEmpty: { borderWidth: 1, borderColor: 'rgba(28,28,46,0.15)', borderStyle: 'dashed', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },
});