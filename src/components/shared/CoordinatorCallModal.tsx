// src/components/shared/CoordinatorCallModal.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Phone } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import AppModal from '@components/shared/AppModal';
import { callPhone } from '@/utils/phone';
import type { PilSiteCoordinator } from '@db/schema';

interface CoordinatorCallModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  coordinators: PilSiteCoordinator[];
}

export default function CoordinatorCallModal({ visible, onClose, title, coordinators }: CoordinatorCallModalProps) {
  return (
    <AppModal visible={visible} onClose={onClose} title={title} position="center">
      {coordinators.length === 0 ? (
        <Text style={styles.emptyText}>No site coordinators synced for this site.</Text>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator>
          {coordinators.map((c, idx) => (
            <React.Fragment key={c.id}>
              <Pressable
                style={styles.row}
                onPress={() => {
                  callPhone(c.phone);
                  onClose();
                }}
                disabled={!c.phone}
              >
                <View style={styles.icon}>
                  <Phone size={16} color={c.phone ? colors.accent : colors.textSecondary} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.phone}>{c.phone ?? 'No phone on file'}</Text>
                </View>
              </Pressable>
              {idx < coordinators.length - 1 ? <View style={{ height: spacing.xs }} /> : null}
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.md,
  },
  list: { maxHeight: 260, flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
  icon: { width: 24, alignItems: 'center' },
  info: { flex: 1 },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  phone: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
