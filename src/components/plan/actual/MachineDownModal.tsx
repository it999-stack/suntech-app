// src/components/plan/actual/MachineDownModal.tsx
//
// Focused single-action sheet for reporting a machine breakdown or marking
// one resumed — mirrors MachineIdleModal's "one action, minimal fields"
// design. Which of the two shows is derived from the machine's current
// status unless the caller passes an explicit initialEventType — neither the
// machine card's "Report issue"/"Resume" pill nor PileStepsModal's warning
// banner ever forces one, so this auto-detection is what actually decides.
// Replacing a machine is a separate concern —
// it isn't gated by breakdown status (a machine can be swapped any time),
// so it lives in its own MachineReplaceModal, not here. Covers the
// BREAKDOWN / RESUMED slice of what used to be one combined
// MachineEventsModal; see MachineIdleModal for IDLE_START / IDLE_END and
// MachineReplaceModal for REPLACED.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString, formatElapsedHMS, formatTimeWithDay } from '@utils/formatTime';
import { useElapsedSeconds } from '@hooks/useElapsedSeconds';
import CompactTimeRow from './machineEvents/CompactTimeRow';
import NotesField from './machineEvents/NotesField';
import Button from '@components/shared/Button';
import { useSaveMachineEvent } from './machineEvents/useSaveMachineEvent';
import { findOpenSession } from './machineEvents/idleSession';
import type { MachineEventMachine, Track } from './machineEvents/types';

type DownEventType = 'BREAKDOWN' | 'RESUMED';

interface Props {
  visible: boolean;
  pileCode: string;
  stepName: string;
  defaultTrack: Track;
  /** Forces which screen opens first. Omit to auto-derive from the current
   * machine's status (down → Resume, otherwise → Report breakdown). */
  initialEventType?: DownEventType;
  /** Every machine at this site — filtered internally per track/status. */
  machines: MachineEventMachine[];
  /** Current assigned machine id per track, for this pile at this step's position. */
  currentMachineIdByTrack: Partial<Record<Track, string>>;
  history: PilMachineEvent[];
  onClose: () => void;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
}

export default function MachineDownModal({
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
  const currentMachineId = currentMachineIdByTrack[defaultTrack];
  const currentMachine = machines.find((m) => m.id === currentMachineId);
  const isDown = currentMachine?.status === 'BREAKDOWN';

  const screen: DownEventType = initialEventType ?? (isDown ? 'RESUMED' : 'BREAKDOWN');

  const openBreakdown = useMemo(
    () => findOpenSession(history, currentMachineId, 'BREAKDOWN', ['RESUMED']),
    [history, currentMachineId],
  );
  const elapsedSeconds = useElapsedSeconds(screen === 'RESUMED' ? openBreakdown?.occurredAt ?? null : null);

  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());

  // Reporting a breakdown requires saying what happened — resuming doesn't
  // need a reason, the machine simply being fixed is self-explanatory.
  const isValid = !!currentMachineId && (screen !== 'BREAKDOWN' || notes.trim().length > 0);

  const { saving, canSave, handleSave } = useSaveMachineEvent({
    isValid,
    buildInput: (): LogMachineEventInput => ({
      track: defaultTrack,
      eventType: screen,
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

  const machineLabel = currentMachine?.machineNo ?? 'this machine';

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName} position="center">
      <View style={styles.page}>
        <View style={styles.divider} />

        <View style={styles.iconCircle}>
          {screen === 'BREAKDOWN' ? (
            <AlertTriangle size={26} color={colors.danger} />
          ) : (
            <Wrench size={24} color={colors.danger} />
          )}
        </View>

        {screen === 'BREAKDOWN' ? (
          <>
            <Text style={styles.promptTitle}>Report {machineLabel} as down?</Text>
            <Text style={styles.promptSubtitle}>Reported time will be logged as now</Text>
          </>
        ) : (
          <>
            <Text style={styles.elapsedText}>{formatElapsedHMS(elapsedSeconds)}</Text>
            <Text style={styles.promptSubtitle}>
              {openBreakdown ? `Down since ${formatTimeWithDay(openBreakdown.occurredAt)}` : 'Reported down'}
            </Text>
          </>
        )}

        <View style={styles.fieldsWrap}>
          <CompactTimeRow
            label={screen === 'BREAKDOWN' ? 'Reported at' : 'Resumed at'}
            value={occurredAt}
            onChange={setOccurredAt}
          />

          <NotesField
            value={notes}
            onChange={setNotes}
            placeholder={screen === 'RESUMED' ? 'Resolution notes (optional)' : 'What happened?'}
            required={screen === 'BREAKDOWN'}
          />

          <Button
            loading={saving}
            disabled={!canSave}
            onPress={handleSave}
            label={screen === 'BREAKDOWN' ? 'Report breakdown' : 'Mark resumed'}
            variant={screen === 'BREAKDOWN' ? 'danger' : 'success'}
            icon={screen === 'BREAKDOWN' ? AlertTriangle : CheckCircle2}
            style={styles.saveBtn}
          />
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
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
    backgroundColor: colors.dangerSoft,
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
    color: colors.danger,
    fontVariant: ['tabular-nums'],
  },
  fieldsWrap: {
    alignSelf: 'stretch',
  },
  saveBtn: { marginTop: spacing.md },
});
