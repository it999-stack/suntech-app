// src/components/plan/generate/preview/DurationWarningCard.tsx
//
// Flags piles that have no matching dimension duration template and are
// falling back to a 60-minute default per step. Self-contained (not built on
// the shared Accordion/SummaryAccordion/GlassCard) so it can use a full-bleed,
// two-tone header band that those shared components don't support.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import CoordinatorCallModal from '@components/shared/CoordinatorCallModal';
import { getSiteCoordinatorsBySite } from '@repositories/siteCoordinatorsRepository';
import type { PilSiteCoordinator } from '@db/schema';

interface DurationWarningCardProps {
  pileCodes: string[];
  siteId: string;
}

export default function DurationWarningCard({ pileCodes, siteId }: DurationWarningCardProps) {
  const [open, setOpen] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [coordinators, setCoordinators] = useState<PilSiteCoordinator[]>([]);

  useEffect(() => {
    if (!siteId) return;
    getSiteCoordinatorsBySite(siteId).then(setCoordinators);
  }, [siteId]);

  if (pileCodes.length === 0) return null;

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <AlertTriangle size={18} color={colors.danger} />
        <Text style={styles.headerText}>
          {pileCodes.length} pile{pileCodes.length === 1 ? '' : 's'} defaulting to 60m duration
        </Text>
        {open ? (
          <ChevronUp size={18} color={colors.textSecondary} strokeWidth={2} />
        ) : (
          <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
        )}
      </Pressable>

      {open && (
        <View style={styles.body}>
          <Text style={styles.description}>
            No dimension template matches these piles, so their steps use a 60-minute default.
            Connect Head Office to pull the correct durations.
          </Text>

          <Text style={styles.sectionLabel}>Affected piles</Text>
          <View style={styles.pillRow}>
            {pileCodes.map((code) => (
              <View key={code} style={styles.pill}>
                <Text style={styles.pillText}>{code}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.ctaRow} onPress={() => setPickerVisible(true)} hitSlop={8}>
            <Text style={styles.ctaText}>Connect Head Office</Text>
            <ArrowRight size={17} color={colors.accentBlue} />
          </Pressable>
        </View>
      )}

      <CoordinatorCallModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title="Connect Head Office"
        coordinators={coordinators}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...shadow.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.warningSoft,
  },
  headerText: {
    ...typography.cardTitle,
    flex: 1,
    color: colors.danger,
  },
  body: {
    padding: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  pillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.danger,
    fontSize: 12,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  ctaText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 16,
    color: colors.accentBlue,
  },
});
