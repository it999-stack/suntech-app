// src/screens/Home/fillActual/MachinePilesPage.tsx
//
// One machine's page inside the badge pager. Memoized because SwipeableTabBar's PagerView
// mounts every machine's page up front (needed for swipe), so without this every machine
// would re-render on any unrelated change (e.g. another pile's step being logged).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@theme/theme';
import PileSequenceRow from '@components/plan/actual/PileSequenceRow';
import MachineInfoCard from './MachineInfoCard';
import type { OpenIdleSession } from './useMachineEvents';
import type { MachineBadge } from './useMachinePages';
import type { PileGroup } from '@app-types/plan';

interface MachinePilesPageProps {
  machine: MachineBadge;
  status: string | undefined;
  railColor: string;
  activeGroups: PileGroup[];
  upcomingGroups: PileGroup[];
  openIdle?: OpenIdleSession;
  hasActiveStep: boolean;
  onOpenPile: (checklistPileId: string) => void;
  onBreakdown: () => void;
  onStartIdle: () => void;
  onEndIdle: () => void;
  onEditSequence: () => void;
}

const MachinePilesPage = React.memo(function MachinePilesPage({
  machine,
  status,
  railColor,
  activeGroups,
  upcomingGroups,
  openIdle,
  hasActiveStep,
  onOpenPile,
  onBreakdown,
  onStartIdle,
  onEndIdle,
  onEditSequence,
}: MachinePilesPageProps) {
  const sequenceGroups = [...activeGroups, ...upcomingGroups];
  const hasUpNext = activeGroups.length > 0;

  return (
    <View style={styles.machinePage}>
      <MachineInfoCard
        machine={machine}
        status={status}
        openIdle={openIdle}
        hasActiveStep={hasActiveStep}
        onEditSequence={onEditSequence}
        onBreakdown={onBreakdown}
        onStartIdle={onStartIdle}
        onEndIdle={onEndIdle}
      />

      {sequenceGroups.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Pile Sequence</Text>
          <View style={styles.sequenceList}>
            {sequenceGroups.map((group, i) => (
              <PileSequenceRow
                key={group.checklistPileId}
                index={i + 1}
                pileCode={group.pileCode}
                rigs={group.rigs}
                cranes={group.cranes}
                steps={group.steps}
                circleVariant={hasUpNext && i === 0 ? 'upNext' : 'rail'}
                railColor={railColor}
                onPress={() => onOpenPile(group.checklistPileId)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
});

export default MachinePilesPage;

const styles = StyleSheet.create({
  machinePage: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  sequenceList: {
    gap: 0,
  },
});
