// src/screens/Profile/SiteSettingsScreen.tsx
//
// Rebuilt: instead of an in-page segmented toggle between two sections,
// this is now a simple menu list. Each row navigates to its own screen.

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Clock, Layers, Wrench, ChevronRight, ListChecks, Users } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';
import { shiftDurationMinutes } from '@app-types/siteSettings';

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.rowCard}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>{icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowSub}>{subtitle}</Text>
          </View>
          <ChevronRight size={20} color={colors.textSecondary} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function SiteSettingsScreen() {
  const navigation = useNavigation<any>();
  const { shifts, templates } = useSiteSettings();

  const coveredHrs = Math.round(
    (shifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0) / 60) * 10
  ) / 10;

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Site settings</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <MenuRow
            icon={<ListChecks size={18} color={colors.accent} />}
            title="Piling Steps"
            subtitle="Configure duration templates per step"
            onPress={() => navigation.navigate('Steps')}
          />
          <MenuRow
            icon={<Wrench size={18} color={colors.accent} />}
            title="Machines"
            subtitle="View rigs & cranes assigned to this site"
            onPress={() => navigation.navigate('Machines')}
          />
          <MenuRow
            icon={<Clock size={18} color={colors.accent} />}
            title="Shifts"
            subtitle={`${shifts.length} shift${shifts.length === 1 ? '' : 's'} · ${coveredHrs} of 24 hrs covered`}
            onPress={() => navigation.navigate('Shifts')}
          />
          <MenuRow
            icon={<Users size={18} color={colors.accent} />}
            title="Working Personnel"
            subtitle="View site staff synced from server"
            onPress={() => navigation.navigate('Personnel')}
          />
          <MenuRow
            icon={<Layers size={18} color={colors.accent} />}
            title="Dia/Depth templates"
            subtitle={`${templates.length} template${templates.length === 1 ? '' : 's'} configured`}
            onPress={() => navigation.navigate('Templates')}
          />
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
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  rowCard: {},
  row: {
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
  rowTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});