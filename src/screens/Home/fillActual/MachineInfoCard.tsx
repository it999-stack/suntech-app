// src/screens/Home/fillActual/MachineInfoCard.tsx
//
// Shows which machine a MachinePilesPage belongs to, its live status
// (including a highlighted "Idle since" timer box while idle), the entry
// point into ReorderPilesOverlay, and quick actions to log a breakdown or
// toggle an idle session without leaving the Log Actuals screen.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ArrowDownUp, Drill, Forklift, Coffee, AlertTriangle, Play, Clock3 } from 'lucide-react-native';
import { colors, spacing, typography, radius } from '@theme/theme';
import { formatElapsedHMS, formatTime } from '@utils/formatTime';
import { useElapsedSeconds } from '@hooks/useElapsedSeconds';
import GlassCard from '@components/shared/GlassCard';
import MachineActionPill from './MachineActionPill';
import type { OpenIdleSession } from './useMachineEvents';
import type { MachineBadge } from './useMachinePages';

/** Machine availability, worded for this screen ("Online" reads better here
 * than the fleet screen's "Active" for a machine currently being worked). */
function pileScreenStatusMeta(status: string | undefined): { label: string; color: string } {
  if (status === 'ACTIVE') return { label: 'Online', color: colors.success };
  if (status === 'BREAKDOWN') return { label: 'Reported Down', color: colors.danger };
  if (status === 'IDLE') return { label: 'Idle', color: colors.warning };
  return { label: 'Inactive', color: colors.textSecondary };
}

export default function MachineInfoCard({
  machine,
  status,
  openIdle,
  hasActiveStep,
  onEditSequence,
  onBreakdown,
  onStartIdle,
  onEndIdle,
}: {
  machine: MachineBadge;
  status: string | undefined;
  openIdle?: OpenIdleSession;
  hasActiveStep: boolean;
  onEditSequence: () => void;
  onBreakdown: () => void;
  onStartIdle: () => void;
  onEndIdle: () => void;
}) {
  const meta = machine.type === 'RIG' ? colors.machines.rig : colors.machines.crane;
  const Icon = machine.type === 'RIG' ? Drill : Forklift;
  const statusMeta = pileScreenStatusMeta(status);
  const isIdle = !!openIdle;
  const idleElapsedSeconds = useElapsedSeconds(openIdle?.since ?? null);
  const statusLabel = isIdle ? 'Idle' : statusMeta.label;
  const statusColor = isIdle ? colors.warning : statusMeta.color;

  return (
    <GlassCard
      style={[styles.machineInfoCard, isIdle && styles.machineInfoCardIdle]}
      innerStyle={styles.machineInfoCardInner}
    >
      <View style={styles.machineInfoTopRow}>
        <View style={styles.machineInfoLeft}>
          <View style={[styles.machineIconWrap, { backgroundColor: meta.soft }]}>
            <Icon size={18} color={meta.color} />
          </View>
          <View>
            <Text style={styles.machineInfoTitle} numberOfLines={1}>
              {machine.type === 'RIG' ? 'Rig' : 'Crane'}: {machine.machineNo}
            </Text>
            <View style={styles.machineStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.machineStatusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.reorderPill} onPress={onEditSequence} hitSlop={spacing.sm}>
          <ArrowDownUp size={14} color={colors.textPrimary} />
          <Text style={styles.reorderPillText}>Reorder</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {isIdle && openIdle && (
        <View style={styles.idleTimerBox}>
          <Clock3 size={16} color={colors.warning} />
          <Text style={styles.idleTimerSince}>Idle since {formatTime(openIdle.since)}</Text>
          <Text style={styles.idleTimerElapsed}>{formatElapsedHMS(idleElapsedSeconds)}</Text>
        </View>
      )}

      <Text style={styles.logEventLabel}>Log machine event</Text>
      <View style={styles.actionRow}>
        <MachineActionPill
          icon={AlertTriangle}
          label="Breakdown"
          variant="danger"
          disabled={!hasActiveStep}
          onPress={onBreakdown}
        />
        {isIdle ? (
          <MachineActionPill icon={Play} label="End idle" variant="primary" onPress={onEndIdle} />
        ) : (
          <MachineActionPill
            icon={Coffee}
            label="Start idle"
            variant="outline"
            disabled={!hasActiveStep}
            onPress={onStartIdle}
          />
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  machineInfoCard: {
    width: '100%',
    alignSelf: 'stretch',
  },
  machineInfoCardIdle: {
    borderWidth: 1,
    borderColor: colors.warning,
  },
  machineInfoCardInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  machineInfoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  machineInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  machineIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineInfoTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  machineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  machineStatusText: {
    ...typography.caption,
    fontWeight: '700',
  },
  reorderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFillStrong,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  reorderPillText: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  idleTimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  idleTimerSince: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
    flex: 1,
  },
  idleTimerElapsed: {
    ...typography.body,
    fontWeight: '800',
    color: colors.warning,
    fontVariant: ['tabular-nums'],
  },
  logEventLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'left',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
});
