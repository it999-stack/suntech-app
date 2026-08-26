// Column + row-action definitions for the pile IndexTable — split out of
// PileAssignStep so that file stays focused on state, not render config.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import Badge from '@components/shared/Badge';
import MachineBadge from '@components/shared/MachineBadge';
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
        if (!rigLabel) {
          if (p.completed) {
            return <Badge icon={CircleCheck} text="Completed" textColor={colors.success} bgColor={colors.successSoft} fontSize={12} />;
          }
          return <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>;
        }
        return (
          <View style={styles.pillRow}>
            <MachineBadge track="RIG" label={rigLabel} />
            {craneLabel ? (
              <MachineBadge track="CRANE" label={craneLabel} />
            ) : (
              <MachineBadge track="RIG" label="Rig only" muted />
            )}
          </View>
        );
      },
    },
  ];
}

const styles = StyleSheet.create({
  code: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  completedText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pillEmpty: { borderWidth: 1, borderColor: 'rgba(28,28,46,0.15)', borderStyle: 'dashed', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },
});