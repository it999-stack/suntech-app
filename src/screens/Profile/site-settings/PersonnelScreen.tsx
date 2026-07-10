// src/screens/Profile/site-settings/PersonnelScreen.tsx
// Displays the list of working personnel synced for the current site.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserCircle2 } from 'lucide-react-native';

import { colors, spacing, radius, typography } from '../../../theme/theme';
import GlassCard from '../../../components/shared/GlassCard';
import { getPersonnelBySite } from '../../../repositories/personnelRepository';
import { useAuthStore } from '../../../store/authStore';
import type { PilingPersonnel } from '../../../db/schema';

function PersonnelCard({ person }: { person: PilingPersonnel }) {
  const isActive = person.isActive;

  return (
    <GlassCard innerStyle={styles.card}>
      {/* Left: avatar icon */}
      <LinearGradient
        colors={isActive ? ['#2b5f8a', '#1e3a5f'] : ['#3a3a4a', '#22222e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconAvatar}
      >
        <UserCircle2 color="#ffffff" size={28} strokeWidth={1.75} />
      </LinearGradient>

      {/* Right: details */}
      <View style={styles.cardBody}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.name}
        </Text>

        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Text style={styles.badgeText}>{person.designation}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotInactive]} />
          <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>
            {isActive ? 'Active' : 'Inactive'}
          </Text>
          {person.phone ? (
            <Text style={styles.phoneText} numberOfLines={1}>
              · {person.phone}
            </Text>
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
}

export default function PersonnelScreen() {
  const siteId = useAuthStore((s) => s.user?.siteId);
  const [personnel, setPersonnel] = useState<PilingPersonnel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }
    getPersonnelBySite(siteId)
      .then(setPersonnel)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Working Personnel</Text>
          <Text style={styles.pageSubtitle}>
            {personnel.length} person{personnel.length === 1 ? '' : 's'} on site
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : personnel.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No personnel synced yet.</Text>
            <Text style={styles.emptyHint}>Pull a fresh sync from the home screen.</Text>
          </View>
        ) : (
          <FlatList
            data={personnel}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => <PersonnelCard person={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    width: '100%',
  },
  iconAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  personName: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
    color: colors.textPrimary,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: '#4ade80' },
  dotInactive: { backgroundColor: '#f87171' },
  statusText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: { color: '#4ade80' },
  statusTextInactive: { color: '#f87171' },
  phoneText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    opacity: 0.6,
  },
});
