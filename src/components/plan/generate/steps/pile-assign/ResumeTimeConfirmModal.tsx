// src/components/plan/generate/steps/pile-assign/ResumeTimeConfirmModal.tsx
//
// Gate shown before assigning a pile that has a step in progress from a
// previous day: the user must enter how much time is actually left on that
// step (pre-filled with the step's template duration, not an elapsed-time
// guess — the supervisor is the source of truth) before the assignment is
// allowed to proceed. That value overrides the step's normal duration
// template for this pile only, when the plan is generated.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import AppModal from '@components/shared/AppModal';
import GlassCard from '@components/shared/GlassCard';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { colors, spacing, radius, typography } from '@theme/theme';
import type { ResumeWork } from '@/types/plan';

interface ResumeTimeConfirmModalProps {
  visible: boolean;
  pileCode: string;
  resumeWork: ResumeWork;
  onConfirm: (remainingMinutes: number, remarks: string) => void;
  onClose: () => void;
}

export default function ResumeTimeConfirmModal({
  visible,
  pileCode,
  resumeWork,
  onConfirm,
  onClose,
}: ResumeTimeConfirmModalProps) {
  const [remainingMinutes, setRemainingMinutes] = useState(Math.max(0, Math.round(resumeWork.remainingMinutes)));
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!visible) return;
    setRemainingMinutes(Math.max(0, Math.round(resumeWork.remainingMinutes)));
    setRemarks('');
  }, [visible, resumeWork.remainingMinutes]);

  const completedSummary = resumeWork.completedStepNames?.length
    ? resumeWork.completedStepNames.join(', ')
    : 'No steps completed yet';

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle="Confirm remaining time" scrollable={false}>
      <View style={styles.content}>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Completed</Text>
          <Text style={styles.infoValue}>{completedSummary}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>In progress</Text>
          <Text style={styles.infoValue}>{resumeWork.stepName ?? 'Step'}</Text>
        </View>

        <GlassCard style={styles.pickerCard} innerStyle={styles.pickerCardInner}>
          <TimerSelectMenu
            visible={visible}
            embedded
            mode="duration"
            title="Select remaining time"
            initialMinutes={remainingMinutes}
            onDurationSelect={setRemainingMinutes}
            onClose={() => {}}
          />
        </GlassCard>

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
  pickerCard: { marginTop: spacing.sm },
  pickerCardInner: { padding: 0 },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
