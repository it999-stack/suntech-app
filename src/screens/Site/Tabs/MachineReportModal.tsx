// src/screens/Site/Tabs/MachineReportModal.tsx
//
// Report a machine breakdown, or mark one resumed, directly from the
// Machines screen — a fleet-level status change with no pile/step context,
// unlike MachineDownModal (which logs the same BREAKDOWN/RESUMED pair
// against a specific pile+step during Fill Actuals). Same time+notes UX,
// same required-notes-for-breakdown rule, built from the same shared
// pieces — just backed by reportMachineEvent's direct API call instead of
// PlanContext.logMachineEvent's checklist-scoped write.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import CompactTimeRow from '@components/plan/actual/machineEvents/CompactTimeRow';
import NotesField from '@components/plan/actual/machineEvents/NotesField';
import SaveEventButton from '@components/plan/actual/machineEvents/SaveEventButton';
import { useSaveMachineEvent } from '@components/plan/actual/machineEvents/useSaveMachineEvent';
import { findOpenSession } from '@components/plan/actual/machineEvents/idleSession';
import type { Track } from '@components/plan/actual/machineEvents/types';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString, formatElapsedHMS, formatTimeWithDay } from '@utils/formatTime';
import { useElapsedSeconds } from '@hooks/useElapsedSeconds';
import { getMachineEventsForMachine, reportMachineEvent } from '@repositories/machineEventsRepository';

type ReportEventType = 'BREAKDOWN' | 'RESUMED';

interface Props {
  visible: boolean;
  machineId: string;
  machineLabel: string;
  track: Track;
  currentStatus: string;
  onClose: () => void;
  onReported: (machineId: string, status: 'ACTIVE' | 'BREAKDOWN') => void;
}

export default function MachineReportModal({
  visible,
  machineId,
  machineLabel,
  track,
  currentStatus,
  onClose,
  onReported,
}: Props) {
  const [history, setHistory] = useState<PilMachineEvent[]>([]);

  useEffect(() => {
    if (!visible) return;
    getMachineEventsForMachine(machineId).then(setHistory).catch(() => setHistory([]));
  }, [visible, machineId]);

  const screen: ReportEventType = currentStatus === 'BREAKDOWN' ? 'RESUMED' : 'BREAKDOWN';

  const openBreakdown = useMemo(
    () => findOpenSession(history, machineId, 'BREAKDOWN', ['RESUMED']),
    [history, machineId],
  );
  const elapsedSeconds = useElapsedSeconds(screen === 'RESUMED' ? openBreakdown?.occurredAt ?? null : null);

  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());

  // Reporting a breakdown requires saying what happened — resuming doesn't
  // need a reason, the machine simply being fixed is self-explanatory.
  const isValid = screen !== 'BREAKDOWN' || notes.trim().length > 0;

  const { saving, canSave, handleSave } = useSaveMachineEvent({
    isValid,
    buildInput: (): LogMachineEventInput => ({
      track,
      eventType: screen,
      machineId,
      replacementId: null,
      notes: notes.trim() || null,
      occurredAt: toLocalIsoString(occurredAt),
    }),
    onLogMachineEvent: async (input) => {
      await reportMachineEvent(machineId, input);
      onReported(machineId, screen === 'BREAKDOWN' ? 'BREAKDOWN' : 'ACTIVE');
    },
    onSaved: () => {
      setNotes('');
      onClose();
    },
  });

  useEffect(() => {
    if (!visible) return;
    setNotes('');
    setOccurredAt(new Date());
  }, [visible, machineId]);

  return (
    <AppModal visible={visible} onClose={onClose} title={machineLabel} subtitle="Machine status" position="center">
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

          <SaveEventButton
            saving={saving}
            canSave={canSave}
            onPress={handleSave}
            label={screen === 'BREAKDOWN' ? 'Report breakdown' : 'Mark resumed'}
            variant={screen === 'BREAKDOWN' ? 'danger' : 'success'}
            icon={screen === 'BREAKDOWN' ? AlertTriangle : CheckCircle2}
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
});
