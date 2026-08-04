// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes12, isAtOrAfterOvernightWrap } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';

type Mode = 'start' | 'finish';

interface Props {
  mode: Mode;
  stepName: string;
  /** Sensible default minutes to seed the picker with (planned start/end). */
  defaultMinutes: number;
  onConfirm: (minutes: number) => void | Promise<void>;
  /** Existing remark text for this step, if any. */
  remarks?: string;
  /** Opens the step-actions sheet directly on its Remarks tab. */
  onAddRemarks?: () => void;
  /** Earliest minutes-since-midnight this time may be set to (inclusive). Omit for no lower bound. */
  minMinutes?: number;
  /** Describes what minMinutes represents, used in the rejection message (e.g. "the previous step's end time"). */
  minMinutesLabel?: string;
}

export default function StepTimeControl({
  mode,
  stepName,
  defaultMinutes,
  onConfirm,
  remarks,
  onAddRemarks,
  minMinutes,
  minMinutesLabel,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);
  const [saving, setSaving] = useState(false);

  const verb = mode === 'start' ? 'Start' : 'Finish';
  const hasRemarks = !!remarks && remarks.trim().length > 0;

  function confirm(minutes: number) {
    if (minMinutes != null && !isAtOrAfterOvernightWrap(minutes, minMinutes)) {
      Alert.alert(
        'Invalid time',
        `${verb} time can't be before ${minMinutesLabel ?? 'the required time'} (${formatMinutes12(minMinutes)}).`,
      );
      return;
    }

    const title = mode === 'start' ? `Start ${stepName}?` : `Finish ${stepName}?`;
    const message =
      mode === 'start'
        ? `This will log the start time as ${formatMinutes12(minutes)}.`
        : `Are you sure this step is complete? This will log the finish time as ${formatMinutes12(minutes)}.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: async () => {
          setSaving(true);
          try {
            await onConfirm(minutes);
            setPickerOpen(false);
          } catch (err) {
            Alert.alert(
              'Failed to save',
              err instanceof Error
                ? err.message
                : `Could not log the ${mode} time. Please try again.`,
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <>
        <View style={styles.wrap}>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, styles.primaryBtn, saving && styles.actionBtnDisabled]}
              disabled={saving}
              onPress={() => {
                setDraftMinutes(defaultMinutes);
                setPickerOpen(true);
              }}
            >
              <Text style={styles.primaryBtnText}>Pick a time</Text>
            </Pressable>

            {onAddRemarks && (
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn, saving && styles.actionBtnDisabled]}
                disabled={saving}
                onPress={onAddRemarks}
              >
                <Text style={styles.secondaryBtnText}>
                  {hasRemarks ? 'Edit remarks' : 'Add remarks'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <TimerSelectMenu
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onTimeSelect={(date) => {
            const m = date.getHours() * 60 + date.getMinutes();
            setDraftMinutes(m);
          }}
          onConfirm={(date) => {
            const m = date.getHours() * 60 + date.getMinutes();
            confirm(m);
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: colors.accent },
  secondaryBtn: { 
    backgroundColor: colors.glassFill, 
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: spacing.md, },
  primaryBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  secondaryBtnText: { ...typography.body, fontWeight: '700', color: colors.accent },
});
