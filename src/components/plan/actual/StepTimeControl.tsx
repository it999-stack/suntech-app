// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { MessageSquareText } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import RemarksModal from '@components/plan/actual/RemarksModal';
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
  /** Called when the user saves a remark from the icon-triggered modal. */
  onSaveRemarks?: (text: string) => void | Promise<void>;
  /** Earliest minutes-since-midnight this time may be set to (inclusive). Omit for no lower bound. */
  minMinutes?: number;
  /** Describes what minMinutes represents, used in the rejection message (e.g. "the previous step's end time"). */
  minMinutesLabel?: string;
}

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export default function StepTimeControl({
  mode,
  stepName,
  defaultMinutes,
  onConfirm,
  remarks,
  onSaveRemarks,
  minMinutes,
  minMinutesLabel,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);
  const [remarksOpen, setRemarksOpen] = useState(false);
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
              style={[styles.actionBtn, styles.nowBtn, saving && styles.actionBtnDisabled]}
              disabled={saving}
              onPress={() => confirm(nowAsMinutes())}
            >
              <Text style={styles.nowBtnText}>{verb} Now</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.pickBtn, saving && styles.actionBtnDisabled]}
              disabled={saving}
              onPress={() => {
                setDraftMinutes(defaultMinutes);
                setPickerOpen(true);
              }}
            >
              <Text style={styles.pickBtnText}>Pick a time</Text>
            </Pressable>

            {onSaveRemarks && (
              <Pressable
                style={styles.remarksBtn}
                onPress={() => setRemarksOpen(true)}
                hitSlop={8}
              >
                <MessageSquareText
                  size={18}
                  color={hasRemarks ? colors.accent : colors.textSecondary}
                />
                {hasRemarks && <View style={styles.remarksDot} />}
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

      {onSaveRemarks && (
        <RemarksModal
          visible={remarksOpen}
          stepName={stepName}
          initialValue={remarks}
          onClose={() => setRemarksOpen(false)}
          onSave={onSaveRemarks}
        />
      )}
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
  nowBtn: { backgroundColor: colors.accent },
  nowBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  pickBtn: { backgroundColor: 'rgba(28,28,46,0.06)' },
  pickBtnText: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  remarksBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remarksDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
