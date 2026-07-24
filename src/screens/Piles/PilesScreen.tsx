// src/screens/Piles/PilesScreen.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import SearchBar from '@components/piles/SearchBar';
import PileFilterBar, { PileFilterKey } from '@components/piles/PileFilterBar';
import PileAccordionItem, { PileItemData } from '@components/piles/PileAccordionItem';
import { SegmentedToggle } from '@components/shared/SegmentedToggle';
import { colors, spacing, radius, typography } from '@theme/theme';
import { usePilesAreasStore } from '@store/pilesAreasStore';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { getMachinesBySite } from '@repositories/machinesRepository';
import type { PilesStackParamList } from '@app-types/navigation';
import EmptyState from '@/components/shared/EmptyState';

type Props = NativeStackScreenProps<PilesStackParamList, 'PilesScreen'>;

type ViewMode = 'all' | 'today';

// Steps carry plannedStart/plannedEnd as ISO-ish datetime strings, so a
// straight ascending string/Date comparison sorts them chronologically.
// Any step missing a plannedStart sinks to the end rather than throwing
// off the order of the ones that do have a time.
function byPlannedStartAsc<T extends { plannedStart?: string }>(a: T, b: T): number {
  if (!a.plannedStart && !b.plannedStart) return 0;
  if (!a.plannedStart) return 1;
  if (!b.plannedStart) return -1;
  return new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime();
}

const VIEW_MODE_OPTIONS = [
  { label: "Today's Target", value: 'today' as const },
  { label: 'All Piles', value: 'all' as const },
];

export default function PilesScreen() {
  const route = useRoute<Props['route']>();
  const initialView = route.params?.initialView ?? 'today';
  const initialFilter = (route.params?.initialFilter as PileFilterKey | undefined) ?? 'all';

  const user = useAuthStore((s) => s.user);

  const { piles, isLoading: pilesLoading, error, loadAll } = usePilesAreasStore();
  const { checklistPiles, planSteps, actualSteps } = usePlan();

  // Load piles + areas for the current site on mount and whenever siteId changes.
  useEffect(() => {
    loadAll(user?.siteId);
  }, [user?.siteId, loadAll]);

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
       const pileSteps = planSteps
         .filter((s) => s.checklistPileId === cp.id)
         .slice()
         .sort(byPlannedStartAsc);
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
         code: pile?.code ?? cp.pileId,
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
             track: (s.track ?? 'RIG') as 'RIG' | 'CRANE' | 'COMPRESSOR',
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
             code: p.code,
             dia: p.dia,
             depth: p.depth,
             rig: '—',
             crane: '—',
             status: 'pending' as const,
             steps: [],
           };
         }

         // Planned today — derive live status from actuals
         const pileSteps = planSteps
           .filter((s) => s.checklistPileId === cp.id)
           .slice()
           .sort(byPlannedStartAsc);
         const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);

         let status: PileItemData['status'] = 'pending';
         if (pileActuals.some((a) => a.actualStart && !a.actualEnd)) status = 'in_progress';
         else if (
           pileSteps.length > 0 &&
           pileActuals.filter((a) => a.actualEnd).length === pileSteps.length
         ) status = 'completed';

         return {
           id: p.id,
           code: p.code,
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
               track: (s.track ?? 'RIG') as 'RIG' | 'CRANE' | 'COMPRESSOR',
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

  function getEmptyStateContent() {
    if (viewMode === 'today' && checklistPiles.length === 0) {
      return {
        icon: 'calendar' as const,
        title: 'No plan generated',
        message: 'Go to Home to create a plan for today.',
      };
    }
    if (viewMode === 'today') {
      return {
        icon: 'search' as const,
        title: 'No matches',
        message: 'No piles match your filter.',
      };
    }
    if (piles.length === 0) {
      return {
        icon: 'download' as const,
        title: 'No piles synced',
        message: 'No piles synced yet. Pull data from the Profile tab.',
      };
    }
    return {
      icon: 'search' as const,
      title: 'No matches',
      message: 'No piles match your search or filter.',
    };
  }

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

          <SegmentedToggle options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
          
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
            <EmptyState {...getEmptyStateContent()} />
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