// src/components/plan/actual/MachineIdleModal.tsx
//
// Focused single-action sheet for starting or ending an idle session on one
// machine — one action, minimal fields, no track/machine picker, since the
// caller (a machine card's quick action or a pile's idle banner) already
// knows exactly which machine this is for. Covers the IDLE_START / IDLE_END
// slice of what used to be one combined MachineEventsModal; see
// MachineDownModal for the BREAKDOWN / REPLACED / RESUMED slice.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Coffee, Clock3 } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString, formatElapsedHMS, formatTimeWithDay } from '@utils/formatTime';
import { useElapsedSeconds } from '@hooks/useElapsedSeconds';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import CompactTimeRow from './machineEvents/CompactTimeRow';
import NotesField from './machineEvents/NotesField';
import SaveEventButton from './machineEvents/SaveEventButton';
import { useSaveMachineEvent } from './machineEvents/useSaveMachineEvent';
import { findOpenSession } from './machineEvents/idleSession';
import type { IdleEventType } from './machineEvents/eventLabels';
import type { MachineEventMachine, Track } from './machineEvents/types';

interface Props {
  visible: boolean;
  pileCode: string;
  stepName: string;
  defaultTrack: Track;
  /** Which screen this opens straight into — Start Idle or End Idle. */
  initialEventType?: IdleEventType;
  /** Every machine at this site — filtered internally per track/status. */
  machines: MachineEventMachine[];
  /** Current assigned machine id per track, for this pile at this step's position. */
  currentMachineIdByTrack: Partial<Record<Track, string>>;
  history: PilMachineEvent[];
  onClose: () => void;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
}

export default function MachineIdleModal({
  visible,
  pileCode,
  stepName,
  defaultTrack,
  initialEventType,
  machines,
  currentMachineIdByTrack,
  history,
  onClose,
  onLogMachineEvent,
}: Props) {
  const eventType: IdleEventType = initialEventType ?? 'IDLE_START';
  const currentMachineId = currentMachineIdByTrack[defaultTrack];
  const currentMachine = machines.find((m) => m.id === currentMachineId);

  const openIdleStart = useMemo(
    () => findOpenSession(history, currentMachineId, 'IDLE_START', ['IDLE_END']),
    [history, currentMachineId],
  );
  const elapsedSeconds = useElapsedSeconds(eventType === 'IDLE_END' ? openIdleStart?.occurredAt ?? null : null);

  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());

  // Starting idle requires saying why — ending it doesn't need a reason,
  // the machine simply resuming work is self-explanatory.
  const isValid = !!currentMachineId && (eventType !== 'IDLE_START' || notes.trim().length > 0);

  const { saving, canSave, handleSave } = useSaveMachineEvent({
    isValid,
    buildInput: (): LogMachineEventInput => ({
      track: defaultTrack,
      eventType,
      machineId: currentMachineId ?? null,
      replacementId: null,
      notes: notes.trim() || null,
      occurredAt: toLocalIsoString(occurredAt),
    }),
    onLogMachineEvent,
    onSaved: () => {
      setNotes('');
      onClose();
    },
  });

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName} position="center">
      <View style={styles.page}>
        <View style={styles.divider} />

        <View style={styles.iconCircle}>
          {eventType === 'IDLE_START' ? (
            <Coffee size={26} color={colors.warning} />
          ) : (
            <Clock3 size={26} color={colors.warning} />
          )}
        </View>

        {eventType === 'IDLE_START' ? (
          <>
            <Text style={styles.promptTitle}>
              Start idle on {currentMachine?.machineNo ?? 'this machine'}?
            </Text>
            <Text style={styles.promptSubtitle}>Start time will be logged as now</Text>
          </>
        ) : (
          <>
            <Text style={styles.elapsedText}>{formatElapsedHMS(elapsedSeconds)}</Text>
            <Text style={styles.promptSubtitle}>
              {openIdleStart ? `Idle since ${formatTimeWithDay(openIdleStart.occurredAt)}` : 'Idle'}
            </Text>
          </>
        )}

        <View style={styles.fieldsWrap}>
          <CompactTimeRow
            label={eventType === 'IDLE_START' ? 'Start time' : 'End time'}
            value={occurredAt}
            onChange={setOccurredAt}
          />

          <NotesField
            value={notes}
            onChange={setNotes}
            placeholder={eventType === 'IDLE_START' ? 'Why is it going idle?' : 'Add a note (optional)'}
            required={eventType === 'IDLE_START'}
          />

          <SaveEventButton
            saving={saving}
            canSave={canSave}
            onPress={handleSave}
            label={eventType === 'IDLE_START' ? 'Start idle' : 'End idle'}
            variant={eventType === 'IDLE_START' ? 'warning' : 'accent'}
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
    backgroundColor: colors.warningSoft,
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
  elapsedText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.warning,
    fontVariant: ['tabular-nums'],
  },
  fieldsWrap: {
    alignSelf: 'stretch',
  },
});
