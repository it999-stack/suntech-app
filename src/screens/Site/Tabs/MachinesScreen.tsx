// src/screens/Profile/site-settings/MachinesScreen.tsx
// Displays the site's machines grouped by track (Rigs/Cranes/Compressors),
// with a tap-to-filter stats row on top — no search/filter bar, no add
// button; this screen is status-at-a-glance + report breakdown/resume only.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { TRACK_META, STATUS_META, type MachineKind, type MachineStatus } from '@utils/helpers';
import { useAuthStore } from '@store/authStore';
import type { PilingMachine } from '@db/schema';
import MachineReportModal from './MachineReportModal';
import MachineStatsGrid, { type MachineStatFilter, type MachineStats } from './MachineStatsGrid';

// The Machines screen only offers the ACTIVE<->BREAKDOWN toggle (report /
// resume) — IDLE/INACTIVE are set elsewhere (plan generation's machine
// status editor), not from this fleet list.
const REPORTABLE_STATUSES = new Set(['ACTIVE', 'BREAKDOWN']);

const GROUP_ORDER: MachineKind[] = ['RIG', 'CRANE', 'COMPRESSOR'];
const GROUP_LABEL: Record<MachineKind, string> = { RIG: 'Rigs', CRANE: 'Cranes', COMPRESSOR: 'Compressors' };

function MachineRow({ machine, onPress }: { machine: PilingMachine; onPress: () => void }) {
  const meta = TRACK_META[machine.type as MachineKind] ?? TRACK_META.RIG;
  const Icon = meta.icon;
  const status = STATUS_META[machine.status as MachineStatus] ?? STATUS_META.INACTIVE;
  const reportable = REPORTABLE_STATUSES.has(machine.status);

  const card = (
    <GlassCard innerStyle={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: meta.soft }]}>
        <Icon color={meta.color} size={20} strokeWidth={1.75} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowName} numberOfLines={1}>
          {machine.machineNo}
        </Text>
        <Text style={[styles.rowStatus, { color: status.color }]}>{status.label}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </GlassCard>
  );

  if (!reportable) return card;
  return <Pressable onPress={onPress}>{card}</Pressable>;
}

export default function MachinesScreen() {
  const siteId = useAuthStore((s) => s.user?.siteId);
  const [machines, setMachines] = useState<PilingMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [statFilter, setStatFilter] = useState<MachineStatFilter>('ALL');
  const [reportTarget, setReportTarget] = useState<PilingMachine | null>(null);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }
    getMachinesBySite(siteId)
      .then(setMachines)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  function handleReported(machineId: string, status: 'ACTIVE' | 'BREAKDOWN') {
    setMachines((prev) => prev.map((m) => (m.id === machineId ? { ...m, status } : m)));
  }

  const stats: MachineStats = useMemo(
    () => ({
      total: machines.length,
      active: machines.filter((m) => m.status === 'ACTIVE').length,
      idle: machines.filter((m) => m.status === 'IDLE').length,
      breakdown: machines.filter((m) => m.status === 'BREAKDOWN').length,
    }),
    [machines],
  );

  const filteredMachines = useMemo(
    () => (statFilter === 'ALL' ? machines : machines.filter((m) => m.status === statFilter)),
    [machines, statFilter],
  );

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((type) => ({ type, items: filteredMachines.filter((m) => m.type === type) })).filter(
        (g) => g.items.length > 0,
      ),
    [filteredMachines],
  );

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Machines</Text>
          <MachineStatsGrid stats={stats} activeFilter={statFilter} onSelectFilter={setStatFilter} />
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {machines.length === 0 ? 'No machines synced yet.' : 'No machines match this filter.'}
            </Text>
            {machines.length === 0 && <Text style={styles.emptyHint}>Pull a fresh sync from the home screen.</Text>}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {groups.map((g) => (
              <View key={g.type} style={styles.group}>
                <Text style={styles.groupHeader}>
                  {GROUP_LABEL[g.type]} ({g.items.length})
                </Text>
                <View style={styles.groupRows}>
                  {g.items.map((m) => (
                    <MachineRow key={m.id} machine={m} onPress={() => setReportTarget(m)} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {reportTarget && (
          <MachineReportModal
            visible
            machineId={reportTarget.id}
            machineLabel={reportTarget.machineNo}
            track={reportTarget.type as 'RIG' | 'CRANE' | 'COMPRESSOR'}
            currentStatus={reportTarget.status}
            onClose={() => setReportTarget(null)}
            onReported={handleReported}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  group: {
    marginBottom: spacing.md,
  },
  groupHeader: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  groupRows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    width: '100%',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowStatus: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
