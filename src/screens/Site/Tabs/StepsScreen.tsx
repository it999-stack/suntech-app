// src/screens/Site/Tabs/StepsScreen.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';

import { colors, spacing, radius, typography } from '@/theme/theme';
import GlassCard from '@components/shared/GlassCard';
import Badge from '@components/shared/Badge';
import { getSteps, getAllTemplatesWithDimensions } from '@repositories/stepsRepository';
import type { TemplateWithDimension } from '@repositories/stepsRepository';
import type { PilingStep } from '@/db/schema';
import { TRACK_META } from '@/utils/helpers';
import { formatDurationLong } from '@/utils/formatTime';
import { useAuthStore } from '@store/authStore';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';
import { onBootstrapCompleted } from '@sync/bootstrap/bootstrapSync';

function StepCard({
  step,
  displayNumber,
  templates,
}: {
  step: PilingStep;
  displayNumber: number;
  templates: TemplateWithDimension[];
}) {
  const meta = TRACK_META[step.track as keyof typeof TRACK_META] ?? TRACK_META.RIG;
  const Icon = meta.icon;

  return (
    <GlassCard innerStyle={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.numBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.numText}>{displayNumber}</Text>
        </View>
        <Text style={styles.stepName} numberOfLines={1}>
          {step.stepName}
        </Text>
        <Badge icon={Icon} text={meta.label} textColor={meta.color} bgColor={meta.soft} />
      </View>

      <View style={styles.templateList}>
        {templates.length === 0 ? (
          <Text style={styles.emptyTemplateText}>No duration templates configured.</Text>
        ) : (
          templates.map((t, idx) => (
            <View
              key={t.id}
              style={[styles.templateRow, idx !== templates.length - 1 && styles.templateRowDivider]}
            >
              <Text style={styles.templateDims}>
                {t.dimension ? `Ø${t.dimension.dia}mm × ${t.dimension.depth}m` : '—'}
              </Text>
              <Text style={styles.templateTime}>
                {formatDurationLong(t.durationMinutes)}
                {t.bufferBeforeMinutes > 0 && ` (+${t.bufferBeforeMinutes} buffer)`}
              </Text>
            </View>
          ))
        )}
      </View>
    </GlassCard>
  );
}

export default function StepsScreen() {
  const siteId = useAuthStore((s) => s.user?.siteId);
  const [steps, setSteps] = useState<PilingStep[]>([]);
  const [templates, setTemplates] = useState<TemplateWithDimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) { setLoading(false); return; }

    let cancelled = false;
    const loadFromDb = () => {
      Promise.all([getSteps(), getAllTemplatesWithDimensions(siteId)])
        .then(([stepRows, templateRows]) => {
          if (cancelled) return;
          setSteps(stepRows);
          setTemplates(templateRows);
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    loadFromDb();

    // Local pilingSteps/pilingStepDurationTemplates get overwritten by every
    // sync (bootstrap on first install, delta pull thereafter — see
    // deltaPull.ts's site_steps handling), but this screen only ever read
    // them once on mount — a reorder/duration change made elsewhere never
    // showed up here until the app restarted. Same fix as
    // SiteSettingsContext/AppConfigContext/PlanContext: reload whenever a
    // sync completes, not just on first mount.
    const unsubscribeDelta = onDeltaSyncComplete(loadFromDb);
    const unsubscribeBootstrap = onBootstrapCompleted(loadFromDb);

    return () => {
      cancelled = true;
      unsubscribeDelta();
      unsubscribeBootstrap();
    };
  }, [siteId]);

  const templatesByStepId = useMemo(() => {
    const map = new Map<string, TemplateWithDimension[]>();
    for (const t of templates) {
      const list = map.get(t.stepId);
      if (list) list.push(t);
      else map.set(t.stepId, [t]);
    }
    return map;
  }, [templates]);

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Piling Steps</Text>
          <Text style={styles.pageSubtitle}>{steps.length} steps · duration by dia/depth</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : (
          <FlatList
            data={steps}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <StepCard step={item} displayNumber={index + 1} templates={templatesByStepId.get(item.id) ?? []} />
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  numBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  stepName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  headerBody: {
    flex: 1,
    gap: 4,
  },
  templateList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  templateRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  templateDims: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  templateTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyTemplateText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
  },
});
