// src/utils/formatTime.ts
//
// Single source of truth for all time formatting and date math in the app.
//
// Sections:
//   1. ISO-based display helpers   — accept ISO 8601 strings stored in SQLite
//   2. Minutes-based display helpers — accept minutes-since-midnight numbers
//   3. Duration helpers            — format a span of time
//   4. Date math utilities         — addMinutes, timeToMinutes (used by planner + UI)
//   5. ISO serialization (writes)  — toLocalIsoString, for building the strings sent to the API
//   6. Date-only strings + relative-day labels — toLocalDateStr, formatRelativeDayLabel, formatHeaderDate

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── 1. ISO-based display helpers ────────────────────────────────────────────

/**
 * Format an ISO timestamp to time-only, 12-hour clock.
 * e.g. "2026-07-09T08:30:00Z" → "8:30 AM"
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return '—';
  }
}

/**
 * Format an ISO timestamp to full date + time.
 * e.g. "2026-07-09T08:30:00Z" → "09 Jul 2026, 8:30 AM"
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTH_ABBR[d.getMonth()];
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}, ${formatTime(iso)}`;
  } catch {
    return '—';
  }
}

/**
 * Format a time range from two ISO timestamps.
 * Same day  → "09 Jul 2026, 8:30 AM – 9:00 AM"
 * Spans midnight → "09 Jul 2026, 11:30 PM – 10 Jul 2026, 12:30 AM"
 */
export function formatTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  if (!startIso && !endIso) return '—';
  if (!startIso) return `— – ${formatTime(endIso)}`;
  if (!endIso)   return `${formatTime(startIso)} – —`;

  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sameDay =
      s.getFullYear() === e.getFullYear() &&
      s.getMonth() === e.getMonth() &&
      s.getDate() === e.getDate();

    if (sameDay) {
      const day = String(s.getDate()).padStart(2, '0');
      const mon = MONTH_ABBR[s.getMonth()];
      const yr  = s.getFullYear();
      return `${day} ${mon} ${yr}, ${formatTime(startIso)} – ${formatTime(endIso)}`;
    }
    return `${formatDateTime(startIso)} – ${formatDateTime(endIso)}`;
  } catch {
    return `${formatTime(startIso)} – ${formatTime(endIso)}`;
  }
}

/**
 * Format an ISO timestamp for plan wizard display: "h:mm AM/PM, MMM D"
 * e.g. "2026-07-09T08:00:00Z" → "8:00 AM, Jul 9"
 */
export function formatPlanTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── 2. Minutes-based display helpers ────────────────────────────────────────

/**
 * Format minutes-since-midnight to "HH:MM" (24-hour).
 * e.g. 510 → "08:30", 780 → "13:00"
 * Wraps safely past midnight (e.g. 1560 → "02:00").
 */
export function formatMinutes(mins: number): string {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format minutes-since-midnight to "8:30 AM" (12-hour AM/PM).
 * e.g. 510 → "8:30 AM", 780 → "1:00 PM"
 */
export function formatMinutes12(mins: number): string {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  let h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── 3. Duration helpers ──────────────────────────────────────────────────────

/**
 * Format a total number of minutes as "Xh Ym", "Xh", or "Ym".
 * e.g. 90 → "1h 30m", 120 → "2h", 45 → "45m", 0 → "0m"
 */
export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Duration between two ISO timestamps, formatted as "1h 30m", "45m", etc.
 * Uses wall-clock diff — for working-time display use formatDurationMinutes
 * with the stored durationMinutes field instead.
 */
export function formatDuration(startIso: string, endIso: string): string {
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    const totalMin = Math.round(ms / 60000);
    return formatDurationMinutes(totalMin);
  } catch {
    return '—';
  }
}

// ─── 4. Date math utilities ───────────────────────────────────────────────────

/**
 * Parse "HH:MM" time string to minutes since midnight.
 * e.g. "08:30" → 510, "19:00" → 1140
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Add a number of minutes to a Date and return a new Date.
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Generous cap on how far forward a single actual-time entry can roll across
 * midnight before it's treated as a genuine backward mistake instead of an
 * overnight continuation (piling steps run for hours, never ~a full day).
 */
const MAX_OVERNIGHT_GAP_MINUTES = 20 * 60; // 20h

/**
 * True when `candidate` (minutes-since-midnight) is at/after `anchor`, once
 * overnight wraparound is accounted for. Piling steps legitimately continue
 * past midnight (e.g. previous step ends 21:45 = 1305, this one finishes
 * 04:30 the next morning = 270), so a numerically smaller candidate usually
 * means "the following calendar day," not "earlier today." Only rejects when
 * the implied continuation gap is implausibly long, which is the signal that
 * it's actually a same-day backward mistake.
 */
export function isAtOrAfterOvernightWrap(candidate: number, anchor: number): boolean {
  if (candidate >= anchor) return true;
  return candidate + 1440 - anchor <= MAX_OVERNIGHT_GAP_MINUTES;
}

/**
 * Mirror of isAtOrAfterOvernightWrap for upper bounds — true when `candidate`
 * is at/before `anchor`, tolerating the case where `anchor` itself is the one
 * that rolled past midnight (e.g. "the next step's start time").
 */
export function isAtOrBeforeOvernightWrap(candidate: number, anchor: number): boolean {
  if (candidate <= anchor) return true;
  return anchor + 1440 - candidate <= MAX_OVERNIGHT_GAP_MINUTES;
}

/**
 * Resolves the correct calendar Date for a newly-picked minutes-since-midnight
 * value, anchored on the last known real ISO timestamp in this step sequence
 * (e.g. the previous step's actual end, or this step's own actual start) —
 * rolling forward one calendar day if the picked time-of-day is earlier than
 * the anchor's, mirroring pilingPlannerService's window-rollover pattern.
 */
export function resolveOvernightDate(anchorIso: string, minutesSinceMidnight: number): Date {
  const anchor = new Date(anchorIso);
  const anchorMinutes = anchor.getHours() * 60 + anchor.getMinutes();
  const d = new Date(anchor);
  if (minutesSinceMidnight < anchorMinutes) d.setDate(d.getDate() + 1);
  d.setHours(Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0);
  return d;
}

// ─── 5. ISO serialization (writes) ────────────────────────────────────────────

/**
 * Serialize a Date's own local y/m/d/h/min/s components as a naive
 * "YYYY-MM-DDTHH:mm:ss" string — no "Z", no UTC offset.
 *
 * Use this (never `.toISOString()`) for any plan/actual timestamp sent to the
 * API. The backend's DateTime columns are timezone-naive and store whatever
 * wall-clock numbers they're given, so `.toISOString()` — which always
 * converts to UTC — silently shifts a correctly-built local Date (e.g. one
 * built from `new Date(y, m-1, d, h, min)` or a wheel-picker) by the device's
 * UTC offset (5.5h for IST) once it lands in storage. This assumes the
 * device's own OS timezone matches TIMEZONE (see src/config/env.ts) — the
 * same assumption every local-component-constructed Date in this app already
 * makes; this just stops breaking it during serialization.
 */
export function toLocalIsoString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}T${h}:${min}:${s}`;
}

// ─── 6. Date-only strings + relative-day labels ──────────────────────────────

/**
 * Serialize a Date's own local y/m/d components as "YYYY-MM-DD" — the
 * date-only sibling of toLocalIsoString, for values (plan dates, working
 * dates, calendar selections) that don't carry a time-of-day.
 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Relative-day label for a date: "Today", the given neighboring day
 * ("Tomorrow" or "Yesterday"), or a locale-formatted fallback otherwise.
 * Accepts either a full ISO timestamp or a plain "YYYY-MM-DD" string.
 */
export function formatRelativeDayLabel(
  input: string,
  opts: {
    neighbor: 'tomorrow' | 'yesterday';
    locale?: string;
    dateFormatOptions?: Intl.DateTimeFormatOptions;
  },
): string {
  const { neighbor, locale, dateFormatOptions } = opts;
  const d = new Date(input.length <= 10 ? `${input}T00:00:00` : input);
  const dateStr = toLocalDateStr(d);
  const today = toLocalDateStr(new Date());
  const neighborDate = new Date();
  neighborDate.setDate(neighborDate.getDate() + (neighbor === 'tomorrow' ? 1 : -1));
  const neighborStr = toLocalDateStr(neighborDate);

  if (dateStr === today) return 'Today';
  if (dateStr === neighborStr) return neighbor === 'tomorrow' ? 'Tomorrow' : 'Yesterday';
  return d.toLocaleDateString(locale, dateFormatOptions);
}

/**
 * Full weekday + month + day header label for a "YYYY-MM-DD" date string,
 * e.g. "Monday, July 27" (or with `includeYear`, "Monday, July 27, 2026").
 */
export function formatHeaderDate(dateStr: string, opts?: { includeYear?: boolean }): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(opts?.includeYear ? { year: 'numeric' as const } : {}),
  });
}