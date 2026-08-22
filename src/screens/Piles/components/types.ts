// src/screens/Piles/components/types.ts

import { Circle, Clock3, CircleCheck, type LucideIcon } from 'lucide-react-native';
import { colors } from '@theme/theme';
import type { PileStatus } from '@repositories/pilesRepository';

export interface PilesFiltersState {
  areaIds: string[];
  statuses: PileStatus[];
}

export const DEFAULT_FILTERS: PilesFiltersState = {
  areaIds: [],
  statuses: [],
};

interface StatusMeta {
  label: string;
  color: string;
  softColor: string;
  icon: LucideIcon;
}

// Single source of truth for status presentation, reused by StatCard,
// FilterChip labels, DataListItem's Badge, and FiltersSheet's checkboxes.
export const STATUS_META: Record<PileStatus, StatusMeta> = {
  NOT_STARTED: { label: 'Not Started', color: colors.textSecondary, softColor: 'rgba(138,138,148,0.14)', icon: Circle },
  IN_PROGRESS: { label: 'In Progress', color: colors.warning, softColor: colors.warningSoft, icon: Clock3 },
  COMPLETED: { label: 'Completed', color: colors.success, softColor: colors.successSoft, icon: CircleCheck },
};
