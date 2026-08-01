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
  NonWorkingWindowInput,
  StopKind,
} from '@/types/timeline';

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** An ordered, non-overlapping stretch of time before non-working windows are carved out of it. */
interface Segment {
  kind: StopKind;
  title: string;
  subtitle?: string;
  start: number;
  end: number;
}

/**
 * Splits `window` out of any segment it overlaps, replacing the overlapped
 * portion with a labeled 'break' segment while leaving any before/after
 * remainder as-is (same kind/title/subtitle, just a shorter span).
 */
function punchWindow(
  segments: Segment[],
  window: { label: string; start: number; end: number },
): Segment[] {
  const result: Segment[] = [];
  for (const seg of segments) {
    const overlapStart = Math.max(seg.start, window.start);
    const overlapEnd = Math.min(seg.end, window.end);
    if (overlapStart >= overlapEnd) {
      result.push(seg);
      continue;
    }
    if (seg.start < overlapStart) {
      result.push({ ...seg, end: overlapStart });
    }
    result.push({ kind: 'break', title: window.label, start: overlapStart, end: overlapEnd });
    if (overlapEnd < seg.end) {
      result.push({ ...seg, start: overlapEnd });
    }
  }
  return result;
}

/**
 * Builds the ordered stop log for a single machine within a time window.
 *
 * Rules:
 * - Items for other machines, or with missing/invalid start-end, are dropped.
 * - Consecutive items with the *same* groupKey and a gap under
 *   `minMergeGapMinutes` are merged into one active stop (absorbs noise like
 *   a 5-minute handoff between two rows for the *same* step).
 * - A gap before the first active stop is "idle" (nothing has started yet).
 * - A gap between two active stops is a "break".
 * - A gap after the last active stop, to the end of the window, is "idle".
 * - Any `nonWorkingWindows` are then carved out of whatever they overlap —
 *   an active stop or an idle/break gap — becoming their own labeled
 *   'break' stop instead of being silently absorbed.
 */
export function buildMachineStops({
  items,
  machineId,
  windowStart,
  windowEnd,
  minMergeGapMinutes = 10,
  nonWorkingWindows,
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
        bufferMinutes: i.bufferMinutes ?? 0,
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

  let segments: Segment[] = [];
  let cursor = winStart;

  merged.forEach((m, idx) => {
    if (m.start > cursor) {
      segments.push({
        kind: idx === 0 ? 'idle' : 'break',
        title: idx === 0 ? 'Awaiting first assignment' : 'Break',
        start: cursor,
        end: m.start,
      });
    }
    const bufferMs = (m.bufferMinutes ?? 0) * 60000;
    const bufferEnd = Math.min(m.start + bufferMs, m.end);
    if (bufferEnd > m.start) {
      segments.push({ kind: 'buffer', title: 'Buffer', start: m.start, end: bufferEnd });
    }
    if (m.end > bufferEnd) {
      segments.push({
        kind: 'active',
        title: m.groupLabel,
        subtitle: m.detailLabel,
        start: bufferEnd,
        end: m.end,
      });
    }
    cursor = m.end;
  });

  if (cursor < winEnd) {
    segments.push({
      kind: 'idle',
      title: merged.length > 0 ? 'Awaiting next assignment' : 'No activity scheduled',
      start: cursor,
      end: winEnd,
    });
  }

  const windows = (nonWorkingWindows ?? [])
    .map((w: NonWorkingWindowInput) => {
      const s = toMs(w.start);
      const e = toMs(w.end);
      if (s === null || e === null) return null;
      return { label: w.label, start: Math.max(s, winStart), end: Math.min(e, winEnd) };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null && w.end > w.start)
    .sort((a, b) => a.start - b.start);

  for (const w of windows) {
    segments = punchWindow(segments, w);
  }

  return segments
    .filter((seg) => seg.end > seg.start)
    .map((seg, idx) => ({
      id: `stop-${idx}`,
      kind: seg.kind,
      title: seg.title,
      subtitle: seg.subtitle,
      start: seg.start,
      end: seg.end,
    }));
}

export function summarizeStops(stops: TimelineStop[]) {
  const sum = (kind: StopKind) =>
    stops.filter((s) => s.kind === kind).reduce((acc, s) => acc + (s.end - s.start) / 60000, 0);
  return {
    activeMinutes: sum('active'),
    breakMinutes: sum('break'),
    idleMinutes: sum('idle'),
    bufferMinutes: sum('buffer'),
  };
}
