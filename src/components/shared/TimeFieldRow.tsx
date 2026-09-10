// src/components/shared/TimeFieldRow.tsx
//
// A labelled time value inside a bordered card — the shape used wherever a
// screen shows "Plan start / Plan finish"-style times, some read-only and some
// tappable to change.
//
// Extracted because the distinction that matters is easy to lose when each
// screen rolls its own: a row the user can CHANGE has to look different from
// one that merely reports a time. A plain bordered box with placeholder text
// reads as neither — it looks like a disabled input rather than a control.
// Here, an editable row gets the accent-tinted clock, a darker value and a
// pencil; a read-only one stays muted and isn't pressable at all.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Clock, Pencil } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface RowProps {
  label: string;
  /** Already-formatted time text, e.g. "9 Sep, 4:15AM". */
  value?: string;
  /** Shown in place of `value` when nothing is set yet. Muted and italic, so
   * an empty required field is visibly empty rather than looking like a time
   * that happens to read oddly. */
  placeholder?: string;
  /** Omit for a read-only row: no pencil, no press target, muted styling. */
  onPress?: () => void;
  /** Drops the bottom divider — set on the last row of a group. */
  isLast?: boolean;
}

export function TimeFieldRow({ label, value, placeholder, onPress, isLast }: RowProps) {
  const editable = !!onPress;
  const hasValue = !!value;

  const content = (
    <>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: editable ? colors.accentSoft : 'rgba(28,28,46,0.06)' },
        ]}
      >
        <Clock size={16} color={editable ? colors.accent : colors.textSecondary} />
      </View>

      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text
          style={[
            styles.value,
            hasValue && styles.valueSet,
            !hasValue && styles.valuePlaceholder,
          ]}
        >
          {value ?? placeholder ?? '—'}
        </Text>
      </View>

      {/* Only on an editable row — the affordance IS the signal that this can
          be changed, so putting it on a read-only row would misreport. */}
      {editable && <Pencil size={13} color={colors.accent} />}
    </>
  );

  if (!editable) {
    return <View style={[styles.row, isLast && styles.rowLast]}>{content}</View>;
  }
  return (
    <Pressable
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${hasValue ? `, ${value}` : ', not set'}`}
    >
      {content}
    </Pressable>
  );
}

/** The bordered card TimeFieldRows sit in. Separate from the row so a caller
 * can put several rows in one card and get the dividers between them. */
export function TimeFieldGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  valueSet: { color: colors.textPrimary },
  valuePlaceholder: { fontWeight: '500', fontStyle: 'italic' },
});
