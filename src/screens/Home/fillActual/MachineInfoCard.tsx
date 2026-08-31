// src/screens/Home/fillActual/MachineInfoCard.tsx
//
// Shows which machine a MachinePilesPage belongs to, its live status
// (including a highlighted "Idle since" timer box while idle), the entry
// point into ReorderPilesOverlay, and quick actions to log a breakdown or
// toggle an idle session without leaving the Log Actuals screen.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowDownUp, Coffee, AlertTriangle, Play, Clock3, CalendarClock } from 'lucide-react-native';
import { colors, spacing, typography, radius } from '@theme/theme';
import { formatElapsedHMS, formatTime } from '@utils/formatTime';
import { TRACK_META } from '@utils/helpers';
import { useElapsedSeconds } from '@hooks/useElapsedSeconds';
import GlassCard from '@components/shared/GlassCard';
import Button from '@components/shared/Button';
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

/** Short muted sub-status next to the status dot — only for the plain
 * "Online" case, where it's useful context (does this machine actually have
 * work queued right now?). Idle and breakdown already say enough via the
 * status label itself (plus the idle timer box below), so nothing extra. */
function subStatusLabel(status: string | undefined, isIdle: boolean, hasActiveStep: boolean): string | undefined {
  if (isIdle || status !== 'ACTIVE') return undefined;
  return hasActiveStep ? 'Ready for work' : undefined;
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
  const meta = TRACK_META[machine.type];
  const Icon = meta.icon;
  const statusMeta = pileScreenStatusMeta(status);
  const isIdle = !!openIdle;
  const isDown = status === 'BREAKDOWN';
  const idleElapsedSeconds = useElapsedSeconds(openIdle?.since ?? null);
  const statusLabel = isIdle ? 'Idle' : statusMeta.label;
  const statusColor = isIdle ? colors.warning : statusMeta.color;
  const subLabel = subStatusLabel(status, isIdle, hasActiveStep);

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
              {subLabel && <Text style={styles.machineSubStatusText}> · {subLabel}</Text>}
            </View>
          </View>
        </View>
        <Button label="Reorder" icon={ArrowDownUp} variant="secondary" size="sm" onPress={onEditSequence} />
      </View>

      <View style={styles.divider} />

      {isIdle && openIdle && (
        <View style={styles.idleTimerBox}>
          <Clock3 size={16} color={colors.warning} />
          <Text style={styles.idleTimerSince}>Idle since {formatTime(openIdle.since)}</Text>
          <Text style={styles.idleTimerElapsed}>{formatElapsedHMS(idleElapsedSeconds)}</Text>
        </View>
      )}

      <View style={styles.logEventHeader}>
        <View style={styles.logEventIconWrap}>
          <CalendarClock size={18} color={colors.accentBlue} />
        </View>
        <View style={styles.logEventTextWrap}>
          <Text style={styles.logEventTitle}>Log machine event</Text>
          <Text style={styles.logEventSubtitle}>Report an issue or set idle if required.</Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        {isDown ? (
          <MachineActionPill icon={Play} label="Resume" variant="primary" onPress={onBreakdown} />
        ) : (
          <MachineActionPill
            icon={AlertTriangle}
            label="Report issue"
            variant="danger"
            onPress={onBreakdown}
          />
        )}
        {isIdle ? (
          <MachineActionPill icon={Play} label="End idle" variant="primary" onPress={onEndIdle} />
        ) : (
          <MachineActionPill
            icon={Coffee}
            label="Start idle"
            variant="outline"
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
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: colors.border,
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
  machineSubStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  logEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logEventIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logEventTextWrap: {
    flex: 1,
  },
  logEventTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  logEventSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
});
