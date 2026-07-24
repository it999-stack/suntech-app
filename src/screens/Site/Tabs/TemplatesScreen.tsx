// src/screens/site-settings/TemplatesScreen.tsx

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Layers } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';

export default function TemplatesScreen() {
  const navigation = useNavigation<any>();
  const { templates } = useSiteSettings();

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Dia/Depth templates</Text>
            <View style={{ width: 22 }} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <GlassCard>
            {templates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.rowLabel}>No dia/depth templates synced yet.</Text>
                <Text style={styles.rowSub}>Sync this site to pull dimensions from the server.</Text>
              </View>
            ) : (
              templates.map((t, idx) => (
                <View key={t.id}>
                  <View style={styles.row}>
                    <View style={styles.iconWrap}>
                      <Layers size={16} color={colors.accent} />
                    </View>
                    <View>
                      <Text style={styles.rowLabel}>{t.dia}mm × {t.depth}m</Text>
                      <Text style={styles.rowSub}>{t.stepCount} steps configured</Text>
                    </View>
                  </View>
                  {idx < templates.length - 1 && <View style={styles.divider} />}
                </View>
              ))
            )}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.06)',
    marginVertical: spacing.xs,
  },
});