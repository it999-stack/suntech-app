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
import { View, Text, StyleSheet } from 'react-native';
import { Play } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import TilePicker, { type TileSection } from '@components/shared/TilePicker';
import type { TileGroupOption } from '@components/shared/TileGroup';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { TimeFieldGroup, TimeFieldRow } from '@components/shared/TimeFieldRow';
import { colors, spacing, typography } from '@theme/theme';
import {
  STATUS_META,
  TRACK_META,
  type MachineKind,
  type MachineStatus,
} from '@utils/helpers';
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
  // Only a machine that is actually running can be handed the work. Anything
  // broken down, idle or out of service is shown (with its status, so the
  // reason is visible) but cannot be picked.
  const isSelectable = (m: PilingMachine) => m.status === 'ACTIVE';

  // Not just `defaultMachineId`: that's the machine recorded when the step was
  // paused, and the reason it was paused is often that the machine broke down.
  // Pre-selecting it would leave a disabled tile selected — unpickable, but
  // still what Resume would submit, which is the one outcome this disabling is
  // meant to prevent.
  const [machineId, setMachineId] = useState<string | undefined>(() => {
    const preset = machines.find((m) => m.id === defaultMachineId);
    return preset && isSelectable(preset) ? preset.id : undefined;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startedAtIso, setStartedAtIso] = useState<string | undefined>();

  // Same tile presentation as MachineReplaceModal — that sheet is the other
  // place a machine is chosen mid-step, and the two reading differently made
  // the same decision look like two different kinds of choice.
  const toOption = (m: PilingMachine): TileGroupOption => {
    const meta = TRACK_META[m.type as MachineKind];
    const status = m.status as MachineStatus;
    return {
      id: m.id,
      label: m.machineNo,
      icon: meta.icon,
      color: meta.color,
      soft: meta.soft,
      disabled: !isSelectable(m),
      // Left visible rather than filtered out, unlike MachineReplaceModal's
      // eligible list: "R-06 is broken down" answers the supervisor's question,
      // where a machine silently missing from the grid just reads as a bug.
      // Omitted for ACTIVE, which is the unremarkable case and would be noise.
      statusBadge:
        status && status !== 'ACTIVE'
          ? { text: STATUS_META[status].label, color: STATUS_META[status].color, soft: STATUS_META[status].soft }
          : undefined,
    };
  };

  // Split by the machine's OWN type, not the step's track — a CRANE-track
  // step's eligible list includes rigs (see isEligibleReplacementType at the
  // call site), so they belong under "Rigs" rather than sitting mislabelled
  // under "Cranes". TilePicker hides whichever sections come back empty, so a
  // RIG-track step still shows exactly one group.
  const machineSections: TileSection[] = [
    { key: 'RIG', label: 'Rigs', options: machines.filter((m) => m.type === 'RIG').map(toOption) },
    { key: 'CRANE', label: 'Cranes', options: machines.filter((m) => m.type === 'CRANE').map(toOption) },
    {
      key: 'COMPRESSOR',
      label: 'Compressors',
      options: machines.filter((m) => m.type === 'COMPRESSOR').map(toOption),
    },
  ];

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
        {machines.length === 0 ? (
          // TilePicker drops empty sections, so with nothing eligible it would
          // render as a silent gap rather than saying why.
          <Text style={styles.helpText}>No machine available.</Text>
        ) : (
          <TilePicker
            label="Machine"
            sections={machineSections}
            // valueId drives the selected look (single-select), but the press
            // handler is onToggle so tapping the chosen tile clears it again —
            // machineId is optional on confirm, and a supervisor who picked
            // the wrong one needs a way back to "not specified".
            valueId={machineId ?? null}
            onToggle={(id) => setMachineId((cur) => (cur === id ? undefined : id))}
          />
        )}

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
  helpText: { ...typography.smallTxt, color: colors.textSecondary },
});
