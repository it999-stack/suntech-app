// src/utils/formatTime.ts
//
// Single source of truth for all time formatting and date math in the app.
//
// Sections:
//   1. ISO-based display helpers   — accept ISO 8601 strings stored in SQLite
//   2. Minutes-based display helpers — accept minutes-since-midnight numbers
//   3. Duration helpers            — format a span of time
//   4. Date math utilities         — addMinutes, timeToMinutes (used by planner + UI)

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