// src/utils/helpers.ts
// General-purpose helper functions and shared domain types.

import { colors } from '@/theme/theme';
import * as Crypto from 'expo-crypto';
import { addMinutes, toLocalIsoString } from '@utils/formatTime';

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

export interface MachineLike {
  id: string;
  type: MachineKind;
}

// ---------------------------------------------------------------------------
// Machine color helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic color for a machine based on its type and its position
 * *within that type's list* — so a rig's color stays stable even if rigs
 * and cranes are interleaved differently on some other screen.
 */
export function getMachineColor(machine: MachineLike, indexWithinType: number): string {
  const palette =
    machine.type === 'RIG'
      ? colors.machine.rigColors
      : machine.type === 'CRANE'
        ? colors.machine.craneColors
        : colors.machine.compressorColors;
  return palette[indexWithinType % palette.length];
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

/** Maps each machine's id to its position among machines of the same type, in list order. */
export function buildTypeIndexById<T extends MachineLike>(machines: T[]): Record<string, number> {
  const counters: Record<string, number> = {};
  const map: Record<string, number> = {};
  machines.forEach((m) => {
    const i = counters[m.type] ?? 0;
    map[m.id] = i;
    counters[m.type] = i + 1;
  });
  return map;
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