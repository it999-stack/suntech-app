/** Maximum carry-over piles auto-preselected when entering the piles step. */
export const MAX_AUTO_PRESELECT_PILES = 5;

/**
 * Mirrors the server's GENERATION_GRACE_HOURS
 * (suntech-core/modules/piling/daily_checklists/plan_generation_service.py) —
 * client-side approximation used only to gray out an already-closed date in
 * the picker UI. The server re-validates independently and is the sole
 * source of truth; a mismatch here (e.g. clock drift) just means the UI
 * offers a date the server then rejects, not silent data corruption.
 */
export const GENERATION_GRACE_HOURS = 12;

/**
 * How many days past today a plan can be generated for.
 * Matches the server's date range: today or the next calendar day only
 * (see plan_generation_service.py's date + shift-grace-window rule).
 * Ignored entirely when ALLOW_ANY_PLAN_DATE is true.
 */
export const FUTURE_DAYS_AHEAD = 1;

/**
 * TESTING ONLY: set true to let the Generate Plan calendar select any date,
 * bypassing the today/tomorrow + shift-grace restriction. Only takes effect
 * if the backend's matching ALLOW_ANY_PLAN_DATE env flag is also on
 * (suntech-core/.env) — otherwise the server still rejects the request.
 * Set back to false when done testing.
 */
export const ALLOW_ANY_PLAN_DATE = true;
