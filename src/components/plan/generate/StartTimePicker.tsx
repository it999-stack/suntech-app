// src/components/plan/generate/StartTimePicker.tsx

import React, { useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';

interface StartTimePickerProps {
  startTime: number;
  onChange: (minutes: number) => void;
}

export default function StartTimePicker({ startTime, onChange }: StartTimePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Text style={styles.sectionHint}>
        This sets the anchor start time for the 24-hour plan.
      </Text>
      <Pressable style={styles.timePickerBtn} onPress={() => setPickerOpen(true)}>
        <Text style={styles.timePickerBtnText}>{formatMinutes(startTime)}</Text>
      </Pressable>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          onChange(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0); return d; })()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  timePickerBtn: {
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  timePickerBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
