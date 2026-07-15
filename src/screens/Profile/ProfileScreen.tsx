// src/screens/ProfileScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Building2,
  RefreshCw,
  LogOut,
  Info,
  Sprout,
} from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useAuthStore } from '@store/authStore';
import { useSyncStore } from '@store/syncStore';
import { useSiteSettings } from '@state/SiteSettingsContext';
import { usePilesAreasStore } from '@store/pilesAreasStore';
import { seedYesterdayFromToday, clearAllPendingWork } from '@/services/seedResumeWork';

const APP_VERSION = '0.1.0';

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>{icon}</View>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a unix ms timestamp to a human-readable relative label. */
function formatSyncTime(ts: number | null): string {
  if (ts === null) return 'Never synced';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { isSyncing, lastSyncedAt, pilesCount, error: syncError, loadLastSyncTime, sync } = useSyncStore();
  const { reloadFromDb } = useSiteSettings();

  const displayName = user?.name ?? 'Unknown';
  const displayEmail = user?.email ?? '';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase();

  const today = toLocalDateStr(new Date());
  const [isSeeding, setIsSeeding] = useState(false);

  // Load last sync time from local DB when screen mounts
  useEffect(() => {
    if (user?.siteId) {
      loadLastSyncTime(user.siteId);
    }
  }, [user?.siteId]);

  const handleSync = async () => {
    if (!user?.siteId) {
      Alert.alert('No site assigned', 'You are not assigned to any site. Contact your administrator.');
      return;
    }
    try {
      await sync(user.siteId);
      await reloadFromDb(user.siteId);
      // Refresh piles after sync completes so the UI reflects new data
      await usePilesAreasStore.getState().reload();
    } catch {
      // error surfaced via syncError in the modal + card
    }
  };

  const handleSeed = async () => {
    if (!user?.siteId) {
      Alert.alert('No site assigned', 'You are not assigned to any site. Contact your administrator.');
      return;
    }

    const yesterday = toLocalDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));

    Alert.alert(
      'Seed Resume Work',
      `This will seed ${yesterday}'s date with today's incomplete work so you can test the resume work feature. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed',
          style: 'default',
          onPress: async () => {
            setIsSeeding(true);
            try {
              const result = await seedYesterdayFromToday(user.siteId ?? '', today);
              if (result.yesterdayChecklistCreated) {
                Alert.alert(
                  'Seed Complete',
                  `Created yesterday's checklist with ${result.pendingWorkSeeded} pending work items. You can now generate a new plan for today.`,
                );
              } else {
                Alert.alert('No Action', "No checklist exists for today, or yesterday already has a checklist.");
              }
            } catch (e) {
              Alert.alert('Error', `Failed to seed: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setIsSeeding(false);
            }
          },
        },
      ]
    );
  };

  const handleClearPending = async () => {
    Alert.alert(
      'Clear Pending Work',
      'This will clear all pending work entries from the database. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllPendingWork();
              Alert.alert('Cleared', 'All pending work entries have been removed.');
            } catch (e) {
              Alert.alert('Error', `Failed to clear: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'You will need an internet connection to log back in. Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // RootNavigator automatically redirects to Auth stack
            // once token is cleared from the store.
          },
        },
      ]
    );
  };

  const syncSubtext = syncError
    ? syncError.includes('Network')
      ? 'Offline — sync pending'
      : 'Sync failed'
    : formatSyncTime(lastSyncedAt);

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageTitle}>Profile</Text>

          {/* Identity card */}
          <GlassCard style={{ marginTop: spacing.lg }}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userRole}>{displayEmail}</Text>
              </View>
            </View>
          </GlassCard>

          {/* Site */}
          <GlassCard style={{ marginTop: spacing.lg }}>
            <Row
              icon={<Building2 size={18} color={colors.accent} />}
              label="Active site"
              value={user?.siteName ?? '—'}
            />
          </GlassCard>

          {/* Sync status */}
          <GlassCard style={{ marginTop: spacing.lg }}>
            <View style={styles.rowBetween}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}>
                  <RefreshCw size={18} color={colors.accent} />
                </View>
                <View>
                  <Text style={styles.rowLabel}>Sync status</Text>
                  <Text style={[styles.syncSubtext, syncError ? styles.syncError : null]}>
                    {syncSubtext}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={handleSync}
                disabled={isSyncing}
                style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.syncButtonText}>Sync now</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>

          {/* Seed Resume Work (Testing) */}
          <GlassCard style={{ marginTop: spacing.lg }}>
            <Row
              icon={<Sprout size={18} color={colors.accent} />}
              label="Seed Resume Work"
              onPress={handleSeed}
            />
            <Divider />
            <Row
              icon={<Info size={18} color={colors.warning} />}
              label="Clear Pending Work"
              onPress={handleClearPending}
            />
          </GlassCard>

          {/* App info + logout */}
          <GlassCard style={{ marginTop: spacing.lg }}>
            <Row
              icon={<Info size={18} color={colors.textSecondary} />}
              label="App version"
              value={APP_VERSION}
            />
            <Divider />
            <Row
              icon={<LogOut size={18} color={colors.danger} />}
              label="Log out"
              onPress={handleLogout}
              danger
            />
          </GlassCard>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h2,
    color: colors.accent,
  },
  userName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  userRole: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDanger: {
    backgroundColor: colors.dangerSoft,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowLabelDanger: {
    color: colors.danger,
  },
  rowValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.06)',
    marginVertical: spacing.xs,
  },

  syncSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncError: {
    color: colors.danger,
  },
  syncButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    minWidth: 80,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textInverse,
  },

  pressed: {
    opacity: 0.7,
  },
});