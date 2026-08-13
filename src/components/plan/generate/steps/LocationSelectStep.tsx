// src/components/plan/generate/steps/LocationSelectStep.tsx

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
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

interface LocationSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  locations: LocationOption[];
}

export default function LocationSelectStep({ draft, onUpdate, locations }: LocationSelectStepProps) {
  const navigation = useNavigation<any>();
  const selectedSet = new Set(draft.locationIds);

  function toggleLocation(locationId: string): void {
    const nextIds = selectedSet.has(locationId)
      ? draft.locationIds.filter((id) => id !== locationId)
      : [...draft.locationIds, locationId];

    onUpdate({
      locationIds: nextIds,
      selectedPileIds: [],
      assignments: {},
      resumeWorkByPileId: {},
      stepTrackOverrides: {},
    });
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

  return (
    <GlassCard>
      <View style={styles.container}>
        <Text style={styles.title}>Work Locations</Text>
        <Text style={styles.description}>
          Choose one or more work locations for today's plan. Piles from all selected
          locations will be available in the next step.
        </Text>
        {selectedCount > 0 ? (
          <Text style={styles.selectedCount}>
            {selectedCount} {selectedCount === 1 ? 'location' : 'locations'} selected
          </Text>
        ) : null}

        {locations.map((location) => {
          const selected = selectedSet.has(location.id);
          return (
            <Pressable
              key={location.id}
              style={[styles.locationCard, selected && styles.locationCardSelected]}
              onPress={() => toggleLocation(location.id)}
            >
              <View style={styles.locationRow}>
                <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                  {selected ? <Check size={14} color={colors.white} /> : null}
                </View>
                <View style={styles.locationBody}>
                  <Text style={[styles.locationCardTitle, selected && styles.locationCardTitleSelected]}>
                    {location.name}
                  </Text>
                  {location.code ? <Text style={styles.locationCardMeta}>{location.code}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingHorizontal: spacing.md },
  title: { ...typography.pageTitle, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  selectedCount: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  locationCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  locationCardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locationBody: { flex: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  locationCardTitle: { ...typography.cardTitle, color: colors.textPrimary },
  locationCardTitleSelected: { color: colors.accent },
  locationCardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
