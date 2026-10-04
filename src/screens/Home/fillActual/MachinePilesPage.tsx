// src/screens/Home/fillActual/MachinePilesPage.tsx
//
// One machine's page inside the badge pager.

import React, { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@theme/theme';
import PileSequenceRow from '@components/plan/actual/PileSequenceRow';
import MachineInfoCard from './MachineInfoCard';
import type { CardEventType } from './useMachineEventActions';
import type { OpenIdleSession } from './useMachineEvents';
import type { MachineBadge } from './useMachinePages';
import type { PileGroup } from '@app-types/plan';

interface MachinePilesPageProps {
  machine: MachineBadge;
  status: string | undefined;
  railColor: string;
  groups: PileGroup[];
  frontPileId: string | undefined;
  openIdle?: OpenIdleSession;
  hasActiveStep: boolean;
  onOpenPile: (checklistPileId: string) => void;
  /** One stable function for all three machine-card quick actions — bound
   * to this page's own machine below via useCallback, instead of the
   * caller passing three already-bound closures, which would get a new
   * identity every render and defeat this component's memo (see below). */
  onMachineEvent: (machineId: string, track: 'RIG' | 'CRANE', eventType: CardEventType) => void;
  onEditSequence: () => void;
}

// Memoized because SwipeableTabBar's PagerView mounts every machine's page
// up front (needed for swipe), so without this every machine would
// re-render on any unrelated screen state change (e.g. opening another
// pile's PileStepsModal, or logging a step on a different machine's pile).
const MachinePilesPage = React.memo(function MachinePilesPage({
  machine,
  status,
  railColor,
  groups,
  frontPileId,
  openIdle,
  hasActiveStep,
  onOpenPile,
  onMachineEvent,
  onEditSequence,
}: MachinePilesPageProps) {
  const onBreakdown = useCallback(
    () => onMachineEvent(machine.id, machine.type, 'BREAKDOWN'),
    [onMachineEvent, machine.id, machine.type],
  );
  const onStartIdle = useCallback(
    () => onMachineEvent(machine.id, machine.type, 'IDLE_START'),
    [onMachineEvent, machine.id, machine.type],
  );
  const onEndIdle = useCallback(
    () => onMachineEvent(machine.id, machine.type, 'IDLE_END'),
    [onMachineEvent, machine.id, machine.type],
  );

  return (
    <View style={styles.machinePage}>
      {/* Fixed — outside the scrollable area below, so it stays put while
          the pile list (whose length varies wildly per machine) scrolls
          on its own instead of the whole page growing/shrinking to fit it. */}
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

      {groups.length > 0 && (
        <ScrollView style={styles.sequenceScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionHeader}>Pile Sequence ({groups.length} piles)</Text>
          <View style={styles.sequenceList}>
            {groups.map((group, i) => (
              <PileSequenceRow
                key={group.checklistPileId}
                index={i + 1}
                pileCode={group.pileCode}
                locationName={group.locationName}
                dimensionLabel={group.dimensionLabel}
                steps={group.steps}
                circleVariant={group.checklistPileId === frontPileId ? 'upNext' : 'rail'}
                railColor={railColor}
                onPress={() => onOpenPile(group.checklistPileId)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
});

export default MachinePilesPage;

const styles = StyleSheet.create({
  machinePage: {
    flex: 1,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  sequenceScroll: {
    flex: 1,
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
    paddingBottom: spacing.xxxl,
  },
});
