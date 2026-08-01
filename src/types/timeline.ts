// src/types/timeline.ts
//
// Reusable, framework-agnostic types for any "what was a machine doing over a
// time window" timeline (plan preview, a live ops view, a historical day view,
// etc). Keep these free of React / React Native imports so they stay portable.

import type { MachineKind } from '@/utils/helpers';

export type StopKind = 'active' | 'break' | 'idle' | 'buffer';

export interface TimelineStop {
  id: string;
  kind: StopKind;
  /** Optional display label for the stop state, e.g. "Start". */
  kindLabel?: string;
  /** Primary label, e.g. a pile code, a job name, or "Break". */
  title: string;
  /** Optional secondary line, e.g. the step being performed. */
  subtitle?: string;
  /** Hides the duration pill for marker-only entries such as a plan end. */
  showDuration?: boolean;
  start: number; // ms epoch, clamped to window
  end: number; // ms epoch, clamped to window
}

/** One schedulable item (e.g. a plan step) before it's grouped into stops. */
export interface TimelineSourceItem {
  machineId: string | null | undefined;
  start: string | Date | null | undefined;
  end: string | Date | null | undefined;
  /**
   * Identity used to merge back-to-back items into a single stop — e.g. a
   * pile ID, so two consecutive steps on the same pile collapse into one
   * "Pile P-04" stop instead of two.
   */
  groupKey: string;
  /** Display label for the merged stop, e.g. "Pile P-04". */
  groupLabel: string;
  /** Optional detail shown under the title, e.g. the step name. */
  detailLabel?: string;
  /** Minutes at the start of this item that are buffer, not actual work — split into its own 'buffer' stop. */
  bufferMinutes?: number;
}

/** A non-working window (e.g. a lunch break) to carve out of the built stops. */
export interface NonWorkingWindowInput {
  id: string;
  /** Real display label from the source window, e.g. "Lunch". */
  label: string;
  start: string | Date;
  end: string | Date;
}

export interface BuildMachineStopsOptions {
  items: TimelineSourceItem[];
  machineId: string;
  windowStart: Date;
  windowEnd: Date;
  /** Gaps at/under this length, within the *same* group, are absorbed into
   *  the stop rather than shown as a break. Default 10. */
  minMergeGapMinutes?: number;
  /**
   * Non-working windows to carve out of the built stops, wherever they land
   * — inside an active stop or inside an idle/break gap. Each carved portion
   * becomes its own 'break' stop titled with the window's label.
   */
  nonWorkingWindows?: NonWorkingWindowInput[];
}

/** Minimal machine identity consumed by timeline views. */
export interface MachineInfo {
  id: string;
  machineNo: string;
  type: MachineKind;
}
