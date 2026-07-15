// src/components/plan/generate/steps/pile-assign/PileDetailSheet.tsx
//
// Detail bottom sheet for a single pile, opened via IndexTable's "..." menu.
// Built on AppModal — same shell used by BulkAssignBar.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography } from '@theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  code: string;
  spec: string;
  rigLabel: string | null;
  craneLabel: string | null;
  onAssign: () => void;
  onUnassign?: () => void;
}

export default function PileDetailSheet({
  visible, onClose, code, spec, rigLabel, craneLabel, onAssign, onUnassign,
}: Props) {
  const assigned = !!(rigLabel && craneLabel);

  return (
    <AppModal visible={visible} onClose={onClose} title={code} subtitle={spec}>
      <View style={[styles.badge, assigned ? styles.badgeSuccess : styles.badgeWarning]}>
        <Text style={[styles.badgeText, assigned ? styles.badgeTextSuccess : styles.badgeTextWarning]}>
          {assigned ? 'Assigned' : 'Unassigned'}
        </Text>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Rig</Text>
          <Text style={styles.statValue}>{rigLabel ?? '—'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Crane</Text>
          <Text style={styles.statValue}>{craneLabel ?? '—'}</Text>
        </View>
      </View>

      <Pressable style={styles.primaryBtn} onPress={onAssign}>
        <Text style={styles.primaryBtnText}>Assign machines</Text>
      </Pressable>
      {onUnassign && (
        <Pressable style={styles.dangerBtn} onPress={onUnassign}>
          <Text style={styles.dangerBtnText}>Unassign</Text>
        </Pressable>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.lg },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeText: { ...typography.caption, fontWeight: '700' },
  badgeTextSuccess: { color: colors.success },
  badgeTextWarning: { color: colors.warning },

  statGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: 'rgba(28,28,46,0.04)', borderRadius: radius.md, padding: spacing.md },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },

  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: spacing.sm + 2, alignItems: 'center', marginBottom: spacing.sm },
  primaryBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  dangerBtn: { backgroundColor: colors.dangerSoft, borderRadius: radius.pill, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  dangerBtnText: { ...typography.body, fontWeight: '700', color: colors.danger },
});