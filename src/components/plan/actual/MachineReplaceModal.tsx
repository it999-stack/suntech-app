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
import MachineSelect from '@components/plan/generate/steps/pile-assign/MachineSelect';
import type { SimpleMachine } from '@components/plan/generate/steps/pile-assign/types';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString } from '@utils/formatTime';
import CompactTimeRow from './machineEvents/CompactTimeRow';
import NotesField from './machineEvents/NotesField';
import SaveEventButton from './machineEvents/SaveEventButton';
import { useSaveMachineEvent } from './machineEvents/useSaveMachineEvent';
import { trackToMachineSelectKind } from './machineEvents/eventLabels';
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
  onClose,
  onLogMachineEvent,
}: Props) {
  const currentMachineId = currentMachineIdByTrack[defaultTrack];
  const currentMachine = machines.find((m) => m.id === currentMachineId);
  const machineLabel = currentMachine?.machineNo ?? 'this machine';

  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());

  const replacementOptions: SimpleMachine[] = machines
    .filter((m) => m.type === defaultTrack && m.status === 'ACTIVE' && m.id !== currentMachineId)
    .map((m) => ({ id: m.id, machineNo: m.machineNo }));

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
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName} position="center">
      <View style={styles.page}>
        <View style={styles.divider} />

        <View style={styles.iconCircle}>
          <RefreshCw size={24} color={colors.accent} />
        </View>

        <Text style={styles.promptTitle}>Replace {machineLabel}?</Text>
        <Text style={styles.promptSubtitle}>Choose a replacement machine</Text>

        <View style={styles.fieldsWrap}>
          <View style={styles.machineSelectWrap}>
            <MachineSelect
              label="Replacement"
              kind={trackToMachineSelectKind(defaultTrack)}
              options={replacementOptions}
              valueId={replacementId}
              onSelect={setReplacementId}
            />
          </View>

          <CompactTimeRow label="Replaced at" value={occurredAt} onChange={setOccurredAt} />

          <NotesField value={notes} onChange={setNotes} placeholder="What happened? (optional)" />

          <SaveEventButton
            saving={saving}
            canSave={canSave}
            onPress={handleSave}
            label="Replace machine"
            variant="accent"
            icon={RefreshCw}
          />
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  promptTitle: {
    ...typography.cardTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  promptSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  fieldsWrap: {
    alignSelf: 'stretch',
  },
  machineSelectWrap: {
    marginBottom: spacing.md,
  },
});
