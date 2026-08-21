// src/components/shared/timeline/MachineStopTimeline.tsx
//
// Reusable stop-log view: swipeable pill bar to pick a machine (via
// SwipeableTabBar), then a vertical dot-and-line list of that machine's
// stops (active / break / idle). Knows nothing about plans, piles, or steps.
// Build the stop log with buildMachineStops() from '@/utils/timeline'.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Drill, Forklift, ArrowUpDown } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { formatTime, formatDurationMinutes } from '@/utils/formatTime';
import { TRACK_META } from '@/utils/helpers';
import { type TimelineStop, type MachineInfo } from '@/types/timeline';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import InfoRow from '@components/shared/InfoRow';
import Avatar from '@components/shared/Avatar';

export interface MachineStopTimelineProps {
  /** Machines to choose from, in display order. */
  machines: MachineInfo[];
  stopsByMachineId: Record<string, TimelineStop[]>;
  selectedMachineId?: string;
  onSelectMachine?: (machineId: string) => void;
  dayLabel?: string;
  emptyLabel?: string;
  /** Shows a pencil icon next to the machine label when provided, e.g. to open a reorder modal. */
  onEditMachine?: (machineId: string) => void;
}

function stopColor(kind: TimelineStop['kind'], activeColor: string): string {
  if (kind === 'active') return activeColor;
  if (kind === 'break') return colors.machines.break;
  if (kind === 'buffer') return colors.accentBlue;
  return colors.machines.idle;
}

function stopKindLabel(kind: TimelineStop['kind']): string {
  if (kind === 'active') return 'Working';
  if (kind === 'break') return 'Break';
  if (kind === 'buffer') return 'Buffer';
  return 'Idle';
}

function StopRow({
  stop,
  color,
  isLast,
  isNewPile,
}: {
  stop: TimelineStop;
  color: string;
  isLast: boolean;
  isNewPile: boolean;
}) {
  const durationMinutes = (stop.end - stop.start) / 60000;
  const dimmed = stop.kind !== 'active';
  return (
    <View style={styles.logItem}>
      <Text style={styles.logTime}>{formatTime(new Date(stop.start).toISOString())}</Text>
      <View style={styles.logRail}>
        <View
          style={[
            styles.logDot,
            { backgroundColor: color },
            isNewPile && styles.logDotNewPile,
          ]}
        />
        {!isLast && <View style={styles.logLine} />}
      </View>
      {stop.kind === 'buffer' ? (
        <View style={styles.logCardBuffer}>
          <Text style={styles.logBufferText}>
            {stop.kindLabel ?? stopKindLabel(stop.kind)} · {formatDurationMinutes(durationMinutes)}
          </Text>
        </View>
      ) : (
        <View style={[styles.logCard, dimmed && styles.logCardDim]}>
          <Text style={[styles.logKind, { color: stop.kind === 'active' ? color : colors.textSecondary }]}>
            {stop.kindLabel ?? stopKindLabel(stop.kind)}
          </Text>
          <Text style={styles.logTitle}>{stop.title}</Text>
          {stop.subtitle ? <Text style={styles.logSubtitle}>{stop.subtitle}</Text> : null}
          {stop.showDuration !== false ? (
            <Text style={styles.logDuration}>
            {formatDurationMinutes(durationMinutes)} · until {formatTime(new Date(stop.end).toISOString())}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

export interface TimelineStopLogProps {
  stops: TimelineStop[];
  activeColor: string;
  emptyLabel?: string;
}

/** Shared vertical stop-log used by the machine and plan-window timelines. */
export function TimelineStopLog({
  stops,
  activeColor,
  emptyLabel = 'No scheduled activity.',
}: TimelineStopLogProps) {
  if (stops.length === 0) return <Text style={styles.detailEmpty}>{emptyLabel}</Text>;

  let lastActivePileTitle: string | undefined;

  return (
    <View>
      {stops.map((stop, idx) => {
        // A "new pile" starts at an active stop whose pile (title) differs
        // from the last active stop's — including the very first one.
        const isNewPile = stop.kind === 'active' && stop.title !== lastActivePileTitle;
        if (stop.kind === 'active') lastActivePileTitle = stop.title;
        return (
          <StopRow
            key={stop.id}
            stop={stop}
            color={stopColor(stop.kind, activeColor)}
            isLast={idx === stops.length - 1}
            isNewPile={isNewPile}
          />
        );
      })}
    </View>
  );
}

export default function MachineStopTimeline({
  machines,
  stopsByMachineId,
  selectedMachineId,
  onSelectMachine,
  dayLabel,
  emptyLabel = 'No activity scheduled for this machine.',
  onEditMachine,
}: MachineStopTimelineProps) {
  const [internalSelected, setInternalSelected] = useState<string | undefined>(machines[0]?.id);
  const activeId = selectedMachineId ?? internalSelected;

  if (machines.length === 0) {
    return <Text style={styles.detailEmpty}>No machines to show.</Text>;
  }

  const handleSelect = (id: string) => {
    if (onSelectMachine) onSelectMachine(id);
    else setInternalSelected(id);
  };

  const items: SwipeableTabItem[] = machines.map((m) => ({
    value: m.id,
    label: m.machineNo,
    color: TRACK_META[m.type].color,
    renderIcon: (color) =>
      m.type === 'RIG' ? <Drill size={16} color={color} /> : <Forklift size={16} color={color} />,
  }));

  return (
    <SwipeableTabBar
      items={items}
      value={activeId ?? machines[0].id}
      onChange={handleSelect}
      scrollHint="dots"
      renderPage={(item) => {
        const machine = machines.find((m) => m.id === item.value) ?? machines[0];
        const color = item.color!;
        const stops = stopsByMachineId[machine.id] ?? [];
        return (
          <View>
            <InfoRow
              leading={
                <Avatar
                  name={machine.machineNo}
                  icon={machine.type === 'RIG' ? Drill : Forklift}
                  size={40}
                  backgroundColor={color}
                  borderColor={color}
                  textColor={colors.white}
                />
              }
              title={machine.machineNo}
              caption={`${machine.type === 'RIG' ? 'Rig' : 'Crane'}${dayLabel ? ` · ${dayLabel}` : ''}`}
              accentColor={color}
              onPress={onEditMachine ? () => onEditMachine(machine.id) : undefined}
              trailing={onEditMachine ? <ArrowUpDown size={16} color={color} /> : undefined}
            />

            <ScrollView
              style={styles.logScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <TimelineStopLog stops={stops} activeColor={color} emptyLabel={emptyLabel} />
            </ScrollView>

            <View style={styles.legendRow}>
              <View style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>Working</Text>
              </View>
              <View style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: colors.accentBlue }]} />
                <Text style={styles.legendText}>Buffer</Text>
              </View>
              <View style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: colors.machines.break }]} />
                <Text style={styles.legendText}>Break</Text>
              </View>
              <View style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: colors.machines.idle }]} />
                <Text style={styles.legendText}>Idle</Text>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  logScroll: { maxHeight: 520 },
  logItem: { flexDirection: 'row', gap: spacing.sm },
  logTime: {
    width: 58,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
    paddingTop: 2,
  },
  logRail: { width: 14, alignItems: 'center' },
  logDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.white,
    marginTop: 2,
  },
  logDotNewPile: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: colors.accentBlue,
    backgroundColor: colors.backdropStart,
    marginTop: 0,
  },
  logLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.08)',
    marginTop: 2,
    minHeight: 24,
  },
  logCard: {
    flex: 1,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    marginTop: -2,
  },
  logCardDim: { backgroundColor: 'rgba(28,28,46,0.03)' },
  logCardBuffer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.backdropStart,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: -2,
    minHeight: 22,
  },
  logBufferText: {
    ...typography.caption,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  logKind: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  logTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  logSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  logDuration: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: 'rgba(28,28,46,0.05)',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 6,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  detailEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
});
