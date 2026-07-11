// src/utils/timeline.ts
//
// Pure data logic for turning a flat list of scheduled items into a
// per-machine "stop log": a sequence of active / break / idle stops with
// start & end times. No React or React Native imports — safe to unit test
// and reuse anywhere a machine's activity needs to be shown as a timeline
// (plan preview, a live ops view, a historical day view, etc).

import type {
  TimelineStop,
  TimelineSourceItem,
  BuildMachineStopsOptions,
  StopKind,
} from '@/types/timeline';

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Builds the ordered stop log for a single machine within a time window.
 *
 * Rules:
 * - Items for other machines, or with missing/invalid start-end, are dropped.
 * - Consecutive items with the *same* groupKey and a gap under
 *   `minMergeGapMinutes` are merged into one active stop (absorbs noise like
 *   a 5-minute handoff between two steps on the same pile).
 * - A gap before the first active stop is "idle" (nothing has started yet).
 * - A gap between two active stops is a "break".
 * - A gap after the last active stop, to the end of the window, is "idle".
 */
export function buildMachineStops({
  items,
  machineId,
  windowStart,
  windowEnd,
  minMergeGapMinutes = 10,
}: BuildMachineStopsOptions): TimelineStop[] {
  const winStart = windowStart.getTime();
  const winEnd = windowEnd.getTime();
  if (winEnd <= winStart) return [];

  const raw = items
    .filter((i) => i.machineId === machineId)
    .map((i) => {
      const s = toMs(i.start);
      const e = toMs(i.end);
      if (s === null || e === null) return null;
      return {
        groupKey: i.groupKey,
        groupLabel: i.groupLabel,
        detailLabel: i.detailLabel,
        start: Math.max(s, winStart),
        end: Math.min(e, winEnd),
      };
    })
    .filter((iv): iv is NonNullable<typeof iv> => iv !== null && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);

  const minGapMs = minMergeGapMinutes * 60000;
  const merged: typeof raw = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && last.groupKey === iv.groupKey && iv.start - last.end <= minGapMs) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  const stops: TimelineStop[] = [];
  let cursor = winStart;

  merged.forEach((m, idx) => {
    if (m.start > cursor) {
      stops.push({
        id: `gap-${idx}`,
        kind: idx === 0 ? 'idle' : 'break',
        title: idx === 0 ? 'Awaiting first assignment' : 'Break',
        start: cursor,
        end: m.start,
      });
    }
    stops.push({
      id: `active-${idx}`,
      kind: 'active',
      title: m.groupLabel,
      subtitle: m.detailLabel,
      start: m.start,
      end: m.end,
    });
    cursor = m.end;
  });

  if (cursor < winEnd) {
    stops.push({
      id: 'trailing',
      kind: 'idle',
      title: merged.length > 0 ? 'Awaiting next assignment' : 'No activity scheduled',
      start: cursor,
      end: winEnd,
    });
  }

  return stops;
}

export function summarizeStops(stops: TimelineStop[]) {
  const sum = (kind: StopKind) =>
    stops.filter((s) => s.kind === kind).reduce((acc, s) => acc + (s.end - s.start) / 60000, 0);
  return {
    activeMinutes: sum('active'),
    breakMinutes: sum('break'),
    idleMinutes: sum('idle'),
  };
}
