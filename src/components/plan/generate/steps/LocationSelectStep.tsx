// src/components/plan/generate/steps/LocationSelectStep.tsx

import { View, Text, StyleSheet } from 'react-native';
import {
  MapPin,
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
import TileGroup, { type TileGroupOption } from '@components/shared/TileGroup';
import { colors, spacing, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import type { PlanDraftActions } from '@screens/Home/generatePlan/usePlanDraft';

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
  actions: Pick<PlanDraftActions, 'setLocations'>;
  locations: LocationOption[];
}

export default function LocationSelectStep({ draft, actions, locations }: LocationSelectStepProps) {
  const navigation = useNavigation<any>();
  const selectedSet = new Set(draft.locationIds);

  function toggleLocation(locationId: string): void {
    actions.setLocations(
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

  // Same row design as MachineSelectStep's tiles — icon chip + label, colored
  // border only once actually selected (see TileSelect.showSelected).
  const locationOptions: TileGroupOption[] = locations.map((location) => ({
    id: location.id,
    label: location.code ? `${location.name} (${location.code})` : location.name,
    icon: pickLocationIcon(location.id),
    color: RIG_COLOR,
    soft: RIG_SOFT,
  }));

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

        <TileGroup options={locationOptions} selectedIds={draft.locationIds} onToggle={toggleLocation} columns={1} />
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
  description: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
