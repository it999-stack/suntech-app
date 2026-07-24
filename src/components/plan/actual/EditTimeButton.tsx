// src/components/plan/actual/EditTimeButton.tsx
//
// Small pencil affordance for correcting an already-logged actual start/end
// time. Renders only the tappable icon (the caller already renders the time
// text itself) — opens the same TimerSelectMenu used for first-time entry,
// validates against optional min/max bounds, then confirms via Alert before
// saving. Mirrors StepTimeControl's confirm() validation pattern.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import { Pencil } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes12, isAtOrAfterOvernightWrap, isAtOrBeforeOvernightWrap } from '@utils/formatTime';
import { colors } from '@theme/theme';

interface Props {
  /** Current value, minutes-since-midnight — seeds the picker and dialog copy. */
  minutes: number;
  /** e.g. "start time" / "finish time" — used in alert copy. */
  label: string;
  /** Earliest minutes this may be changed to (inclusive). Omit for no lower bound. */
  minMinutes?: number;
  /** Describes what minMinutes represents, e.g. "the previous step's end time". */
  minMinutesLabel?: string;
  /** Latest minutes this may be changed to (inclusive). Omit for no upper bound. */
  maxMinutes?: number;
  /** Describes what maxMinutes represents, e.g. "the next step's start time". */
  maxMinutesLabel?: string;
  onConfirm: (minutes: number) => void | Promise<void>;
}

export default function EditTimeButton({
  minutes,
  label,
  minMinutes,
  minMinutesLabel,
  maxMinutes,
  maxMinutesLabel,
  onConfirm,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function confirm(newMinutes: number) {
    if (minMinutes != null && !isAtOrAfterOvernightWrap(newMinutes, minMinutes)) {
      Alert.alert(
        'Invalid time',
        `The ${label} can't be before ${minMinutesLabel ?? 'the required time'} (${formatMinutes12(minMinutes)}).`,
      );
      return;
    }
    if (maxMinutes != null && !isAtOrBeforeOvernightWrap(newMinutes, maxMinutes)) {
      Alert.alert(
        'Invalid time',
        `The ${label} can't be after ${maxMinutesLabel ?? 'the required time'} (${formatMinutes12(maxMinutes)}).`,
      );
      return;
    }

    Alert.alert(
      'Change time?',
      `This will change the ${label} to ${formatMinutes12(newMinutes)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              await onConfirm(newMinutes);
              setPickerOpen(false);
            } catch (err) {
              Alert.alert(
                'Failed to save',
                err instanceof Error ? err.message : `Could not update the ${label}. Please try again.`,
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Pressable
        style={styles.btn}
        disabled={saving}
        onPress={() => setPickerOpen(true)}
        hitSlop={8}
      >
        <Pencil size={12} color={colors.textSecondary} />
      </Pressable>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(date) => confirm(date.getHours() * 60 + date.getMinutes())}
        initialDate={(() => {
          const d = new Date();
          d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
          return d;
        })()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginLeft: 4,
    padding: 2,
  },
});
