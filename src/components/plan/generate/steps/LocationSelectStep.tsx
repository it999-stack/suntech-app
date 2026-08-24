// src/components/plan/generate/steps/LocationSelectStep.tsx

import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Check,
  MapPin,
  Users,
  Square,
  SquareCheck,
  Building2,
  Warehouse,
  Factory,
  Landmark,
  Mountain,
  TreePine,
  RadioTower,
  Tent,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import GlassCard from '@/components/shared/GlassCard';
import EmptyState from '@/components/shared/EmptyState';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';

export type LocationOption = {
  id: string;
  name: string;
  code?: string | null;
};

const RIG_COLOR = colors.machines.rig.color;
const RIG_SOFT = colors.machines.rig.soft;

// No location-type data exists to pick a meaningful icon per row, so each row
// just gets a varied (but stable per location id, not re-randomized on every
// render) icon from this pool purely for visual distinction in a long list.
const LOCATION_ICONS = [Building2, Warehouse, Factory, Landmark, Mountain, TreePine, RadioTower, Tent];

function pickLocationIcon(locationId: string) {
  let hash = 0;
  for (let i = 0; i < locationId.length; i++) {
    hash = (hash * 31 + locationId.charCodeAt(i)) | 0;
  }
  return LOCATION_ICONS[Math.abs(hash) % LOCATION_ICONS.length];
}

interface LocationSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  locations: LocationOption[];
}

export default function LocationSelectStep({ draft, onUpdate, locations }: LocationSelectStepProps) {
  const navigation = useNavigation<any>();
  const selectedSet = new Set(draft.locationIds);

  function applyLocationIds(nextIds: string[]): void {
    onUpdate({
      locationIds: nextIds,
      selectedPileIds: [],
      assignments: {},
      resumeWorkByPileId: {},
      stepTrackOverrides: {},
    });
  }

  function toggleLocation(locationId: string): void {
    applyLocationIds(
      selectedSet.has(locationId)
        ? draft.locationIds.filter((id) => id !== locationId)
        : [...draft.locationIds, locationId],
    );
  }

  if (locations.length === 0) {
    return (
      <EmptyState
        icon="map-pin"
        title="No locations available"
        message="No work locations have been synced for this site yet. Pull data from the Profile tab to continue."
        actionLabel="Go to Profile"
        onAction={() => navigation.navigate('ProfileTab')}
      />
    );
  }

  const selectedCount = draft.locationIds.length;
  const allSelected = selectedCount === locations.length;

  function toggleSelectAll(): void {
    applyLocationIds(allSelected ? [] : locations.map((l) => l.id));
  }

  return (
    <GlassCard>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MapPin size={20} color={RIG_COLOR} />
          </View>
          <Text style={styles.title}>Work Locations</Text>
        </View>
        <Text style={styles.description}>
          Choose one or more work locations for today's plan. Piles from all selected
          locations will be available in the next step.
        </Text>

        <View style={styles.summaryBar}>
          <View style={styles.summaryLeft}>
            <Users size={16} color={RIG_COLOR} />
            <Text style={styles.summaryCountText}>
              {selectedCount} {selectedCount === 1 ? 'location' : 'locations'} selected
            </Text>
          </View>
          <Pressable style={styles.selectAllBtn} onPress={toggleSelectAll} hitSlop={8}>
            <Text style={styles.selectAllText}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
            {allSelected ? (
              <SquareCheck size={18} color={RIG_COLOR} />
            ) : (
              <Square size={18} color={RIG_COLOR} />
            )}
          </Pressable>
        </View>

        {locations.map((location) => {
          const selected = selectedSet.has(location.id);
          const LocationIcon = pickLocationIcon(location.id);
          return (
            <Pressable
              key={location.id}
              style={[styles.locationCard, selected && styles.locationCardSelected]}
              onPress={() => toggleLocation(location.id)}
            >
              <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                {selected ? <Check size={14} color={colors.white} /> : null}
              </View>
              <View style={styles.iconCircle}>
                <LocationIcon size={18} color={RIG_COLOR} />
              </View>
              <View style={styles.locationBody}>
                <Text style={styles.locationName}>{location.name}</Text>
                {location.code ? <Text style={styles.locationCode}>{location.code}</Text> : null}
              </View>
              {selected && (
                <View style={styles.selectedPill}>
                  <View style={styles.selectedPillIconWrap}>
                    <Check size={10} color={colors.white} />
                  </View>
                  <Text style={styles.selectedPillText}>Selected</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0, paddingHorizontal: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RIG_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.pageTitle, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },

  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: RIG_SOFT,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  summaryCountText: { ...typography.body, fontWeight: '700', color: RIG_COLOR },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectAllText: { ...typography.caption, fontWeight: '700', color: RIG_COLOR },

  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  locationCardSelected: { backgroundColor: RIG_SOFT, borderColor: RIG_COLOR },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.3)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: RIG_COLOR, borderColor: RIG_COLOR },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RIG_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBody: { flex: 1 },
  locationName: { ...typography.cardTitle, color: colors.textPrimary },
  locationCode: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  selectedPillIconWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: RIG_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPillText: { ...typography.caption, fontWeight: '700', color: RIG_COLOR },
});
