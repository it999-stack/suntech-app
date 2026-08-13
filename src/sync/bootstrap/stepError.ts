// src/sync/bootstrap/stepError.ts
// Shared catch-block helper for bootstrap/delta sync steps — classifies the
// error (network vs. server vs. local) and builds the failed StepResult.

import axios from 'axios';
import type { StepResult, SyncErrorKind } from './syncResult';

export function classifySyncError(err: unknown): SyncErrorKind {
  if (axios.isAxiosError(err)) return err.response ? 'server' : 'network';
  if (err instanceof Error) return 'local';
  return 'unknown';
}

// TODO(user-friendly-errors): this returns the raw backend `detail` or
// err.message as-is, which is intentionally technical for debugging (e.g.
// from a field screenshot). Before this is relied on by non-technical field
// users, map errorKind + message to friendly copy here (or at the UI layer)
// instead of showing this string directly.
function rawMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function toFailedStepResult(step: string, syncedAt: number, err: unknown): StepResult {
  return { step, count: 0, syncedAt, error: rawMessage(err), errorKind: classifySyncError(err) };
}
