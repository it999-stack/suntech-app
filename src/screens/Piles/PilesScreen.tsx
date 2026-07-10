// src/screens/Piles/PilesScreen.tsx
//
// Shows all piles (All Piles mode) or today's planned piles (Today's Target mode).
// Accepts initialView and initialFilter route params from HomeScreen deep-links.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import SearchBar from '../../components/piles/SearchBar';
import PileFilterBar, { PileFilterKey } from '../../components/piles/PileFilterBar';
import PileAccordionItem, { PileItemData } from '../../components/piles/PileAccordionItem';
import { colors, spacing, radius, typography, shadow } from '../../theme/theme';
import { usePilesContext } from '../../state/PilesContext';
import { usePlan } from '../../state/PlanContext';
import { useAuthStore } from '../../store/authStore';
import { getMachinesBySite } from '../../repositories/machinesRepository';
import type { PilesStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<PilesStackParamList, 'PilesScreen'>;

type ViewMode = 'all' | 'today';

function ViewToggle({ active, onChange }: { active: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <View style={styles.toggle}>
      <Pressable
        style={[styles.toggleSegment, active === 'today' && styles.toggleSegmentActive]}
        onPress={() => onChange('today')}
      >
        <Text style={[styles.toggleText, active === 'today' && styles.toggleTextActive]}>
          Today's Target
        </Text>
      </Pressable>
      <Pressable
        style={[styles.toggleSegment, active === 'all' && styles.toggleSegmentActive]}
        onPress={() => onChange('all')}
      >
        <Text style={[styles.toggleText, active === 'all' && styles.toggleTextActive]}>
          All Piles
        </Text>
      </Pressable>
    </View>
  );
}

export default function PilesScreen() {
  const route = useRoute<Props['route']>();
  const initialView = route.params?.initialView ?? 'today';
  const initialFilter = (route.params?.initialFilter as PileFilterKey | undefined) ?? 'all';

  const { piles, isLoading: pilesLoading, error } = usePilesContext();
  const { checklistPiles, planSteps, actualSteps } = usePlan();

  const user = useAuthStore((s) => s.user);
  const [machineMap, setMachineMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user?.siteId) return;
    getMachinesBySite(user.siteId).then((machines) => {
      setMachineMap(new Map(machines.map((m) => [m.id, m.machineNo])));
    }).catch(() => {});
  }, [user?.siteId]);

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PileFilterKey>(initialFilter);

  // ── Build "Today's Target" items from plan context ─────────────────────────
  const todayItems = useMemo<PileItemData[]>(() => {
    return checklistPiles.map((cp) => {
      const pile = piles.find((p) => p.id === cp.pileId);
      const pileSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      // actualSteps are keyed by checklistPileId + stepId
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);

      // Derive pile status
      let status: PileItemData['status'] = 'pending';
      if (pileActuals.some((a) => a.actualStart && !a.actualEnd)) status = 'in_progress';
      else if (
        pileSteps.length > 0 &&
        pileActuals.filter((a) => a.actualEnd).length === pileSteps.length
      ) status = 'completed';

      return {
        id: cp.id,
        code: pile?.pileIdCode ?? cp.pileId,
        dia: pile?.dia ?? 0,
        depth: pile?.depth ?? 0,
        rig: machineMap.get(cp.rigId) ?? '—',
        crane: machineMap.get(cp.craneId) ?? '—',
        status,
        steps: pileSteps.map((s) => {
          const actual = pileActuals.find((a) => a.stepId === s.stepId);
          return {
            id: s.id,
            name: s.stepName ?? '',
            track: (s.track ?? 'RIG') as 'RIG' | 'CRANE',
            start: s.plannedStart,
            end: s.plannedEnd,
            status: actual?.actualEnd ? 'done' : 'upcoming',
          } satisfies import('../../components/piles/PileAccordionItem').PlanStep;
        }),
      };
    });
  }, [checklistPiles, piles, planSteps, actualSteps, machineMap]);

  // ── Build "All Piles" items ─────────────────────────────────────────────────
  // Cross-reference with today's plan so piles that are planned show live status.
  const allItems = useMemo<PileItemData[]>(
    () =>
      piles.map((p) => {
        // Check if this pile is in today's plan
        const cp = checklistPiles.find((c) => c.pileId === p.id);
        if (!cp) {
          // Not planned today — show as pending with no steps
          return {
            id: p.id,
            code: p.pileIdCode,
            dia: p.dia,
            depth: p.depth,
            rig: '—',
            crane: '—',
            status: 'pending' as const,
            steps: [],
          };
        }

        // Planned today — derive live status from actuals
        const pileSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
        const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);

        let status: PileItemData['status'] = 'pending';
        if (pileActuals.some((a) => a.actualStart && !a.actualEnd)) status = 'in_progress';
        else if (
          pileSteps.length > 0 &&
          pileActuals.filter((a) => a.actualEnd).length === pileSteps.length
        ) status = 'completed';

        return {
          id: p.id,
          code: p.pileIdCode,
          dia: p.dia,
          depth: p.depth,
          rig: machineMap.get(cp.rigId) ?? '—',
          crane: machineMap.get(cp.craneId) ?? '—',
          status,
          steps: pileSteps.map((s) => {
            const actual = pileActuals.find((a) => a.stepId === s.stepId);
            return {
              id: s.id,
              name: s.stepName ?? '',
              track: (s.track ?? 'RIG') as 'RIG' | 'CRANE',
              start: s.plannedStart,
              end: s.plannedEnd,
              status: actual?.actualEnd ? 'done' : 'upcoming',
            } satisfies import('../../components/piles/PileAccordionItem').PlanStep;
          }),
        };
      }),
    [piles, checklistPiles, planSteps, actualSteps, machineMap],
  );

  // ── Filter ──────────────────────────────────────────────────────────────────
  const sourceItems = viewMode === 'today' ? todayItems : allItems;
  const filtered = useMemo(() => {
    return sourceItems.filter((p) => {
      const matchesQuery = p.code.toLowerCase().includes(query.trim().toLowerCase());
      const matchesFilter = filter === 'all' || p.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [sourceItems, query, filter]);

  const shownCount = filtered.length;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (pilesLoading) {
    return (
      <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
        <SafeAreaView style={[styles.flex, styles.center]} edges={['top']}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.emptyText, { marginTop: spacing.md }]}>Loading piles…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Sticky header */}
        <View style={styles.headerArea}>
          <View style={styles.titleRow}>
            <Text style={styles.h1}>Piles</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{shownCount} shown</Text>
            </View>
          </View>

          <ViewToggle active={viewMode} onChange={setViewMode} />
          <SearchBar value={query} onChangeText={setQuery} />
          <PileFilterBar active={filter} onChange={setFilter} />
        </View>

        {/* Scrollable list */}
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {error && <Text style={styles.errorText}>⚠ {error}</Text>}

          {filtered.map((pile) => (
            <PileAccordionItem key={pile.id} pile={pile} />
          ))}

          {filtered.length === 0 && !error && (
            <Text style={styles.emptyText}>
              {viewMode === 'today' && checklistPiles.length === 0
                ? "No plan generated for today. Go to Home to create one."
                : viewMode === 'today'
                ? 'No piles match your filter.'
                : piles.length === 0
                ? 'No piles synced yet. Pull data from the Profile tab.'
                : 'No piles match your search or filter.'}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  h1: {
    ...typography.h1,
    color: colors.textPrimary,
  },

  countBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  countText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
  },

  // View mode toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: 4,
  },
  toggleSegment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  toggleSegmentActive: {
    backgroundColor: colors.white,
    ...shadow.soft,
  },
  toggleText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },

  errorText: {
    ...typography.body,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});