// src/components/plan/actual/MachineReplaceModal.tsx
//
// Focused single-action sheet for swapping in a different machine — not
// gated by breakdown status (a machine can be replaced any time), so unlike
// MachineDownModal this only ever shows the one screen. Reached from the
// "..." action on a pile step in PileStepsModal. Covers the REPLACED slice
// of what used to be one combined MachineEventsModal; see MachineDownModal
// for BREAKDOWN / RESUMED and MachineIdleModal for IDLE_START / IDLE_END.

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import TilePicker, { type TileSection } from '@components/shared/TilePicker';
import type { TileGroupOption } from '@components/shared/TileGroup';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString } from '@utils/formatTime';
import { STATUS_META, TRACK_META, type MachineKind, type MachineStatus } from '@utils/helpers';
import { notify } from '@utils/notify';
import CompactTimeRow from './machineEvents/CompactTimeRow';
import NotesField from './machineEvents/NotesField';
import Button from '@components/shared/Button';
import { useSaveMachineEvent } from './machineEvents/useSaveMachineEvent';
import { isEligibleReplacementType } from './machineEvents/eventLabels';
import type { MachineEventMachine, Track } from './machineEvents/types';

interface Props {
  visible: boolean;
  pileCode: string;
  stepName: string;
  defaultTrack: Track;
  /** Every machine at this site — filtered internally per track/status. */
  machines: MachineEventMachine[];
  /** Current assigned machine id per track, for this pile at this step's position. */
  currentMachineIdByTrack: Partial<Record<Track, string>>;
  /** Which pile/step each machine is physically in the middle of right now
   * (actualStart set, actualEnd not yet) across the WHOLE checklist — a
   * candidate found here can't be picked as the replacement, since it's
   * still committed elsewhere. See useMachineFloor.ts. */
  inProgressStepByMachineId: Map<string, { checklistPileId: string; stepId: string; pileCode: string; stepName: string }>;
  history: PilMachineEvent[];
  onClose: () => void;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
}

export default function MachineReplaceModal({
  visible,
  pileCode,
  stepName,
  defaultTrack,
  machines,
  currentMachineIdByTrack,
  inProgressStepByMachineId,
  onClose,
  onLogMachineEvent,
}: Props) {
  const currentMachineId = currentMachineIdByTrack[defaultTrack];
  const currentMachine = machines.find((m) => m.id === currentMachineId);
  const machineLabel = currentMachine?.machineNo ?? 'this machine';

  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());

  // Only a running machine can take the work over. Anything broken down, idle
  // or out of service stays in the grid — disabled, with its status shown —
  // rather than being filtered away: "R-06 is broken down" answers the
  // supervisor's question, where a machine silently absent from the grid just
  // reads as a bug and sends them hunting for it.
  const isSelectable = (m: MachineEventMachine) => m.status === 'ACTIVE';

  const toOption = (m: MachineEventMachine): TileGroupOption => {
    const meta = TRACK_META[m.type as MachineKind];
    const status = m.status as MachineStatus;
    return {
      id: m.id,
      label: m.machineNo,
      icon: meta.icon,
      color: meta.color,
      soft: meta.soft,
      disabled: !isSelectable(m),
      // Omitted for ACTIVE — the unremarkable case, and a badge on every tile
      // would just be noise.
      statusBadge:
        status && status !== 'ACTIVE'
          ? { text: STATUS_META[status].label, color: STATUS_META[status].color, soft: STATUS_META[status].soft }
          : undefined,
    };
  };

  // Status is no longer part of this filter — it's a `disabled` tile now, see
  // above. The two conditions that remain both mean "not a candidate at all"
  // rather than "unavailable right now": a wrong-track machine can never do
  // this step, and the machine being replaced is the subject of the swap, not
  // an option in it.
  const eligibleMachines = machines.filter(
    (m) => isEligibleReplacementType(m.type, defaultTrack) && m.id !== currentMachineId,
  );

  // Split by the replacement's own type, not defaultTrack — a CRANE-track
  // step's eligible list can include RIG machines (isEligibleReplacementType),
  // so they get their own "Rigs" section instead of sitting under "Cranes".
  const replacementSections: TileSection[] = [
    { key: 'RIG', label: 'Rigs', options: eligibleMachines.filter((m) => m.type === 'RIG').map(toOption) },
    { key: 'CRANE', label: 'Cranes', options: eligibleMachines.filter((m) => m.type === 'CRANE').map(toOption) },
    {
      key: 'COMPRESSOR',
      label: 'Compressors',
      options: eligibleMachines.filter((m) => m.type === 'COMPRESSOR').map(toOption),
    },
  ];

  // Blocks picking a machine that's physically mid-step somewhere else right
  // now, instead of letting the replacement fail invisibly / double-book it.
  const handleSelectReplacement = (id: string) => {
    const busy = inProgressStepByMachineId.get(id);
    if (busy) {
      const label = machines.find((m) => m.id === id)?.machineNo ?? 'This machine';
      notify.error(`${label} is already in progress on ${busy.pileCode} — finish ${busy.stepName} first.`, {
        title: 'Machine busy',
      });
      return;
    }
    setReplacementId(id);
  };

  const isValid = !!currentMachineId && !!replacementId;

  const { saving, canSave, handleSave } = useSaveMachineEvent({
    isValid,
    buildInput: (): LogMachineEventInput => ({
      track: defaultTrack,
      eventType: 'REPLACED',
      machineId: currentMachineId ?? null,
      replacementId,
      notes: notes.trim() || null,
      occurredAt: toLocalIsoString(occurredAt),
    }),
    onLogMachineEvent,
    onSaved: () => {
      setReplacementId(null);
      setNotes('');
      onClose();
    },
  });

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName} position="bottom" showCloseButton={false}>
      <View style={styles.page}>
        <View style={styles.divider} />

        <View style={styles.promptRow}>
          <View style={styles.promptIconWrap}>
            <RefreshCw size={22} color={colors.accent} />
          </View>
          <View style={styles.promptTextWrap}>
            <Text style={styles.promptTitle}>Replace {machineLabel}?</Text>
            <Text style={styles.promptSubtitle}>Choose a replacement machine</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldsWrap}>
          <View style={styles.machineSelectWrap}>
            <TilePicker
              label=""
              sections={replacementSections}
              valueId={replacementId}
              onSelect={handleSelectReplacement}
            />
          </View>

          <CompactTimeRow label="Replaced at" value={occurredAt} onChange={setOccurredAt} />

          <NotesField value={notes} onChange={setNotes} placeholder="What happened? (optional)" />

          <Button
            loading={saving}
            disabled={!canSave}
            onPress={handleSave}
            label="Replace machine"
            icon={RefreshCw}
            style={styles.saveBtn}
          />
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  promptIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTextWrap: {
    flex: 1,
  },
  promptTitle: {
    ...typography.cardTitle,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  promptSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fieldsWrap: {},
  machineSelectWrap: {
    marginBottom: spacing.md,
  },
  saveBtn: { marginTop: spacing.md },
});
