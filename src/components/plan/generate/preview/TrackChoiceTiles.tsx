// src/components/plan/generate/preview/TrackChoiceTiles.tsx
//
// Square tile(s) showing which machine executes a step. For a CRANE-track step,
// two tiles let the user pick: the pile's Rig (capable of any Crane step) or the
// pile's Crane (default) — craneMachineNo/onSelect omitted renders a single,
// non-interactive Rig tile instead, for RIG-track steps (no alternative to offer)
// and for read-only screens. Selection is purely visual state passed in — callers
// batch taps locally and apply them all at once (see GeneratePlanScreen's
// pendingTrackOverrides + Confirm action), so tapping here never recomputes anything.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Drill, Forklift } from 'lucide-react-native';
import { colors, spacing, radius } from '@/theme/theme';

export type TrackChoice = 'RIG' | 'CRANE';

interface TrackChoiceTilesProps {
  rigMachineNo: string;
  /** Omit to render only the Rig tile — RIG-track steps have no Crane alternative. */
  craneMachineNo?: string;
  selected: TrackChoice;
  /** Omit to render the tile(s) as display-only (read-only screens). */
  onSelect?: (track: TrackChoice) => void;
}

const TILE_META = {
  RIG: { icon: Drill, color: colors.machines.rig.color, soft: colors.machines.rig.soft },
  CRANE: { icon: Forklift, color: colors.machines.crane.color, soft: colors.machines.crane.soft },
} as const;

/** The single square icon tile — exported so read-only callers that just need to
 * show "which machine" (no RIG/CRANE choice) can render the exact same tile,
 * e.g. CoreTeamAccordion's per-machine header. */
export function MachineTrackTile({
  track,
  machineNo,
  selected,
  onPress,
}: {
  track: TrackChoice;
  machineNo: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const meta = TILE_META[track];
  const Icon = meta.icon;
  const tint = selected
    ? { backgroundColor: meta.soft, borderColor: meta.color }
    : styles.tileUnselected;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.tile}
      hitSlop={4}
      accessibilityLabel={machineNo}
    >
      <View style={[styles.tileIcon, tint]}>
        <Icon size={16} color={selected ? meta.color : colors.textSecondary} />
      </View>
    </Pressable>
  );
}

function TrackChoiceTiles({
  rigMachineNo,
  craneMachineNo,
  selected,
  onSelect,
}: TrackChoiceTilesProps) {
  return (
    <View style={styles.row}>
      <MachineTrackTile
        track="RIG"
        machineNo={rigMachineNo}
        selected={selected === 'RIG'}
        onPress={onSelect ? () => onSelect('RIG') : undefined}
      />
      {craneMachineNo !== undefined && (
        <MachineTrackTile
          track="CRANE"
          machineNo={craneMachineNo}
          selected={selected === 'CRANE'}
          onPress={onSelect ? () => onSelect('CRANE') : undefined}
        />
      )}
    </View>
  );
}

export default React.memo(TrackChoiceTiles);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    alignItems: 'flex-start',
    gap: 3,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUnselected: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(28,28,46,0.10)',
  },
});
