// src/screens/Profile/site-settings/ShiftsScreen.tsx
// Read-only display of shifts synced from server.

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Clock, ChevronRight } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';
import { shiftDurationMinutes } from '@app-types/siteSettings';

export default function ShiftsScreen() {
  const navigation = useNavigation<any>();
  const { shifts } = useSiteSettings();

  const coveredHrs = Math.round(
    (shifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0) / 60) * 10
  ) / 10;

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={[]}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Shifts</Text>
            <View style={{ width: 22 }} />
          </View>
          <Text style={styles.subtitle}>{coveredHrs} of 24 hrs covered</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {shifts.map((shift) => (
            <Pressable key={shift.id} onPress={() => navigation.navigate('ShiftWindows', { shiftId: shift.id })}>
              <GlassCard style={styles.shiftCard}>
                <View style={styles.shiftRow}>
                  <View style={styles.iconWrap}>
                    <Clock size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftName}>{shift.name}</Text>
                    <Text style={styles.shiftTime}>
                      {formatMinutes(shift.startMinutes)} – {formatMinutes(shift.endMinutes)}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </View>
              </GlassCard>
            </Pressable>
          ))}

          {shifts.length === 0 && (
            <Text style={styles.emptyText}>No shifts configured. Contact your administrator.</Text>
          )}
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
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  shiftCard: {},
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  shiftTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});