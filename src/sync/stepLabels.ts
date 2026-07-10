// src/sync/stepLabels.ts
// Maps internal step names to user-facing labels, in both their
// "currently running" and "completed" phrasing.

const STEP_LABELS: Record<string, { active: string; done: string }> = {
  piles: { active: 'Syncing piles…', done: 'Piles' },
  dimensions: { active: 'Syncing dimensions…', done: 'Dimensions' },
  shifts: { active: 'Syncing shifts…', done: 'Shifts' },
  machines: { active: 'Syncing machines…', done: 'Machines' },
  personnel: { active: 'Syncing personnel…', done: 'Personnel' },
};

export function getStepLabel(stepName: string): string {
  return STEP_LABELS[stepName]?.active ?? `Syncing ${stepName}…`;
}

export function getStepDoneLabel(stepName: string): string {
  return STEP_LABELS[stepName]?.done ?? stepName;
}

export const TOTAL_SYNC_STEPS = Object.keys(STEP_LABELS).length;