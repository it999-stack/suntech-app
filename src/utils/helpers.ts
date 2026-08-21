// src/utils/helpers.ts
// General-purpose helper functions and shared domain types.

import { colors } from '@/theme/theme';
import * as Crypto from 'expo-crypto';
import { addMinutes, toLocalIsoString } from '@utils/formatTime';
import { Drill, Forklift, Wind, type LucideIcon } from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Person helpers
// ---------------------------------------------------------------------------

/** First letter of up to the first two words of a name, e.g. "Ankit Sharma" -> "AS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

// ---------------------------------------------------------------------------
// Machine types
// ---------------------------------------------------------------------------

export type MachineKind = 'RIG' | 'CRANE' | 'COMPRESSOR';

// ---------------------------------------------------------------------------
// Machine track metadata — the single source of icon/color/soft/label per
// machine type (RIG/CRANE/COMPRESSOR), shared by every screen/component that
// needs to render "which machine track" visually.
// ---------------------------------------------------------------------------

export interface TrackMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  soft: string;
}

export const TRACK_META: Record<MachineKind, TrackMeta> = {
  RIG: { label: 'RIG', icon: Drill, color: colors.machines.rig.color, soft: colors.machines.rig.soft },
  CRANE: { label: 'CRANE', icon: Forklift, color: colors.machines.crane.color, soft: colors.machines.crane.soft },
  COMPRESSOR: { label: 'COMPRESSOR', icon: Wind, color: colors.machines.compressor.color, soft: colors.machines.compressor.soft },
};

/** Step-track badge colors (RIG/CRANE keep their own accent/warning scheme,
 * distinct from TRACK_META's rig/crane orange/blue). */
export function getTrackBadgeColors(track: MachineKind): { bg: string; fg: string } {
  if (track === 'RIG') return { bg: colors.accentSoft, fg: colors.accent };
  if (track === 'CRANE') return { bg: 'rgba(255,149,0,0.12)', fg: colors.warning };
  return { bg: TRACK_META.COMPRESSOR.soft, fg: TRACK_META.COMPRESSOR.color };
}

/** Converts a `#rrggbb` hex color to an `rgba(...)` string at the given opacity. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// generate uuid
export function generateId(): string {
  return Crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Plan step timing helpers
// ---------------------------------------------------------------------------

/**
 * True when a plan step's natural duration runs past the plan window
 * boundary, so no committed plannedEnd was persisted for it ("continuing").
 */
export function isContinuingStep(step: { plannedEnd: string | null | undefined }): boolean {
  return step.plannedEnd == null;
}

/**
 * When a step's actual work begins — `plannedStart` marks when its buffer
 * period starts, not when work does, so callers displaying "when did work
 * start" need this instead of `plannedStart` directly.
 */
export function stepWorkStart(step: { plannedStart: string; bufferMinutes: number | null | undefined }): string {
  return toLocalIsoString(addMinutes(new Date(step.plannedStart), step.bufferMinutes ?? 0));
}

/**
 * A pile is "in_progress" if any of its actual steps has been started but not
 * finished, "completed" once every one of its plan steps has an actualEnd,
 * else "pending" (not started at all). `pileStepCount` is the pile's total
 * plan-step count — pass 0 for a pile with no plan steps to always get
 * "pending" rather than a false "completed" from a length check against zero.
 */
export function derivePileStatus(
  pileStepCount: number,
  pileActuals: { actualStart: string | null; actualEnd: string | null }[],
): 'pending' | 'in_progress' | 'completed' {
  if (pileActuals.some((a) => a.actualStart && !a.actualEnd)) return 'in_progress';
  if (pileStepCount > 0 && pileActuals.filter((a) => a.actualEnd).length === pileStepCount) return 'completed';
  return 'pending';
}