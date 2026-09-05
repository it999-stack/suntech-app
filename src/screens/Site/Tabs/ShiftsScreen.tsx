// src/screens/Site/Tabs/ShiftsScreen.tsx
// Read-only display of shifts synced from server, with each shift's
// non-working windows shown inline — mirrors StepsScreen's card design.

import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Clock } from 'lucide-react-native';

import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { formatMinutes12 } from '@utils/formatTime';
import { useSiteSettings } from '@state/SiteSettingsContext';
import { shiftDurationMinutes, type Shift, type NonWorkingWindow } from '@app-types/siteSettings';

const BEHAVIOR_META = {
  AFTER_CURRENT_STEP: { label: 'AFTER STEP', color: colors.accent, soft: colors.accentSoft },
  FIXED: { label: 'FIXED', color: colors.textSecondary, soft: 'rgba(28,28,46,0.06)' },
} as const;

function ShiftCard({ shift, windows }: { shift: Shift; windows: NonWorkingWindow[] }) {
  return (
    <GlassCard innerStyle={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Clock color={colors.accent} size={16} strokeWidth={2} />
        </View>
        <Text style={styles.shiftName} numberOfLines={1}>
          {shift.name}
        </Text>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>
            {formatMinutes12(shift.startMinutes)} – {formatMinutes12(shift.endMinutes)}
          </Text>
        </View>
      </View>

      <View style={styles.windowList}>
        {windows.length === 0 ? (
          <Text style={styles.emptyWindowText}>No non-working windows configured.</Text>
        ) : (
          windows.map((w, idx) => {
            const meta = BEHAVIOR_META[w.behavior as keyof typeof BEHAVIOR_META] ?? BEHAVIOR_META.FIXED;
            return (
              <View
                key={w.id}
                style={[styles.windowRow, idx !== windows.length - 1 && styles.windowRowDivider]}
              >
                <View style={styles.windowLeft}>
                  <Text style={styles.windowLabel} numberOfLines={1}>
                    {w.label}
                  </Text>
                  <View style={[styles.behaviorBadge, { backgroundColor: meta.soft }]}>
                    <Text style={[styles.behaviorText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.windowTime}>
                  {formatMinutes12(w.startMinutes)} – {formatMinutes12(w.endMinutes)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </GlassCard>
  );
}

export default function ShiftsScreen() {
  const { shifts, windowsForShift } = useSiteSettings();

  const coveredHrs = Math.round(
    (shifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0) / 60) * 10
  ) / 10;

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Shifts</Text>
          <Text style={styles.pageSubtitle}>
            {shifts.length} shift{shifts.length === 1 ? '' : 's'} · {coveredHrs} of 24 hrs covered
          </Text>
        </View>

        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ShiftCard shift={item} windows={windowsForShift(item.id)} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No shifts configured. Contact your administrator.</Text>
          }
        />
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
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  timeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    flexShrink: 0,
  },
  timeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
    color: colors.accent,
  },

  windowList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  windowRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  windowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  windowLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  behaviorBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  behaviorText: {
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.4,
  },
  windowTime: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  emptyWindowText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
  },

  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xxxl,
  },
});
