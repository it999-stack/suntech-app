// src/screens/PlanHistoryScreen.tsx
//
// Shows all daily checklists for this site, most-recent first, loaded from SQLite.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react-native';
import GlassCard from '../../components/shared/GlassCard';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { HomeStackParamList } from '../../types/navigation';
import { useAuthStore } from '../../store/authStore';
import { getChecklistsBySite, getChecklistPiles } from '../../repositories/checklistRepository';
import { deletePlanStepsForChecklist, deleteActualStepsForChecklist } from '../../repositories/planRepository';
import { initDb } from '../../db/client';
import { pilingDailyChecklists, pilingChecklistPiles } from '../../db/schema';
import { eq } from 'drizzle-orm';
import type { PilingDailyChecklist } from '../../db/schema';

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'PlanHistory'>;

type ChecklistStatus = 'completed' | 'in_progress' | 'planned' | 'upcoming';

type ChecklistSummary = {
  id: string;
  date: string;            // ISO date "YYYY-MM-DD"
  displayDate: string;     // human-readable
  pileCount: number;
  status: ChecklistStatus;
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
  const today = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dbStatusToDisplay(status: PilingDailyChecklist['status'], date: string): ChecklistStatus {
  const today = toLocalDateStr(new Date());
  if (date > today) return 'upcoming';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'IN_PROGRESS') return 'in_progress';
  return 'planned';
}

function statusConfig(status: ChecklistStatus) {
  if (status === 'completed')  return { bg: colors.successSoft,         fg: colors.success,       label: 'Completed'   };
  if (status === 'in_progress') return { bg: colors.accentSoft,          fg: colors.accent,        label: 'In Progress' };
  if (status === 'upcoming')    return { bg: 'rgba(28,28,46,0.06)',       fg: colors.textSecondary, label: 'Upcoming'    };
  return                               { bg: 'rgba(255,149,0,0.10)',      fg: colors.warning,       label: 'Planned'     };
}

export default function PlanHistoryScreen() {
  const navigation = useNavigation<HomeNav>();
  const user = useAuthStore((s) => s.user);

  const [summaries, setSummaries] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadSummaries() {
    if (!user?.siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const checklists = await getChecklistsBySite(user.siteId!);
      const withCounts = await Promise.all(
        checklists.map(async (cl) => {
          const cp = await getChecklistPiles(cl.id);
          return {
            id: cl.id,
            date: cl.date,
            displayDate: formatDisplayDate(cl.date),
            pileCount: cp.length,
            status: dbStatusToDisplay(cl.status, cl.date),
          } as ChecklistSummary;
        }),
      );
      setSummaries(withCounts.sort((a, b) => b.date.localeCompare(a.date)));
    } finally {
      setLoading(false);
    }
  }

  // DEV ONLY — delete a checklist and all its related data
  async function handleDeleteChecklist(checklistId: string, displayDate: string) {
    Alert.alert(
      '[DEV] Delete Plan',
      `Delete the plan for "${displayDate}" and all its steps?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(checklistId);
            try {
              const db = await initDb();
              // Delete in order: actual steps → plan steps → checklist piles → checklist
              await deleteActualStepsForChecklist(checklistId);
              await deletePlanStepsForChecklist(checklistId);
              await db.delete(pilingChecklistPiles).where(eq(pilingChecklistPiles.checklistId, checklistId));
              await db.delete(pilingDailyChecklists).where(eq(pilingDailyChecklists.id, checklistId));
              setSummaries((prev) => prev.filter((s) => s.id !== checklistId));
            } catch (err) {
              console.error('[DEV] Failed to delete checklist:', err);
              Alert.alert('Error', 'Failed to delete. Check console.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }

  useEffect(() => {
    loadSummaries();
  }, [user?.siteId]);


  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
            <ChevronLeft size={22} color={colors.accent} />
          </Pressable>
          <Text style={styles.pageTitle}>Plan History</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading plans…</Text>
          </View>
        ) : summaries.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No plans found for this site yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {summaries.map((cl) => {
              const st = statusConfig(cl.status);
              return (
                <Pressable
                  key={cl.id}
                  onPress={() => navigation.navigate('PlanDetail', { checklistId: cl.id })}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <GlassCard innerStyle={styles.cardInner}>
                    <View style={styles.rowLeft}>
                      <View style={styles.iconWrap}>
                        <Calendar size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dateText}>{cl.displayDate}</Text>
                        <Text style={styles.subText}>{cl.pileCount} pile{cl.pileCount === 1 ? '' : 's'} planned</Text>
                      </View>
                    </View>
                    <View style={styles.rowRight}>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: st.fg }]}>{st.label}</Text>
                      </View>
                      {/* DEV ONLY — remove before release */}
                      <Pressable
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteChecklist(cl.id, cl.displayDate);
                        }}
                        style={styles.deleteBtn}
                        disabled={deletingId === cl.id}
                      >
                        {deletingId === cl.id
                          ? <ActivityIndicator size={14} color={colors.danger} />
                          : <Trash2 size={16} color={colors.danger} />
                        }
                      </Pressable>
                      <ChevronRight size={18} color={colors.textSecondary} />
                    </View>
                  </GlassCard>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  cardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  subText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});