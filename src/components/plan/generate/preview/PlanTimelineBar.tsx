// src/components/plan/generate/preview/PlanTimelineBar.tsx
//
// Visual timeline showing one row per active machine (R-01, R-02, C-01, C-02…).
// Each row shows working (machine-colored), break (yellow), and unused (grey) segments.
// Vertical gridlines mark quarter-day intervals.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { formatTime } from '@/utils/formatTime';
import { formatMinutes } from './previewUtils';
import type { PlanStepWithMeta } from '@repositories/planRepository';

// ─── Types ────────────────────────────────────────────────────────────────────

type SegmentType = 'work' | 'break' | 'unused';

type TimelineSegment = {
  type: SegmentType;
  start: number;
  end: number;
  widthPct: number;
};

export type MachineInfo = {
  id: string;
  machineNo: string;
  type: 'RIG' | 'CRANE';
};

/** Gaps shorter than this are absorbed into adjacent work segments. */
const MIN_VISIBLE_GAP_MINUTES = 10;

const RIG_COLORS = ['#7c3aed', '#9333ea', '#a855f7', '#c084fc'];
const CRANE_COLORS = ['#0369a1', '#0284c7', '#0ea5e9', '#38bdf8'];
const BREAK_COLOR = '#fbbf24';
const UNUSED_COLOR = '#e4e4e7';

function getMachineColor(machine: MachineInfo, index: number): string {
  const palette = machine.type === 'RIG' ? RIG_COLORS : CRANE_COLORS;
  return palette[index % palette.length];
}

// ─── Segment builder ──────────────────────────────────────────────────────────

function buildTimelineSegments(
  windowStart: Date,
  windowEnd: Date,
  steps: PlanStepWithMeta[],
): TimelineSegment[] {
  const totalMs = windowEnd.getTime() - windowStart.getTime();
  if (totalMs <= 0) return [];

  const intervals = steps
    .filter((s) => s.plannedStart && s.plannedEnd)
    .map((s) => ({
      start: Math.max(new Date(s.plannedStart).getTime(), windowStart.getTime()),
      end: Math.min(new Date(s.plannedEnd).getTime(), windowEnd.getTime()),
    }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);

  const minGapMs = MIN_VISIBLE_GAP_MINUTES * 60000;
  const merged: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start - last.end <= minGapMs) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  const raw: { type: SegmentType; start: number; end: number }[] = [];
  let cursor = windowStart.getTime();

  merged.forEach((m, idx) => {
    if (m.start > cursor) {
      raw.push({ type: idx === 0 ? 'unused' : 'break', start: cursor, end: m.start });
    }
    raw.push({ type: 'work', start: m.start, end: m.end });
    cursor = m.end;
  });

  if (cursor < windowEnd.getTime()) {
    raw.push({ type: 'unused', start: cursor, end: windowEnd.getTime() });
  }

  return raw.map((s) => ({
    ...s,
    widthPct: ((s.end - s.start) / totalMs) * 100,
  }));
}

function summarize(segments: TimelineSegment[], totalMinutes: number) {
  const sum = (type: SegmentType) =>
    segments.filter((s) => s.type === type).reduce((acc, s) => acc + (s.end - s.start) / 60000, 0);
  const workMinutes = sum('work');
  const breakMinutes = sum('break');
  const unusedMinutes = sum('unused');
  const pctOf = (mins: number) => (totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0);
  return { workMinutes, breakMinutes, unusedMinutes, pctOf };
}

// ─── Single machine row ───────────────────────────────────────────────────────

function MachineRow({
  machine,
  color,
  segments,
  tickPcts,
}: {
  machine: MachineInfo;
  color: string;
  segments: TimelineSegment[];
  tickPcts: number[];
}) {
  const softBg = color + '18'; // ~10% opacity
  const colorFor = (type: SegmentType) =>
    type === 'work' ? color : type === 'break' ? BREAK_COLOR : UNUSED_COLOR;

  return (
    <View style={styles.trackRowWrap}>
      <View style={[styles.trackChip, { backgroundColor: softBg }]}>
        <View style={[styles.trackChipDot, { backgroundColor: color }]} />
        <Text style={[styles.trackChipText, { color }]} numberOfLines={1}>
          {machine.machineNo}
        </Text>
      </View>

      <View style={styles.barWrap}>
        {segments.map((seg, idx) => (
          <View
            key={idx}
            style={[
              styles.barSegment,
              {
                width: `${seg.widthPct}%`,
                backgroundColor: colorFor(seg.type),
              },
              idx < segments.length - 1 && styles.barSegmentDivider,
            ]}
          />
        ))}
        {tickPcts.map((pct, idx) => (
          <View key={idx} style={[styles.gridline, { left: `${pct}%` }]} pointerEvents="none" />
        ))}
      </View>
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function MachineStatCard({
  machine,
  color,
  workMinutes,
  pct,
}: {
  machine: MachineInfo;
  color: string;
  workMinutes: number;
  pct: number;
}) {
  const softBg = color + '18';
  return (
    <View style={[styles.statCard, { backgroundColor: softBg }]}>
      <View style={styles.statCardHeader}>
        <View style={[styles.trackChipDot, { backgroundColor: color }]} />
        <Text style={[styles.statCardTrack, { color }]}>{machine.machineNo}</Text>
      </View>
      <Text style={styles.statCardValue}>{formatMinutes(workMinutes)}</Text>
      <Text style={styles.statCardPct}>{pct}% working</Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PlanTimelineBarProps {
  windowStart: Date;
  windowEnd: Date;
  steps: PlanStepWithMeta[];
  /** All active rig machines for this plan. */
  activeRigs: MachineInfo[];
  /** All active crane machines for this plan. */
  activeCranes: MachineInfo[];
}

export default function PlanTimelineBar({
  windowStart,
  windowEnd,
  steps,
  activeRigs,
  activeCranes,
}: PlanTimelineBarProps) {
  const totalMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60000;

  const allMachines: MachineInfo[] = [...activeRigs, ...activeCranes];

  // Build per-machine segments
  const machineSegments = useMemo(() => {
    return allMachines.map((machine) => {
      const machineSteps = steps.filter((s) => s.assignedMachineId === machine.id);
      return buildTimelineSegments(windowStart, windowEnd, machineSteps);
    });
  }, [allMachines, steps, windowStart.getTime(), windowEnd.getTime()]);

  const ticks = useMemo(() => {
    if (totalMinutes <= 0) return [];
    const stops = [0, 0.25, 0.5, 0.75, 1];
    return stops.map((f) => {
      const t = new Date(windowStart.getTime() + f * totalMinutes * 60000);
      return { pct: f * 100, label: formatTime(t.toISOString()) };
    });
  }, [windowStart.getTime(), totalMinutes]);

  const gridlinePcts = useMemo(() => ticks.slice(1, -1).map((t) => t.pct), [ticks]);

  const machineStats = useMemo(
    () => machineSegments.map((segs) => summarize(segs, totalMinutes)),
    [machineSegments, totalMinutes],
  );

  // Max break minutes across all machines (for legend)
  const combinedBreakMinutes = useMemo(
    () => Math.max(0, ...machineStats.map((s) => s.breakMinutes)),
    [machineStats],
  );

  return (
    <GlassCard innerStyle={styles.timelinePad}>
      <View style={styles.timelineHeaderRow}>
        <Clock size={14} color={colors.accent} />
        <Text style={styles.timelineTitle}>Machine Timeline</Text>
      </View>

      {allMachines.map((machine, idx) => (
        <MachineRow
          key={machine.id}
          machine={machine}
          color={getMachineColor(machine, machine.type === 'RIG' ? idx : idx - activeRigs.length)}
          segments={machineSegments[idx]}
          tickPcts={gridlinePcts}
        />
      ))}

      <View style={styles.tickRow}>
        {ticks.map((tick, idx) => (
          <Text
            key={idx}
            style={[
              styles.tickLabel,
              idx === 0 && styles.tickLabelStart,
              idx === ticks.length - 1 && styles.tickLabelEnd,
            ]}
            numberOfLines={1}
          >
            {tick.label}
          </Text>
        ))}
      </View>

      <View style={styles.statCardRow}>
        {allMachines.map((machine, idx) => (
          <MachineStatCard
            key={machine.id}
            machine={machine}
            color={getMachineColor(machine, machine.type === 'RIG' ? idx : idx - activeRigs.length)}
            workMinutes={machineStats[idx].workMinutes}
            pct={machineStats[idx].pctOf(machineStats[idx].workMinutes)}
          />
        ))}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendChip}>
          <View style={[styles.legendDot, { backgroundColor: BREAK_COLOR }]} />
          <Text style={styles.legendText}>Break · {formatMinutes(combinedBreakMinutes)}</Text>
        </View>
        <View style={styles.legendChip}>
          <View style={[styles.legendDot, { backgroundColor: UNUSED_COLOR }]} />
          <Text style={styles.legendText}>Unused / idle</Text>
        </View>
      </View>
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  timelinePad: { padding: spacing.lg },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timelineTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  trackRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  trackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    width: 66,
  },
  trackChipDot: { width: 6, height: 6, borderRadius: 3 },
  trackChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  barWrap: {
    flex: 1,
    flexDirection: 'row',
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: colors.glassFill,
    position: 'relative',
  },
  barSegment: { height: '100%' },
  barSegmentDivider: {
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(255,255,255,0.6)',
  },
  gridline: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginLeft: 66 + spacing.sm,
  },
  tickLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  tickLabelStart: { textAlign: 'left', flex: 0 },
  tickLabelEnd: { textAlign: 'right', flex: 0 },

  statCardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statCard: {
    minWidth: '22%',
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statCardTrack: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  statCardValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statCardPct: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
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
});