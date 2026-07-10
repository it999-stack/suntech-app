// src/components/shared/TimeStepper.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Keyboard } from 'react-native';
import GlassCard from './GlassCard';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { formatMinutes } from '../../utils/formatTime';

interface Props {
  /** Minutes since midnight, e.g. 420 = 07:00 */
  minutes: number;
  onChange: (minutes: number) => void;
  /** Step size in minutes per tap. Defaults to 30. */
  step?: number;
  /** Eyebrow label above the time. Defaults to "Start Time" to preserve existing usages. */
  label?: string;
  /** Minimum allowed value in minutes since midnight (inclusive). */
  min?: number;
  /** Maximum allowed value in minutes since midnight (inclusive). */
  max?: number;
}

/** Parse "HH:MM" or "HHMM" into minutes since midnight. Returns null if invalid. */
function parseInput(raw: string): number | null {
  const s = raw.trim();
  const match = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export default function TimeStepper({
  minutes,
  onChange,
  step = 30,
  label = 'Start Time',
  min,
  max,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const canDec = min === undefined || minutes - step >= min;
  const canInc = max === undefined || minutes + step <= max;

  function commitDraft(raw: string) {
    const parsed = parseInput(raw);
    if (parsed !== null) {
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(clamped, min);
      if (max !== undefined) clamped = Math.min(clamped, max);
      onChange(clamped);
    }
    setEditing(false);
    setDraft('');
    Keyboard.dismiss();
  }

  function handleTimePress() {
    setDraft(formatMinutes(minutes));
    setEditing(true);
  }

  return (
    <GlassCard innerStyle={styles.pad}>
      <Text style={styles.eyebrow}>{label}</Text>

      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [
            styles.stepBtn,
            pressed && canDec && styles.stepBtnPressed,
            !canDec && styles.stepBtnDisabled,
          ]}
          onPress={() => canDec && onChange(minutes - step)}
          hitSlop={10}
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          disabled={!canDec}
        >
          <Text style={[styles.stepGlyph, !canDec && styles.stepGlyphDisabled]}>−</Text>
        </Pressable>

        {editing ? (
          <TextInput
            style={styles.timeInput}
            value={draft}
            onChangeText={setDraft}
            keyboardType="numeric"
            autoFocus
            maxLength={5}
            placeholder="HH:MM"
            placeholderTextColor={colors.textSecondary}
            onBlur={() => commitDraft(draft)}
            onSubmitEditing={() => commitDraft(draft)}
            selectTextOnFocus
          />
        ) : (
          <Pressable
            onPress={handleTimePress}
            style={styles.timeWrap}
            accessibilityLabel="Tap to type time"
          >
            <Text style={styles.time}>{formatMinutes(minutes)}</Text>
            <View style={styles.underline} />
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.stepBtn,
            pressed && canInc && styles.stepBtnPressed,
            !canInc && styles.stepBtnDisabled,
          ]}
          onPress={() => canInc && onChange(minutes + step)}
          hitSlop={10}
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          disabled={!canInc}
        >
          <Text style={[styles.stepGlyph, !canInc && styles.stepGlyphDisabled]}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.sub}>24-HOUR FORMAT · {step} MIN STEPS</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm + 2,
  },
  stepBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: colors.glassShadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stepBtnPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.85,
  },
  stepBtnDisabled: {
    opacity: 0.3,
  },
  stepGlyph: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    marginTop: -2,
  },
  stepGlyphDisabled: {
    color: colors.textSecondary,
  },
  timeWrap: {
    minWidth: 140,
    alignItems: 'center',
  },
  time: {
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  underline: {
    marginTop: 3,
    height: 2,
    width: 100,
    borderRadius: 1,
    backgroundColor: 'rgba(107,107,128,0.25)',
  },
  timeInput: {
    minWidth: 140,
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  sub: {
    marginTop: spacing.sm,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textSecondary,
  },
});
