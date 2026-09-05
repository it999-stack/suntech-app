// src/screens/ProfileScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import {
  Building2,
  RefreshCw,
  LogOut,
  Info,
  Phone,
} from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import Button from '@components/shared/Button';
import CoordinatorCallModal from '@components/shared/CoordinatorCallModal';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useAuthStore } from '@store/authStore';
import { useSyncStore } from '@store/syncStore';
import { usePilesLocationsStore } from '@store/pilesLocationsStore';
import { getPendingCount } from '@repositories/syncQueueRepository';
import { onQueueChanged } from '@sync/SyncManager';
import { getSiteCoordinatorsBySite } from '@repositories/siteCoordinatorsRepository';
import { callPhone } from '@utils/phone';
import type { PilSiteCoordinator } from '@db/schema';

const APP_VERSION = '1.0.0';

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

  const displayName = user?.name ?? 'Unknown';
  const displayEmail = user?.email ?? '';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase();

  const [pendingCount, setPendingCount] = useState(0);
  const [supportContacts, setSupportContacts] = useState<PilSiteCoordinator[]>([]);
  const [supportPickerVisible, setSupportPickerVisible] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Load the site's support contacts for the "Need help and support" card.
  useEffect(() => {
    if (!user?.siteId) return;
    getSiteCoordinatorsBySite(user.siteId).then(setSupportContacts).catch(() => {});
  }, [user?.siteId]);

  // One contact: call them directly, no picker needed. Multiple: open the
  // shared picker so the user can choose who to call.
  const handleSupportPress = () => {
    if (supportContacts.length === 1) {
      callPhone(supportContacts[0].phone);
    } else if (supportContacts.length > 1) {
      setSupportPickerVisible(true);
    }
  };

  // Load last sync time from local DB when screen mounts
  useEffect(() => {
    if (user?.siteId) {
      loadLastSyncTime(user.siteId);
    }
  }, [user?.siteId]);

  // Pending-count indicator: reflects pil_sync_queue in real time — refreshed
  // on mount and after every automatic/manual flush attempt.
  useEffect(() => {
    const refresh = () => {
      getPendingCount().then(setPendingCount).catch(() => {});
    };
    refresh();
    return onQueueChanged(refresh);
  }, []);

  const handleSync = async () => {
    if (!user?.siteId) {
      notify.error('You are not assigned to any site. Contact your administrator.', { title: 'No site assigned' });
      return;
    }
    try {
      await sync(user.siteId);
      // Refresh piles after sync completes so the UI reflects new data
      await usePilesLocationsStore.getState().reload();
    } catch {
      // error surfaced via syncError in the modal + card
    }
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const handleConfirmLogout = async () => {
    await logout();
    // RootNavigator automatically redirects to Auth stack
    // once token is cleared from the store.
    setLogoutConfirmOpen(false);
  };

  const syncSubtext = syncError
    ? syncError.includes('Network')
      ? 'Offline — sync pending'
      : 'Sync failed'
    : formatSyncTime(lastSyncedAt);

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
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
                  {pendingCount > 0 && (
                    <Text style={styles.syncPendingText}>
                      {pendingCount} change{pendingCount === 1 ? '' : 's'} pending sync
                    </Text>
                  )}
                </View>
              </View>
              <Button
                size="sm"
                label="Sync now"
                icon={RefreshCw}
                loading={isSyncing}
                onPress={handleSync}
                style={styles.syncButton}
              />
            </View>
          </GlassCard>

          {/* Need help and support */}
          {supportContacts.length > 0 && (
            <GlassCard style={{ marginTop: spacing.lg }}>
              <Row
                icon={<Phone size={18} color={colors.accent} />}
                label="Need help and support"
                value={
                  supportContacts.length === 1
                    ? (supportContacts[0].phone ?? undefined)
                    : `${supportContacts.length} contacts`
                }
                onPress={handleSupportPress}
              />
            </GlassCard>
          )}

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
      </View>

      <CoordinatorCallModal
        visible={supportPickerVisible}
        onClose={() => setSupportPickerVisible(false)}
        title="Need help and support"
        coordinators={supportContacts}
      />

      <ConfirmDialog
        visible={logoutConfirmOpen}
        title="Log out"
        message="You will need an internet connection to log back in. Are you sure you want to log out?"
        confirmLabel="Log out"
        destructive
        onConfirm={handleConfirmLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </View>
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
    paddingVertical: spacing.sm,
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
  syncPendingText: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
  },
  syncButton: { minWidth: 90 },

  pressed: {
    opacity: 0.7,
  },
});