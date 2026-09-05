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
 * Format an ISO timestamp to time + short date, no year.
 * e.g. "2026-08-10T08:30:00Z" → "8:30 AM, 10 Aug"
 */
export function formatTimeWithDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${formatTime(iso)}, ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
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
 * Format a total number of minutes as spelled-out "X hr(s) Y minute(s)".
 * e.g. 90 → "1 hr 30 minutes", 150 → "2 hrs 30 minutes", 120 → "2 hrs", 45 → "45 minutes"
 */
export function formatDurationLong(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 minutes';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const hPart = h > 0 ? `${h} hr${h !== 1 ? 's' : ''}` : '';
  const mPart = m > 0 ? `${m} minute${m !== 1 ? 's' : ''}` : '';
  return hPart && mPart ? `${hPart} ${mPart}` : hPart || mPart;
}

/**
 * Duration between two ISO timestamps, formatted as "1h 30m", "45m", etc.
 * Uses wall-clock diff — for working-time display use formatDurationMinutes
 * with the stored durationMinutes field instead.
 */
export function formatDuration(startIso: string, endIso: string): string {
  try {
    return formatDurationMinutes(durationMinutes(startIso, endIso));
  } catch {
    return '—';
  }
}

/** Minutes between two ISO timestamps — date-aware, so correct across midnight. */
export function durationMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

/**
 * Format a total seconds count as zero-padded "HH:MM:SS" (hours grow past 24
 * rather than wrapping — for a ticking elapsed-time display, not a clock).
 * e.g. 252 → "00:04:12"
 */
export function formatElapsedHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
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

/** Midnight (00:00:00.000) of the given date's own calendar day. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Last instant (23:59:59.999) of the given date's own calendar day. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolves the calendar Date for a newly-picked minutes-since-midnight value,
 * anchored on the last known real ISO timestamp in this step sequence (e.g.
 * the previous step's actual end, or this step's own actual start). Always
 * places the picked time-of-day on the anchor's own calendar day — it never
 * infers/rolls onto a different day. Crossing into a new calendar day (a
 * genuine overnight continuation) is something the user must do explicitly
 * via the time picker's calendar icon; see `explicitDate` in
 * StepTimeControl/EditTimeButton.
 */
export function resolveOvernightDate(anchorIso: string, minutesSinceMidnight: number): Date {
  const d = new Date(anchorIso);
  d.setHours(Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0);
  return d;
}

export interface ActualTimeAnchorStep {
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
}

/**
 * Resolves the anchor ISO timestamp that a newly-picked actual start/finish
 * time will be attributed to (paired with resolveOvernightDate) — the
 * previous step's actual/planned end for a start time, or this step's own
 * actual start for a finish time, falling back through planned times and
 * finally the checklist's plan_start_time. Single source of truth shared by
 * the time picker's displayed date and the save path itself, so the two
 * can't silently disagree about "what date is this" (which is what caused
 * the picker to show device-today instead of the checklist's date).
 */
export function resolveActualTimeAnchor(
  field: 'actualStart' | 'actualEnd',
  step: ActualTimeAnchorStep,
  previousStep: ActualTimeAnchorStep | null,
  planStartTime: string | null | undefined,
): string {
  if (field === 'actualEnd') {
    return step.actualStart ?? step.plannedStart ?? planStartTime ?? toLocalIsoString(new Date());
  }
  return (
    previousStep?.actualEnd ??
    previousStep?.plannedEnd ??
    previousStep?.plannedStart ??
    step.plannedStart ??
    planStartTime ??
    toLocalIsoString(new Date())
  );
}

/**
 * The Date a time picker should open on: the anchor's calendar day (see
 * resolveActualTimeAnchor) carrying the given time-of-day. Falls back to
 * today when there's no anchor.
 *
 * Shared so the picker's opening day can't drift from the day the entry is
 * ultimately attributed to — the bug that used to show device-today instead
 * of the checklist's date.
 */
export function seedPickerDate(anchorIso: string | undefined, minutes: number): Date {
  const d = anchorIso ? new Date(anchorIso) : new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
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
 * Short day + month + year label for a "YYYY-MM-DD" date string, e.g.
 * "20 May 2025" — no weekday, unlike formatHeaderDate below.
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
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