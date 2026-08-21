// src/screens/Home/generatePlan/EditConfirmModal.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@/theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  date: string;
  today: string;
  loading?: boolean;
}

export default function EditConfirmModal({ visible, onClose, onConfirm, date, today, loading = false }: Props) {
  const isToday = date === today;
  const handleClose = loading ? () => {} : onClose;

  return (
    <AppModal
      visible={visible}
      onClose={handleClose}
      position="center"
      title="Save Changes?"
      subtitle={`You are about to update the existing plan.`}
    >
      <View style={styles.confirmBody}>
        <View style={styles.confirmIconWrap}>
          <AlertTriangle size={28} color={colors.warning} />
        </View>
        <Text style={styles.confirmTitle}>
          Update {isToday ? "today's" : `${date}'s`} plan?
        </Text>
        <Text style={styles.confirmMessage}>
          This will replace the current plan with your updated selections,
          including piles, machine assignments, supervisors, and step timings.
          Any existing actual progress data will be preserved.
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            style={[styles.cancelBtn, loading && styles.cancelBtnDisabled]}
            onPress={handleClose}
            disabled={loading}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveText}>Save Changes</Text>
            )}
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  confirmBody: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,149,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  confirmTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.12)',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelBtnDisabled: {
    opacity: 0.5,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
});
