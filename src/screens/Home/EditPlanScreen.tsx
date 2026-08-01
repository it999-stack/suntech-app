// src/screens/Home/EditPlanScreen.tsx
//
// Mid-day plan edit: reorder / add / remove piles on an already-generated,
// possibly partially-worked checklist. Deliberately NOT the generation
// wizard — everything (area, start time, machines, team, steps) is already
// fixed for today, so this is a small, purpose-built screen. Reuses
// ReorderPilesOverlay (same component the wizard's Preview step uses) for
// the per-machine reorder interaction.
//
// Editability, enforced by the server (edit_checklist_plan_mid_day) and
// mirrored here so the UI never offers an action the backend would reject:
//   - a pile with any logged actual work can't be removed (its progress
//     would be orphaned) — only piles with zero actualStart anywhere can.
//   - a pile with a currently-running step is fully frozen: excluded from
//     the reorderable subset entirely, since its machine/position can't
//     change until that step finishes.
//   - a pile with any progress (but not running) is pinned in the reorder
//     overlay rather than freely movable: the scheduler's priority_key
//     always places resuming piles ahead of fresh ones regardless of
//     seq_no, so its position can't actually be changed — it simply
//     resumes from its next unfinished step wherever it's pinned.
//   - rig-crane-unchanged, not-yet-started piles reorder freely.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronLeft, Trash2, Plus, ListOrdered, Lock, X } from 'lucide-react-native';
import type { HomeStackParamList } from '@app-types/navigation';
import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import ReorderPilesOverlay, { type ReorderPile } from '@components/plan/generate/preview/ReorderPilesOverlay';
import type { MachineInfo } from '@/types/timeline';
import { usePlan, type EditPlanPileInput } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import { getPilesBySiteWithDimensions, type PileWithDimension } from '@repositories/pilesRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import type { PilingMachine } from '@db/schema';

type EditPlanRouteProp = RouteProp<HomeStackParamList, 'EditPlan'>;

type Row = {
  pileId: string;
  rigId: string;
  craneId: string;
  hasProgress: boolean;
  isRunning: boolean;
};

/** Splices a reordered subset (one machine's piles) back into the full pile
 * order, leaving every other pile's position untouched — same logic as
 * GeneratePlanScreen's wizard-local mergeOrder(). */
function mergeOrder(fullOrder: string[], subsetNewOrder: string[]): string[] {
  const subsetIds = new Set(subsetNewOrder);
  let i = 0;
  return fullOrder.map((id) => (subsetIds.has(id) ? subsetNewOrder[i++] : id));
}

export default function EditPlanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<EditPlanRouteProp>();
  const user = useAuthStore((s) => s.user);
  const siteId = user?.siteId ?? '';
  const deviceWorkingDate = useWorkingDate();
  const workingDate = route.params?.date ?? deviceWorkingDate;

  const { checklist, checklistPiles, actualSteps, loadChecklist, editPlanMidDay, isGenerating } = usePlan();

  useEffect(() => {
    if (siteId) loadChecklist(siteId, workingDate);
  }, [siteId, workingDate, loadChecklist]);

  // ── Reference data ────────────────────────────────────────────────────
  const [allPiles, setAllPiles] = useState<PileWithDimension[]>([]);
  const [rigs, setRigs] = useState<PilingMachine[]>([]);
  const [cranes, setCranes] = useState<PilingMachine[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLookupsLoading(true);
    (async () => {
      const [piles, rigsRaw, cranesRaw] = await Promise.all([
        getPilesBySiteWithDimensions(siteId),
        getMachinesByType(siteId, 'RIG'),
        getMachinesByType(siteId, 'CRANE'),
      ]);
      setAllPiles(piles);
      setRigs(rigsRaw);
      setCranes(cranesRaw);
      setLookupsLoading(false);
    })();
  }, [siteId]);

  const pileById = useMemo(() => new Map(allPiles.map((p) => [p.id, p])), [allPiles]);
  function machineLabel(id: string): string {
    return rigs.find((m) => m.id === id)?.machineNo ?? cranes.find((m) => m.id === id)?.machineNo ?? '—';
  }
  // Looked up live from pileById on every call rather than baked into Row —
  // checklistPiles (context, loads immediately) and allPiles (this screen's
  // own async fetch) resolve independently, so a Row built too early would
  // otherwise permanently freeze on the raw pileId as a fallback.
  function pileCodeFor(pileId: string): string {
    return pileById.get(pileId)?.pileIdCode ?? pileId;
  }

  // ── Working list — a local draft, only submitted to the server on Save ──
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (rows !== null || !checklistPiles.length) return;
    const initial: Row[] = checklistPiles.map((cp) => {
      const steps = actualSteps.filter((a) => a.checklistPileId === cp.id);
      const hasProgress = steps.some((a) => a.actualStart != null);
      const isRunning = steps.some((a) => a.actualStart != null && a.actualEnd == null);
      return {
        pileId: cp.pileId,
        rigId: cp.rigId,
        craneId: cp.craneId,
        hasProgress,
        isRunning,
      };
    });
    setRows(initial);
  }, [checklistPiles, actualSteps, rows]);

  const workingRows = rows ?? [];

  // ── Add pile ──────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingPile, setPendingPile] = useState<PileWithDimension | null>(null);
  const [pendingRigId, setPendingRigId] = useState<string | null>(null);
  const [pendingCraneId, setPendingCraneId] = useState<string | null>(null);

  const usedPileIds = useMemo(() => new Set(workingRows.map((r) => r.pileId)), [workingRows]);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPiles
      .filter((p) => !usedPileIds.has(p.id))
      .filter((p) => !q || p.pileIdCode.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allPiles, usedPileIds, search]);

  function closePicker() {
    setPickerOpen(false);
    setPendingPile(null);
    setPendingRigId(null);
    setPendingCraneId(null);
    setSearch('');
  }

  function confirmAddPile() {
    if (!pendingPile || !pendingRigId || !pendingCraneId) return;
    setRows((prev) => [
      ...(prev ?? []),
      {
        pileId: pendingPile.id,
        rigId: pendingRigId,
        craneId: pendingCraneId,
        hasProgress: false,
        isRunning: false,
      },
    ]);
    closePicker();
  }

  // ── Remove pile ───────────────────────────────────────────────────────
  function removePile(pileId: string) {
    setRows((prev) => (prev ?? []).filter((r) => r.pileId !== pileId));
  }

  // ── Reorder (per machine, same interaction as the wizard's Preview step) ─
  const activeMachines: MachineInfo[] = useMemo(() => {
    const rigIds = new Set(workingRows.map((r) => r.rigId));
    const craneIds = new Set(workingRows.map((r) => r.craneId));
    return [
      ...rigs.filter((m) => rigIds.has(m.id)).map((m) => ({ id: m.id, machineNo: m.machineNo, type: 'RIG' as const })),
      ...cranes.filter((m) => craneIds.has(m.id)).map((m) => ({ id: m.id, machineNo: m.machineNo, type: 'CRANE' as const })),
    ];
  }, [rigs, cranes, workingRows]);

  const [reorderMachineId, setReorderMachineId] = useState<string | null>(null);
  const reorderMachine = activeMachines.find((m) => m.id === reorderMachineId) ?? null;

  function pilesForMachine(machine: MachineInfo): ReorderPile[] {
    return workingRows
      .filter((r) => (machine.type === 'RIG' ? r.rigId : r.craneId) === machine.id)
      // A running pile's machine/position can't change until its current
      // step finishes — excluded from the reorderable subset entirely.
      .filter((r) => !r.isRunning)
      .map((r) => ({
        id: r.pileId,
        label: `Pile ${pileCodeFor(r.pileId)}`,
        // Already has progress — the scheduler always places resuming piles
        // ahead of fresh ones regardless of seq_no, so its position can't
        // actually be changed; pinned in place rather than offering a
        // reorder control with no effect.
        locked: r.hasProgress,
      }));
  }

  function handleReorder(newSubsetOrder: string[]) {
    const fullOrder = workingRows.map((r) => r.pileId);
    const merged = mergeOrder(fullOrder, newSubsetOrder);
    setRows((prev) => {
      const byId = new Map((prev ?? []).map((r) => [r.pileId, r]));
      return merged.map((id) => byId.get(id)!);
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!checklist) return;
    const piles: EditPlanPileInput[] = workingRows.map((r) => ({
      pileId: r.pileId,
      rigId: r.rigId,
      craneId: r.craneId,
    }));
    setSaving(true);
    try {
      const summary = await editPlanMidDay(siteId, checklist.id, workingDate, piles);
      Alert.alert(
        'Plan updated',
        [
          summary.pilesRemoved.length ? `${summary.pilesRemoved.length} pile(s) removed` : null,
          summary.pilesAdded.length ? `${summary.pilesAdded.length} pile(s) added` : null,
          `${summary.stepsRegeneratedCount} future step(s) rescheduled`,
          summary.pilesLockedSkipped.length
            ? `${summary.pilesLockedSkipped.length} pile(s) skipped — currently in progress`
            : null,
          summary.warningPiles.length
            ? `${summary.warningPiles.length} pile(s) couldn't be fully scheduled — check dimensions/templates`
            : null,
          'Completed and running work was preserved.',
        ]
          .filter(Boolean)
          .join('\n'),
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      const message =
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Please try again.');
      Alert.alert('Could not save changes', message);
    } finally {
      setSaving(false);
    }
  }

  const loading = lookupsLoading || rows === null;
  const busy = saving || isGenerating;

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSideBtn}>
            <ChevronLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.pageTitle} numberOfLines={1}>Edit Plan</Text>
          <View style={styles.headerSideBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {activeMachines.length > 0 && (
                <GlassCard innerStyle={styles.sectionPad}>
                  <Text style={styles.sectionTitle}>Reorder by machine</Text>
                  <View style={styles.chipRow}>
                    {activeMachines.map((m) => (
                      <Pressable key={m.id} onPress={() => setReorderMachineId(m.id)} style={styles.machineChip}>
                        <ListOrdered size={14} color={colors.accent} />
                        <Text style={styles.machineChipText}>{m.machineNo}</Text>
                      </Pressable>
                    ))}
                  </View>
                </GlassCard>
              )}

              <GlassCard innerStyle={styles.sectionPad}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Piles ({workingRows.length})</Text>
                  <Pressable onPress={() => setPickerOpen(true)} style={styles.addBtn} hitSlop={8}>
                    <Plus size={16} color={colors.accent} />
                    <Text style={styles.addBtnText}>Add pile</Text>
                  </Pressable>
                </View>

                {workingRows.map((r, idx) => (
                  <View key={r.pileId} style={styles.pileRow}>
                    <View style={styles.pileRowLeft}>
                      <Text style={styles.pileSeq}>{idx + 1}</Text>
                      <View>
                        <Text style={styles.pileCode}>{pileCodeFor(r.pileId)}</Text>
                        <Text style={styles.pileMeta}>
                          Rig {machineLabel(r.rigId)} · Crane {machineLabel(r.craneId)}
                        </Text>
                      </View>
                    </View>
                    {r.isRunning ? (
                      <View style={styles.lockedBadge}>
                        <Lock size={12} color={colors.textSecondary} />
                        <Text style={styles.lockedText}>In progress</Text>
                      </View>
                    ) : r.hasProgress ? (
                      <View style={styles.lockedBadge}>
                        <Lock size={12} color={colors.textSecondary} />
                        <Text style={styles.lockedText}>Started</Text>
                      </View>
                    ) : (
                      <Pressable onPress={() => removePile(r.pileId)} hitSlop={8} style={styles.removeBtn}>
                        <Trash2 size={16} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </GlassCard>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={handleSave}
                disabled={busy || workingRows.length === 0}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (busy || workingRows.length === 0) && styles.saveBtnDisabled,
                  pressed && !busy && styles.saveBtnPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>

      {reorderMachine && (
        <ReorderPilesOverlay
          visible
          onClose={() => setReorderMachineId(null)}
          machine={reorderMachine}
          piles={pilesForMachine(reorderMachine)}
          onReorder={handleReorder}
        />
      )}

      {pickerOpen && (
        <View style={styles.pickerOverlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Add a pile</Text>
              <Pressable onPress={closePicker} hitSlop={10}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {!pendingPile ? (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search pile code…"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.searchInput}
                />
                <ScrollView style={styles.pickerList}>
                  {searchResults.map((p) => (
                    <Pressable key={p.id} onPress={() => setPendingPile(p)} style={styles.pickerRow}>
                      <Text style={styles.pickerRowText}>{p.pileIdCode}</Text>
                      <Text style={styles.pickerRowMeta}>{p.dia}mm · {p.depth}m</Text>
                    </Pressable>
                  ))}
                  {searchResults.length === 0 && <Text style={styles.pickerEmpty}>No matching piles.</Text>}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.pickerSelectedLabel}>Pile {pendingPile.pileIdCode}</Text>
                <Text style={styles.pickerSubLabel}>Rig</Text>
                <View style={styles.chipRow}>
                  {rigs.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPendingRigId(m.id)}
                      style={[styles.machineChip, pendingRigId === m.id && styles.machineChipSelected]}
                    >
                      <Text style={styles.machineChipText}>{m.machineNo}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.pickerSubLabel}>Crane</Text>
                <View style={styles.chipRow}>
                  {cranes.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPendingCraneId(m.id)}
                      style={[styles.machineChip, pendingCraneId === m.id && styles.machineChipSelected]}
                    >
                      <Text style={styles.machineChipText}>{m.machineNo}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={confirmAddPile}
                  disabled={!pendingRigId || !pendingCraneId}
                  style={[styles.saveBtn, (!pendingRigId || !pendingCraneId) && styles.saveBtnDisabled]}
                >
                  <Text style={styles.saveBtnText}>Add to plan</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerSideBtn: {
    width: 32,
    alignItems: 'center',
  },
  pageTitle: {
    ...typography.pageTitle,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionPad: { padding: spacing.lg },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  machineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  machineChipSelected: {
    backgroundColor: colors.accent,
  },
  machineChipText: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { ...typography.caption, fontWeight: '700', color: colors.accent },
  pileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.06)',
  },
  pileRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  pileSeq: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.accent,
    width: 20,
  },
  pileCode: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  pileMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  lockedText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  saveBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: { ...typography.body, fontWeight: '700', color: colors.white },

  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 20,
    backgroundColor: 'rgba(10,10,20,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickerCard: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pickerTitle: { ...typography.h2, color: colors.textPrimary },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pickerList: { maxHeight: 700 },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.06)',
  },
  pickerRowText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  pickerRowMeta: { ...typography.caption, color: colors.textSecondary },
  pickerEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  pickerSelectedLabel: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  pickerSubLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 4 },
});
