// src/components/shared/WorkingDateSheet.tsx
//
// TESTING ONLY: lets a tester override the app's working date (see
// src/store/workingDateStore.ts) so Home, Generate Plan, Fill Actuals, and
// the active-plan background sync all operate on a picked date instead of
// device-today — the only way to reach a non-today/tomorrow plan's Fill
// Actuals screen. Reachable from Home's gear icon.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppModal from '@components/shared/AppModal';
import AppCalendar, { type DayVisualState } from '@components/shared/AppCalendar';
import Switch from '@components/shared/Switch';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useWorkingDateStore } from '@store/workingDateStore';
import { toLocalDateStr, formatHeaderDate } from '@utils/formatTime';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function WorkingDateSheet({ visible, onClose }: Props) {
  const overrideEnabled = useWorkingDateStore((s) => s.overrideEnabled);
  const overrideDate = useWorkingDateStore((s) => s.overrideDate);
  const setOverride = useWorkingDateStore((s) => s.setOverride);

  const today = useMemo(() => toLocalDateStr(new Date()), [visible]);
  const selectedDate = overrideDate ?? today;

  function getDayState(dateStr: string): DayVisualState {
    return { selected: dateStr === selectedDate, tone: 'default' };
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      position="center"
      title="Working Date"
      subtitle="Testing only — pick the date the app should operate on"
    >
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Testing Mode</Text>
          <Text style={styles.rowSub}>
            Overrides the working date app-wide until you turn this off.
          </Text>
        </View>
        <Switch value={overrideEnabled} onValueChange={(v) => void setOverride(v, overrideDate ?? today)} />
      </View>

      {overrideEnabled && (
        <>
          <AppCalendar
            selectedDate={selectedDate}
            onSelectDate={(d) => void setOverride(true, d)}
            getDayState={getDayState}
            initialMonth={selectedDate}
          />
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              The app will treat <Text style={styles.hintBold}>{formatHeaderDate(selectedDate, { includeYear: true })}</Text> as
              the working date — Home, Generate Plan, and Fill Actuals will all operate on it — until you
              turn Testing Mode off.
            </Text>
          </View>
        </>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  rowSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  hintCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  hintText: { ...typography.caption, color: colors.textSecondary },
  hintBold: { fontWeight: '700', color: colors.textPrimary },
});
