// src/components/shared/AppCalendar.tsx
//
// Generic month-grid calendar. Knows nothing about plans, checklists, or any
// specific screen — callers classify every date via `getDayState`, and this
// component only renders that classification. Reusable as-is by Generate
// Plan, Plan History, Reports, or any future date-driven screen.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { colors, spacing, radius, typography } from '@theme/theme';

export type DayTone = 'default' | 'primary' | 'muted' | 'warning';

export type DayVisualState = {
  /** Cannot be tapped/selected at all. */
  disabled?: boolean;
  /** Currently the selected date. */
  selected?: boolean;
  /** Generic visual weight — this component defines the palette, the caller
   *  decides what each level means for its own screen. */
  tone?: DayTone;
  /** Optional small badge/dot rendered in the corner of the day cell. */
  marker?: React.ReactNode;
  /** Optional accessible label override (e.g. "Locked", "Planned"). */
  a11yLabel?: string;
};

export interface AppCalendarProps {
  selectedDate?: string;
  onSelectDate: (dateStr: string) => void;
  /** Classify every visible date. Called once per rendered cell. */
  getDayState: (dateStr: string) => DayVisualState;
  /** "YYYY-MM-DD" — which month to open on. Defaults to selectedDate or today. */
  initialMonth?: string;
  legend?: { tone: DayTone; label: string }[];
}

function toneColors(tone: DayTone | undefined): { bg: string; fg: string } {
  switch (tone) {
    case 'primary': return { bg: colors.accentSoft, fg: colors.accent };
    case 'warning': return { bg: colors.warningSoft, fg: colors.warning };
    case 'muted':   return { bg: 'rgba(28,28,46,0.05)', fg: colors.textSecondary };
    default:        return { bg: colors.transparent, fg: colors.textPrimary };
  }
}

export default function AppCalendar({
  selectedDate,
  onSelectDate,
  getDayState,
  initialMonth,
  legend,
}: AppCalendarProps) {
  return (
    <View>
      <Calendar
        current={initialMonth ?? selectedDate}
        hideExtraDays
        enableSwipeMonths
        dayComponent={({ date }: { date?: DateData }) => {
          if (!date) return <View style={styles.dayCell} />;
          const dateStr = date.dateString;
          const dayState = getDayState(dateStr);
          const isSelected = dayState.selected ?? dateStr === selectedDate;
          const { bg, fg } = toneColors(dayState.tone);

          return (
            <Pressable
              disabled={dayState.disabled}
              onPress={() => onSelectDate(dateStr)}
              accessibilityLabel={dayState.a11yLabel}
              accessibilityState={{ disabled: !!dayState.disabled, selected: isSelected }}
              style={styles.dayCell}
            >
              <View
                style={[
                  styles.dayCircle,
                  { backgroundColor: isSelected ? colors.accent : bg },
                  dayState.disabled && styles.dayCircleDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: isSelected ? colors.textInverse : fg },
                    dayState.disabled && styles.dayTextDisabled,
                  ]}
                >
                  {date.day}
                </Text>
              </View>
              {dayState.marker && <View style={styles.marker}>{dayState.marker}</View>}
            </Pressable>
          );
        }}
        theme={{
          textMonthFontWeight: '700',
          textMonthFontSize: 16,
          monthTextColor: colors.textPrimary,
          arrowColor: colors.accent,
          textDayHeaderFontSize: 12,
          textDayHeaderFontWeight: '600',
          textSectionTitleColor: colors.textSecondary,
          calendarBackground: colors.transparent,
        }}
        style={styles.calendar}
      />

      {legend && legend.length > 0 && (
        <View style={styles.legendRow}>
          {legend.map((item) => {
            const { bg, fg } = toneColors(item.tone);
            return (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.tone === 'default' ? colors.accent : fg }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const DAY_SIZE = 36;

const styles = StyleSheet.create({
  calendar: {
    borderRadius: radius.lg,
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDisabled: {
    opacity: 0.4,
  },
  dayText: {
    ...typography.body,
    fontWeight: '600',
  },
  dayTextDisabled: {
    color: colors.textSecondary,
  },
  marker: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
