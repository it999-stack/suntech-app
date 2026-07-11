// src/components/shared/timeline/MachineStopTimeline.tsx
//
// Reusable stop-log view: pill row to pick a machine, then a vertical
// dot-and-line list of that machine's stops (active / break / idle).
// Knows nothing about plans, piles, or steps.
// Build the stop log with buildMachineStops() from '@/utils/timeline'.

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Drill, Forklift } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { formatTime, formatDurationMinutes } from '@/utils/formatTime';
import { getMachineColor } from '@/utils/helpers';
import { type TimelineStop, type MachineInfo } from '@/types/timeline';

export interface MachineStopTimelineProps {
  /** Machines to choose from, in display order. */
  machines: MachineInfo[];
  stopsByMachineId: Record<string, TimelineStop[]>;
  selectedMachineId?: string;
  onSelectMachine?: (machineId: string) => void;
  dayLabel?: string;
  emptyLabel?: string;
}

function stopColor(kind: TimelineStop['kind'], activeColor: string): string {
  if (kind === 'active') return activeColor;
  if (kind === 'break') return colors.machine.break;
  return colors.machine.idle;
}

function stopKindLabel(kind: TimelineStop['kind']): string {
  if (kind === 'active') return 'Working';
  if (kind === 'break') return 'Break';
  return 'Idle';
}

function StopRow({ stop, color, isLast }: { stop: TimelineStop; color: string; isLast: boolean }) {
  const durationMinutes = (stop.end - stop.start) / 60000;
  const dimmed = stop.kind !== 'active';
  return (
    <View style={styles.logItem}>
      <Text style={styles.logTime}>{formatTime(new Date(stop.start).toISOString())}</Text>
      <View style={styles.logRail}>
        <View style={[styles.logDot, { backgroundColor: color }]} />
        {!isLast && <View style={styles.logLine} />}
      </View>
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

  return (
    <View>
      {stops.map((stop, idx) => (
        <StopRow
          key={stop.id}
          stop={stop}
          color={stopColor(stop.kind, activeColor)}
          isLast={idx === stops.length - 1}
        />
      ))}
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
}: MachineStopTimelineProps) {
  const [internalSelected, setInternalSelected] = useState<string | undefined>(machines[0]?.id);
  const activeId = selectedMachineId ?? internalSelected;

  const typeIndexById = useMemo(() => {
    const counters: Record<string, number> = {};
    const map: Record<string, number> = {};
    machines.forEach((m) => {
      const i = counters[m.type] ?? 0;
      map[m.id] = i;
      counters[m.type] = i + 1;
    });
    return map;
  }, [machines]);

  if (machines.length === 0) {
    return <Text style={styles.detailEmpty}>No machines to show.</Text>;
  }

  const handleSelect = (id: string) => {
    if (onSelectMachine) onSelectMachine(id);
    else setInternalSelected(id);
  };

  const activeMachine = machines.find((m) => m.id === activeId) ?? machines[0];
  const activeColor = getMachineColor(activeMachine, typeIndexById[activeMachine.id] ?? 0);
  const stops = stopsByMachineId[activeMachine.id] ?? [];

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {machines.map((m) => {
          const color = getMachineColor(m, typeIndexById[m.id] ?? 0);
          const on = m.id === activeMachine.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => handleSelect(m.id)}
              style={[
                styles.pill,
                {
                  backgroundColor: on ? `${color}22` : colors.glassFill,
                  borderColor: on ? `${color}55` : 'transparent',
                },
              ]}
            >
              {m.type === 'RIG' ? <Drill size={16} color={color} /> : <Forklift size={16} color={color} />}
              <Text style={[styles.pillText, { color: on ? color : colors.textSecondary }]}>
                {m.machineNo}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.selHeadRow}>
        {activeMachine.type === 'RIG' ? <Drill size={16} color={activeColor} /> : <Forklift size={16} color={activeColor} />}
        <Text style={[styles.selName, { color: activeColor }]}>
          {activeMachine.machineNo} · {activeMachine.type === 'RIG' ? 'Rig' : 'Crane'}
        </Text>
        {dayLabel ? (
          <View style={styles.selDayBadge}>
            <Text style={styles.selDayText}>{dayLabel}</Text>
          </View>
        ) : null}
      </View>

      <TimelineStopLog stops={stops} activeColor={activeColor} emptyLabel={emptyLabel} />

      <View style={styles.legendRow}>
        <View style={styles.legendChip}>
          <View style={[styles.legendDot, { backgroundColor: activeColor }]} />
          <Text style={styles.legendText}>Working</Text>
        </View>
        <View style={styles.legendChip}>
          <View style={[styles.legendDot, { backgroundColor: colors.machine.break }]} />
          <Text style={styles.legendText}>Break</Text>
        </View>
        <View style={styles.legendChip}>
          <View style={[styles.legendDot, { backgroundColor: colors.machine.idle }]} />
          <Text style={styles.legendText}>Idle</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
  selHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  selName: { fontSize: 14, fontWeight: '800' },
  selDayBadge: {
    marginLeft: 'auto',
    backgroundColor: colors.glassFill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  selDayText: { fontSize: 10.5, fontWeight: '700', color: colors.textSecondary },
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
    borderColor: '#fff',
    marginTop: 2,
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
