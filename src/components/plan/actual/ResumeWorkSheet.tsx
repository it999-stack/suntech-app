// src/components/plan/actual/ResumeWorkSheet.tsx
//
// Picking a paused step back up: which machine, and from when.
//
// Both fields are asked because neither is safely inferable. The machine may
// not be the one that stopped (that's the point of a handover), and "now" is
// wrong whenever the supervisor is catching up on entries after the fact —
// the same reason every other actual time on this screen is entered rather
// than stamped.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Play } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import MachineBadge from '@components/shared/MachineBadge';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { TimeFieldGroup, TimeFieldRow } from '@components/shared/TimeFieldRow';
import { colors, spacing, radius, typography } from '@theme/theme';
import {
  formatTimeWithDay,
  resolveOvernightDate,
  seedPickerDate,
  startOfDay,
  endOfDay,
  toLocalIsoString,
} from '@utils/formatTime';
import { validateCandidateTime, type ConflictNotice } from '@utils/timeValidation';
import { notify } from '@utils/notify';
import type { ActualEntry } from '@app-types/plan';
import type { PilingMachine } from '@db/schema';

interface Props {
  visible: boolean;
  step: ActualEntry;
  machines: PilingMachine[];
  /** Pre-selected from the "continue on" machine recorded when the step was
   * paused, when one was chosen. */
  defaultMachineId?: string;
  /** Earliest this session may start — the previous session's end. Resuming
   * before the pause began would overlap the work already recorded. */
  minBoundIso?: string;
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  machineConflictCheck?: (candidate: Date) => ConflictNotice | null;
  isSaving?: boolean;
  onClose: () => void;
  onConfirm: (input: { startedAtIso: string; machineId?: string }) => void;
}

export default function ResumeWorkSheet({
  visible,
  step,
  machines,
  defaultMachineId,
  minBoundIso,
  planWindowMinIso,
  planWindowMaxIso,
  machineConflictCheck,
  isSaving,
  onClose,
  onConfirm,
}: Props) {
  const [machineId, setMachineId] = useState<string | undefined>(defaultMachineId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startedAtIso, setStartedAtIso] = useState<string | undefined>();

  // Seeds on the pause, not on "now": resuming is nearly always recorded
  // relative to when work actually stopped.
  const anchorIso = minBoundIso ?? step.actualStartIso ?? toLocalIsoString(new Date());
  const anchorDate = new Date(anchorIso);
  const anchorMinutes = anchorDate.getHours() * 60 + anchorDate.getMinutes();

  function handlePicked(date: Date, dateWasExplicit: boolean) {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const candidate = dateWasExplicit ? date : resolveOvernightDate(anchorIso, minutes);

    const conflict = validateCandidateTime({
      candidateDate: candidate,
      minBoundIso,
      minBoundConflict: { title: 'Too early', message: 'Work was still in progress at that time.' },
      planWindowMinIso,
      planWindowMaxIso,
      machineConflictCheck,
    });
    if (conflict) {
      notify.error(conflict.message, { title: conflict.title });
      return;
    }

    setStartedAtIso(toLocalIsoString(candidate));
    setPickerOpen(false);
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={`Resume ${step.stepName}`}
      subtitle="Which machine is picking this up, and from when"
      position="bottom"
      showCloseButton={false}
      scrollable
    >
      <View style={styles.body}>
        <Text style={styles.fieldLabel}>Machine</Text>
        <View style={styles.chipRow}>
          {machines.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMachineId((cur) => (cur === m.id ? undefined : m.id))}
              style={[styles.machineChip, machineId === m.id && styles.chipActive]}
            >
              <MachineBadge track={m.type as ActualEntry['track']} label={m.machineNo} />
            </Pressable>
          ))}
          {machines.length === 0 && <Text style={styles.helpText}>No machine available.</Text>}
        </View>

        <TimeFieldGroup>
          {/* Shown read-only above the editable row so the two times read as
              a pair: work stopped THEN, it resumes NOW. Without it the start
              time is a number with nothing to be relative to. */}
          {minBoundIso && (
            <TimeFieldRow label="Paused at" value={formatTimeWithDay(minBoundIso)} />
          )}
          <TimeFieldRow
            label="Resumed at"
            // Dated, not bare time — a step resumed after midnight would
            // otherwise be indistinguishable from one resumed the same day.
            value={startedAtIso ? formatTimeWithDay(startedAtIso) : undefined}
            placeholder="Tap to set"
            onPress={() => setPickerOpen(true)}
            isLast
          />
        </TimeFieldGroup>

        <Button
          label="Resume work"
          icon={Play}
          disabled={!startedAtIso || isSaving}
          loading={isSaving}
          onPress={() => startedAtIso && onConfirm({ startedAtIso, machineId })}
        />
      </View>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        // Opens on the moment work stopped, so the common "resumed right
        // after the handover" case is one confirm rather than a scroll.
        initialDate={seedPickerDate(anchorIso, anchorMinutes)}
        minimumDate={planWindowMinIso ? startOfDay(new Date(planWindowMinIso)) : undefined}
        maximumDate={planWindowMaxIso ? endOfDay(new Date(planWindowMaxIso)) : undefined}
        onConfirm={handlePicked}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingBottom: spacing.lg },
  fieldLabel: {
    ...typography.smallTxt,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  machineChip: {
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  helpText: { ...typography.smallTxt, color: colors.textSecondary },
});
