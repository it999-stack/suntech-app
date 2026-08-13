// src/components/plan/generate/steps/resume-confirm/ResumeTimeConfirmModal.tsx
//
// Gate shown before a pile with a step in progress from a previous day can be
// carried into today's plan: the user sets an absolute "plan finish time" for
// that step — not an elapsed-time guess, the supervisor is the source of
// truth — which is converted into a remaining-duration override for this
// pile only, when the plan is generated. Mirrors the same time-of-day picker
// design used for logging actual start/finish times (see StepTimeControl.tsx)
// rather than a raw "how many minutes" duration picker.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AppModal from '@components/shared/AppModal';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatTime, toLocalIsoString } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { ResumeWork } from '@/types/plan';

interface ResumeTimeConfirmModalProps {
  visible: boolean;
  pileCode: string;
  resumeWork: ResumeWork;
  /** Where this step effectively starts in the new plan (after skipping any opening
   * non-working window) — the anchor the picked finish time's duration is measured
   * against. See pilingPlannerService.ts's resolveEffectiveDayStart. */
  effectiveStart: Date;
  onConfirm: (remainingMinutes: number, remarks: string) => void;
  onClose: () => void;
}

export default function ResumeTimeConfirmModal({
  visible,
  pileCode,
  resumeWork,
  effectiveStart,
  onConfirm,
  onClose,
}: ResumeTimeConfirmModalProps) {
  const seedFinish = () =>
    new Date(effectiveStart.getTime() + Math.max(0, resumeWork.remainingMinutes) * 60000);

  const [finishDate, setFinishDate] = useState<Date>(seedFinish);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFinishDate(seedFinish());
    setRemarks('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeWork.remainingMinutes, effectiveStart]);

  const completedSummary = resumeWork.completedStepNames?.length
    ? resumeWork.completedStepNames.join(', ')
    : 'No steps completed yet';

  // The picker only offers hour/minute on effectiveStart's own calendar day — a pick
  // earlier than effectiveStart's time-of-day means the step is expected to finish
  // after midnight, so roll it to the next day rather than silently producing a
  // negative/zero duration.
  function handlePicked(date: Date) {
    let picked = new Date(effectiveStart);
    picked.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (picked.getTime() < effectiveStart.getTime()) {
      picked = new Date(picked.getTime() + 24 * 60 * 60 * 1000);
    }
    setFinishDate(picked);
  }

  const remainingMinutes = Math.max(
    0,
    Math.round((finishDate.getTime() - effectiveStart.getTime()) / 60000),
  );

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle="Set plan finish time" scrollable={false} position="center">
      <View style={styles.content}>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Completed</Text>
          <Text style={styles.infoValue}>{completedSummary}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>In progress</Text>
          <Text style={styles.infoValue}>{resumeWork.stepName ?? 'Step'}</Text>
        </View>

        <Text style={styles.fieldLabel}>Plan finish time</Text>
        <Pressable style={styles.timePill} onPress={() => setPickerOpen(true)}>
          <Feather name="clock" size={19} color={colors.accent} style={styles.timePillIcon} />
          <Text style={styles.timePillText}>{formatTime(toLocalIsoString(finishDate))}</Text>
          <View style={styles.timePillEditBadge}>
            <Feather name="edit-3" size={14} color={colors.accent} />
          </View>
        </Pressable>
        <Text style={styles.durationHint}>
          ≈ {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m remaining · tap to change
        </Text>

        <Text style={styles.fieldLabel}>Remarks (optional)</Text>
        <TextInput
          style={styles.textarea}
          multiline
          numberOfLines={3}
          placeholder="Reason for the delay, notes for tomorrow…"
          placeholderTextColor={colors.textSecondary}
          value={remarks}
          onChangeText={setRemarks}
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.confirmBtn, remainingMinutes <= 0 && styles.confirmBtnDisabled]}
          disabled={remainingMinutes <= 0}
          onPress={() => {
            Keyboard.dismiss();
            onConfirm(remainingMinutes, remarks.trim());
          }}
        >
          <Text style={styles.confirmBtnText}>Confirm & Assign</Text>
        </Pressable>
      </View>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialDate={finishDate}
        onConfirm={(date) => {
          handlePicked(date);
          setPickerOpen(false);
        }}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.md },
  infoBlock: {
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoValue: { ...typography.body, color: colors.textPrimary },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  timePill: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePillIcon: { marginRight: spacing.xs + 2 },
  timePillText: { ...typography.h2, fontWeight: '700', color: colors.textPrimary },
  timePillEditBadge: {
    position: 'absolute',
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
  },
  confirmBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
