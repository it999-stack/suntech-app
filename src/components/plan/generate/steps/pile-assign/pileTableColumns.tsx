// Column + row-action definitions for the pile IndexTable — split out of
// PileAssignStep so that file stays focused on state, not render config.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CircleCheck, MapPin } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import Badge from '@components/shared/Badge';
import MachineBadge from '@components/shared/MachineBadge';
import type { IndexTableColumn } from '@components/shared/IndexTable';
import type { EligiblePile, MachineKind } from './types';
import type { PlanDraft } from '@/types/plan';

// Stable per-area badge colors — cycled by hashing the locationId so the same
// area always lands on the same color, regardless of list order or which
// areas happen to be present. Text colors are the same hues used at full
// saturation elsewhere in the app (accent, machine tracks, status), paired
// here with a ~12% tint background, matching the soft-badge convention.
const AREA_PALETTE: { text: string; bg: string }[] = [
  { text: '#7C3AED', bg: 'rgba(124,58,237,0.12)' }, // violet
  { text: '#16A34A', bg: 'rgba(22,163,74,0.12)' }, // green
  { text: '#0284C7', bg: 'rgba(2,132,199,0.12)' }, // blue
  { text: '#EA580C', bg: 'rgba(234,88,12,0.12)' }, // orange
  { text: '#DB2777', bg: 'rgba(219,39,119,0.12)' }, // pink
  { text: '#CA8A04', bg: 'rgba(202,138,4,0.12)' }, // amber
  { text: '#0D9488', bg: 'rgba(13,148,136,0.12)' }, // teal
  { text: '#DC2626', bg: 'rgba(220,38,38,0.12)' }, // red
];

function areaColor(locationId: string): { text: string; bg: string } {
  let hash = 0;
  for (let i = 0; i < locationId.length; i++) hash = (hash * 31 + locationId.charCodeAt(i)) | 0;
  return AREA_PALETTE[Math.abs(hash) % AREA_PALETTE.length];
}

interface BuildColumnsArgs {
  assignments: PlanDraft['assignments'];
  machineLabel: (kind: MachineKind, machineId: string) => string;
  /** Resolves a pile's locationId to its display name, e.g. "Zone A". */
  locationLabel: (locationId: string | null) => string | null;
  /** Only worth showing when the list mixes piles from every area — the
   * per-area tabs already make the area obvious, so this stays off there. */
  showAreaBadge: boolean;
}

export function buildColumns({
  assignments, machineLabel, locationLabel, showAreaBadge,
}: BuildColumnsArgs): IndexTableColumn<EligiblePile>[] {
  return [
    {
      key: 'pile',
      header: 'Pile',
      render: (p) => {
        const area = showAreaBadge ? locationLabel(p.locationId) : null;
        const tone = area && p.locationId ? areaColor(p.locationId) : null;
        return (
          <>
            <Text style={styles.code}>{p.code}</Text>
            <Text style={styles.spec}>Ø{p.dia}mm · {p.depth}m</Text>
            {area && tone && (
              <Badge
                text={area}
                textColor={tone.text}
                bgColor={tone.bg}
                icon={MapPin}
                fontSize={10}
                uppercase={false}
                style={styles.areaBadge}
              />
            )}
          </>
        );
      },
    },
    {
      key: 'machines',
      header: 'Machines',
      width: 140,
      render: (p) => {
        const asgn = assignments[p.id];
        const rigLabel = asgn?.rig ? machineLabel('rig', asgn.rig) : null;
        const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;
        if (!rigLabel) {
          if (p.completed) {
            return <Badge icon={CircleCheck} text="Completed" textColor={colors.success} bgColor={colors.successSoft} fontSize={12} />;
          }
          return <View style={styles.pillEmpty}><Text style={styles.pillEmptyText}>Unassigned</Text></View>;
        }
        return (
          <View style={styles.pillRow}>
            <MachineBadge track="RIG" label={rigLabel} />
            {craneLabel ? (
              <MachineBadge track="CRANE" label={craneLabel} />
            ) : (
              <MachineBadge track="RIG" label="Rig only" muted />
            )}
          </View>
        );
      },
    },
  ];
}

const styles = StyleSheet.create({
  code: { ...typography.body, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  areaBadge: { marginTop: 4 },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  completedText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pillEmpty: { borderWidth: 1, borderColor: 'rgba(28,28,46,0.15)', borderStyle: 'dashed', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  pillEmptyText: { ...typography.caption, color: colors.textSecondary },
});