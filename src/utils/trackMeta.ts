// src/utils/trackMeta.ts
// Shared icon/color metadata for a piling step's machine track (RIG/CRANE/COMPRESSOR).

import { Drill, Forklift, Wind, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/theme/theme';

export interface TrackMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  soft: string;
}

export const TRACK_META: Record<'RIG' | 'CRANE' | 'COMPRESSOR', TrackMeta> = {
  RIG: { label: 'RIG', icon: Drill, color: colors.machines.rig.color, soft: colors.machines.rig.soft },
  CRANE: { label: 'CRANE', icon: Forklift, color: colors.machines.crane.color, soft: colors.machines.crane.soft },
  COMPRESSOR: { label: 'COMPRESSOR', icon: Wind, color: colors.machines.compressor.color, soft: colors.machines.compressor.soft },
};
