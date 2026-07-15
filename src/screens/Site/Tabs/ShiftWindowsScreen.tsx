// src/screens/Profile/site-settings/ShiftWindowsScreen.tsx
// Read-only display of non-working windows for a shift, synced from server.

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ChevronLeft, Clock } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';

type ShiftWindowsRouteProp = RouteProp<{ ShiftWindows: { shiftId: string } }, 'ShiftWindows'>;

export default function ShiftWindowsScreen() {
  const navigation = useNavigation();
  const route = useRoute<ShiftWindowsRouteProp>();
  const { shiftId } = route.params;

  const { shifts, windowsForShift } = useSiteSettings();
  const shift = shifts.find((s) => s.id === shiftId);
  const shiftWindows = windowsForShift(shiftId);

  // For overnight shifts (endMinutes < startMinutes), the stepper's max must
  // extend past midnight, e.g. shift 20:00→08:00 ⟹ max = 08:00 + 1440 = 1920.
  const isOvernight = shift ? shift.endMinutes < shift.startMinutes : false;

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>{shift?.name ?? 'Shift'}</Text>
            <View style={{ width: 22 }} />
          </View>
          {shift && (
            <Text style={styles.subtitle}>
              {formatMinutes(shift.startMinutes)} – {formatMinutes(shift.endMinutes)}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <GlassCard>
            {shiftWindows.map((w, idx) => (
              <View key={w.id}>
                <View style={styles.windowRow}>
                  <View style={styles.rowLeft}>
                    <View style={styles.iconWrap}>
                      <Clock size={16} color={colors.accent} />
                    </View>
                    <View>
                      <View style={styles.rowLabelWrap}>
                        <Text style={styles.rowLabel}>{w.label}</Text>
                        <View
                          style={[
                            styles.behaviorBadge,
                            w.behavior === 'AFTER_CURRENT_STEP' && styles.behaviorBadgeAfter,
                          ]}
                        >
                          <Text
                            style={[
                              styles.behaviorBadgeText,
                              w.behavior === 'AFTER_CURRENT_STEP' && styles.behaviorBadgeTextAfter,
                            ]}
                          >
                            {w.behavior === 'AFTER_CURRENT_STEP' ? 'After step' : 'Fixed'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>
                        {formatMinutes(w.startMinutes)} - {formatMinutes(w.endMinutes)}
                      </Text>
                    </View>
                  </View>
                </View>
                {idx < shiftWindows.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            {shiftWindows.length === 0 && (
              <Text style={styles.emptyText}>No non-working windows for this shift yet.</Text>
            )}
          </GlassCard>

          <Text style={styles.helperText}>
            Time inside these windows is excluded from plan generation for this shift —
            everything else counts as working time.
          </Text>
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
  },

  windowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.06)',
    marginVertical: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },

  rowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  behaviorBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(28,28,46,0.08)',
  },
  behaviorBadgeAfter: {
    backgroundColor: colors.accentSoft,
  },
  behaviorBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  behaviorBadgeTextAfter: {
    color: colors.accent,
  },
});