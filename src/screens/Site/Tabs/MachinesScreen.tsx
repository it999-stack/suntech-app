// src/screens/Profile/site-settings/MachinesScreen.tsx
// Displays the list of machines synced for the current site.

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
import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { TRACK_META } from '@utils/helpers';
import { useAuthStore } from '@store/authStore';
import type { PilingMachine } from '@db/schema';

// Status → dot/text style + label. Unrecognized values (server/enum drift)
// fall back to the INACTIVE treatment rather than crashing or looking "active".
function statusMeta(status: string): { dot: object; text: object; label: string } {
  if (status === 'ACTIVE') return { dot: styles.dotActive, text: styles.statusTextActive, label: 'Active' };
  if (status === 'BREAKDOWN') return { dot: styles.dotBreakdown, text: styles.statusTextBreakdown, label: 'Reported Down' };
  if (status === 'IDLE') return { dot: styles.dotIdle, text: styles.statusTextIdle, label: 'Idle' };
  return { dot: styles.dotInactive, text: styles.statusTextInactive, label: 'Inactive' };
}

function MachineCard({ machine }: { machine: PilingMachine }) {
  const meta = TRACK_META[machine.type as keyof typeof TRACK_META] ?? TRACK_META.RIG;
  const Icon = meta.icon;
  const status = statusMeta(machine.status);

  return (
    <GlassCard innerStyle={styles.card}>
      {/* Left: identity + status */}
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={styles.machineName} numberOfLines={1}>
            {machine.machineNo}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: meta.soft }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, status.dot]} />
          <Text style={[styles.statusText, status.text]}>{status.label}</Text>
        </View>
      </View>

      {/* Right: type icon avatar */}
      <View style={[styles.iconAvatar, { backgroundColor: meta.soft }]}>
        <Icon color={meta.color} size={28} strokeWidth={1.75} />
      </View>
    </GlassCard>
  );
}

export default function MachinesScreen() {
  const siteId = useAuthStore((s) => s.user?.siteId);
  const [machines, setMachines] = useState<PilingMachine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }
    getMachinesBySite(siteId)
      .then(setMachines)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={[]}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Machines</Text>
          <Text style={styles.pageSubtitle}>
            {machines.length} machine{machines.length === 1 ? '' : 's'} on site
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : machines.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No machines synced yet.</Text>
            <Text style={styles.emptyHint}>Pull a fresh sync from the home screen.</Text>
          </View>
        ) : (
          <FlatList
            data={machines}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MachineCard machine={item} />}
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
    justifyContent: 'space-between',
    padding: spacing.md,
    width: '100%',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  machineName: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 17,
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
    color: colors.white,
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
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: '#4ade80' },
  dotInactive: { backgroundColor: '#f87171' },
  dotBreakdown: { backgroundColor: colors.danger },
  dotIdle: { backgroundColor: colors.warning },
  statusText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: { color: '#4ade80' },
  statusTextInactive: { color: '#f87171' },
  statusTextBreakdown: { color: colors.danger },
  statusTextIdle: { color: colors.warning },
  iconAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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