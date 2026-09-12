// src/components/plan/generate/steps/pile-assign/MachineAssignPanel.tsx
//
// Rig + Crane picker panel (with Apply button) — the body previously inlined
// inside BulkAssignBar's modal. Extracted so both the bulk pile-assign flow
// and a single-pile reassignment flow (Preview step) share the exact same
// picker instead of duplicating it.
//
// Tiles come from the shared TileGroup/TileSelect pair — the same grid
// MachineReplaceModal picks a replacement from, and the same TRACK_META
// colors — so a machine looks identical wherever it's chosen. Two separate
// TileGroups rather than one sectioned TilePicker: rig and crane are
// independent selections here, whereas TilePicker's sections all share a
// single valueId, so picking a crane would clear the rig.

import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '@/theme/theme';
import Button from '@components/shared/Button';
import TileGroup, { type TileGroupOption } from '@components/shared/TileGroup';
import { TRACK_META, type TrackMeta } from '@utils/helpers';
import type { SimpleMachine } from './types';

interface MachineAssignPanelProps {
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  rigId: string | null;
  craneId: string | null;
  onSelectRig: (id: string) => void;
  onSelectCrane: (id: string | null) => void;
  onApply: () => void;
  applyLabel: string;
  /** Shows a spinner in place of the label and disables the button — e.g. while
   * a caller-owned recompute triggered by Apply is still in flight. */
  isApplying?: boolean;
}

/** SimpleMachine carries no `type` of its own, so the track's icon/color comes
 * from whichever TRACK_META the field is rendering. */
function toOption(machine: SimpleMachine, meta: TrackMeta): TileGroupOption {
  return {
    id: machine.id,
    label: machine.machineNo,
    icon: meta.icon,
    color: meta.color,
    soft: meta.soft,
  };
}

export default function MachineAssignPanel({
  rigs, cranes, rigId, craneId, onSelectRig, onSelectCrane, onApply, applyLabel, isApplying = false,
}: MachineAssignPanelProps) {
  return (
    <>
      <TileGroup
        label="Rig"
        options={rigs.map((m) => toOption(m, TRACK_META.RIG))}
        valueId={rigId}
        onSelect={onSelectRig}
      />
      {/* A crane is optional, so re-tapping the selected tile clears it — the
          tile grid has no room for the explicit X button the old row picker
          carried, and Apply stays enabled with no crane either way. */}
      <TileGroup
        label="Crane"
        options={cranes.map((m) => toOption(m, TRACK_META.CRANE))}
        valueId={craneId}
        onSelect={(id) => onSelectCrane(id === craneId ? null : id)}
      />
      <Button
        label={applyLabel}
        loading={isApplying}
        disabled={!rigId || isApplying}
        onPress={onApply}
        style={styles.applyButton}
      />
    </>
  );
}

const styles = StyleSheet.create({
  applyButton: { marginTop: spacing.sm },
});
