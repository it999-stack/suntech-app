// src/components/plan/actual/machineEvents/CompactTimeRow.tsx
//
// Single tappable "Start time"/"End time" row used by MachineIdleModal and
// MachineDownModal — opens TimerSelectMenu (time + date together, one tap)
// rather than the two separate time/date fields OccurredAtPicker used. White
// card + border + a trailing pencil icon signal it's an editable field, not
// a plain label (matching TimerSelectMenu's own header edit affordance).

import React, { useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { PencilLine } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { formatTimeWithDay, toLocalIsoString } from '@utils/formatTime';

interface Props {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}

export default function CompactTimeRow({ label, value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.row} onPress={() => setPickerOpen(true)}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueGroup}>
          <Text style={styles.value}>{formatTimeWithDay(toLocalIsoString(value))}</Text>
          <PencilLine size={15} color={colors.textSecondary} />
        </View>
      </Pressable>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialDate={value}
        onConfirm={(d) => onChange(d)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...shadow.soft,
  },
  label: { ...typography.body, color: colors.textSecondary },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  value: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
});
