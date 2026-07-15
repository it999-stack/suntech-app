// src/screens/Site/Tabs/StepDetailScreen.tsx
// Read-only display of duration templates for a single piling step, synced from server.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Clock } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, radius, typography } from '@/theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getTemplatesWithDimensions } from '@repositories/stepsRepository';
import type { TemplateWithDimension } from '@repositories/stepsRepository';
import type { SiteStackParamList } from '@/types/navigation';

type Route = RouteProp<SiteStackParamList, 'StepDetail'>;
type Nav = NativeStackNavigationProp<SiteStackParamList, 'StepDetail'>;

export default function StepDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { stepId } = route.params;
  const [templates, setTemplates] = useState<TemplateWithDimension[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadTemplates = useCallback(() => {
    setLoading(true);
    getTemplatesWithDimensions(stepId)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stepId]);

  useEffect(() => {
    reloadTemplates();
  }, [reloadTemplates]);

  // Get step name from templates or use stepId
  const stepName = templates[0]?.dimension
    ? `Step ${stepId}`
    : stepId;

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Step Templates</Text>
            <View style={{ width: 22 }} />
          </View>
          <Text style={styles.subtitle}>Duration templates synced from server</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.scrollContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No templates configured for this step.</Text>
            }
            renderItem={({ item }) => (
              <GlassCard style={styles.templateCard}>
                <View style={styles.templateRow}>
                  <View style={styles.iconWrap}>
                    <Clock size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateLabel}>
                      {item.dimension?.dia}mm × {item.dimension?.depth}m
                    </Text>
                    <Text style={styles.templateTime}>
                      {item.durationMinutes} min
                      {item.bufferBeforeMinutes > 0 && ` (+${item.bufferBeforeMinutes} buffer)`}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  templateCard: {},
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  templateTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});