// src/components/plan/actual/StepTimeControl.tsx
//
// One control for logging either the actual start or actual finish of a
// step. Two ways to pick the time (Now vs a custom pick via TimerSelectMenu),
// but both always end at the same confirm() call — so the alert copy and
// the actual commit only live in one place.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';

type Mode = 'start' | 'finish';

interface Props {
  mode: Mode;
  stepName: string;
  /** Sensible default minutes to seed the picker with (planned start/end). */
  defaultMinutes: number;
  onConfirm: (minutes: number) => void;
}

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export default function StepTimeControl({ mode, stepName, defaultMinutes, onConfirm }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);

  const verb = mode === 'start' ? 'Start' : 'Finish';

  function confirm(minutes: number) {
    const title = mode === 'start' ? `Start ${stepName}?` : `Finish ${stepName}?`;
    const message =
      mode === 'start'
        ? `This will log the start time as ${formatMinutes(minutes)}.`
        : `Are you sure this step is complete? This will log the finish time as ${formatMinutes(minutes)}.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: mode === 'finish' ? 'default' : 'default',
        onPress: () => {
          onConfirm(minutes);
          setPickerOpen(false);
        },
      },
    ]);
  }

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, styles.nowBtn]}
            onPress={() => confirm(nowAsMinutes())}
          >
            <Text style={styles.nowBtnText}>{verb} Now</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.pickBtn]}
            onPress={() => {
              setDraftMinutes(defaultMinutes);
              setPickerOpen(true);
            }}
          >
            <Text style={styles.pickBtnText}>Pick a time</Text>
          </Pressable>
        </View>

        {pickerOpen && (
          <View style={styles.pickerWrap}>
            <Pressable style={styles.timePickerBtn} onPress={() => setPickerOpen(false)}>
              <Text style={styles.timePickerBtnText}>{formatMinutes(draftMinutes)}</Text>
            </Pressable>
            <Pressable style={styles.confirmPickBtn} onPress={() => confirm(draftMinutes)}>
              <Text style={styles.confirmPickBtnText}>
                {verb} at {formatMinutes(draftMinutes)}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          setDraftMinutes(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(defaultMinutes / 60), defaultMinutes % 60, 0, 0); return d; })()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  nowBtn: {
    backgroundColor: colors.accent,
  },
  nowBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
  pickBtn: {
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  pickBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  pickerWrap: {
    marginTop: spacing.md,
    alignItems: 'stretch',
  },
  confirmPickBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  confirmPickBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
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
