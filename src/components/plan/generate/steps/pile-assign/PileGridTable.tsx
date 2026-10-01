// src/components/plan/generate/steps/pile-assign/PileGridTable.tsx
//
// Two-column card grid for the pile-assign step. Drop-in replacement for the
// old IndexTable usage there (same selection / disabled / footer contract),
// but each pile is a card that always shows its location.

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import Badge from '@components/shared/Badge';
import MachineBadge from '@components/shared/MachineBadge';
import type { PlanDraft } from '@/types/plan';
import type { EligiblePile, MachineKind } from './types';
import PileCard from './PileCard';

interface PileGridTableProps {
  data: EligiblePile[];
  assignments: PlanDraft['assignments'];
  machineLabel: (kind: MachineKind, machineId: string) => string;
  /** Resolves a pile's locationId to its display name, e.g. "Tower Grid". */
  locationLabel: (locationId: string | null) => string | null;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  emptyText?: string;
  footer?: React.ReactElement | null;
}

function PileMachines({ pile, assignments, machineLabel }: Pick<PileGridTableProps, 'assignments' | 'machineLabel'> & { pile: EligiblePile }) {
  const asgn = assignments[pile.id];
  const rigLabel = asgn?.rig ? machineLabel('rig', asgn.rig) : null;
  const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;

  if (!rigLabel) {
    if (pile.completed) {
      return <Badge icon={CircleCheck} text="Completed" textColor={colors.success} bgColor={colors.successSoft} fontSize={12} />;
    }
    return <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>;
  }
  return (
    <View style={styles.pillRow}>
      <MachineBadge track="RIG" label={rigLabel} />
      {craneLabel ? <MachineBadge track="CRANE" label={craneLabel} /> : <MachineBadge track="RIG" label="Rig only" muted />}
    </View>
  );
}

export default function PileGridTable({
  data, assignments, machineLabel, locationLabel, selectedIds, onToggleRow,
  emptyText = 'No items found.', footer,
}: PileGridTableProps) {
  function renderCard({ item }: { item: EligiblePile }) {
    return (
      <PileCard
        pile={item}
        location={locationLabel(item.locationId)}
        selectable
        selected={selectedIds.has(item.id)}
        disabled={!!item.completed}
        onPress={() => onToggleRow(item.id)}
        style={styles.card}
        // Full card width, so a rig + crane badge pair fits on one line.
        footer={<PileMachines pile={item} assignments={assignments} machineLabel={machineLabel} />}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
      />
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  content: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: { justifyContent: 'space-between' },
  footer: { paddingVertical: spacing.sm },

  card: { width: '48.5%' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pillEmpty: {
    borderWidth: 1,
    borderColor: 'rgba(28,28,46,0.15)',
    borderStyle: 'dashed',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },

  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginVertical: spacing.lg },
});
