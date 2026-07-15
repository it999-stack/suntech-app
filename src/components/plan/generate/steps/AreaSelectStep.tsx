// src/components/plan/generate/steps/AreaSelectStep.tsx

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import GlassCard from '@/components/shared/GlassCard';
import EmptyState from '@/components/shared/EmptyState';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';

export type AreaOption = {
  id: string;
  name: string;
  code?: string | null;
};

interface AreaSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  areas: AreaOption[];
}

export default function AreaSelectStep({ draft, onUpdate, areas }: AreaSelectStepProps) {
  const navigation = useNavigation<any>();
  const selectedSet = new Set(draft.areaIds);

  function toggleArea(areaId: string): void {
    const nextIds = selectedSet.has(areaId)
      ? draft.areaIds.filter((id) => id !== areaId)
      : [...draft.areaIds, areaId];

    onUpdate({
      areaIds: nextIds,
      selectedPileIds: [],
      assignments: {},
      resumeWorkByPileId: {},
    });
  }

  if (areas.length === 0) {
    return (
      <EmptyState
        icon="map-pin"
        title="No areas available"
        message="No work areas have been synced for this site yet. Pull data from the Profile tab to continue."
        actionLabel="Go to Profile"
        onAction={() => navigation.navigate('ProfileTab')}
      />
    );
  }

  const selectedCount = draft.areaIds.length;

  return (
    <GlassCard>
      <View style={styles.container}>
        <Text style={styles.title}>Work Areas</Text>
        <Text style={styles.description}>
          Choose one or more work areas for today's plan. Piles from all selected
          areas will be available in the next step.
        </Text>
        {selectedCount > 0 ? (
          <Text style={styles.selectedCount}>
            {selectedCount} {selectedCount === 1 ? 'area' : 'areas'} selected
          </Text>
        ) : null}

        {areas.map((area) => {
          const selected = selectedSet.has(area.id);
          return (
            <Pressable
              key={area.id}
              style={[styles.areaCard, selected && styles.areaCardSelected]}
              onPress={() => toggleArea(area.id)}
            >
              <View style={styles.areaRow}>
                <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                  {selected ? <Check size={14} color={colors.white} /> : null}
                </View>
                <View style={styles.areaBody}>
                  <Text style={[styles.areaCardTitle, selected && styles.areaCardTitleSelected]}>
                    {area.name}
                  </Text>
                  {area.code ? <Text style={styles.areaCardMeta}>{area.code}</Text> : null}
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
  areaCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  areaCardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  areaBody: { flex: 1 },
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
  areaCardTitle: { ...typography.cardTitle, color: colors.textPrimary },
  areaCardTitleSelected: { color: colors.accent },
  areaCardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});