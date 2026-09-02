// src/components/plan/actual/MeasurementFieldsModal.tsx
//
// One reusable, skippable popup for the fixed set of one-time per-physical-
// pile engineering measurements (E.G.L., Pile/Cage Contractor, Pile Length,
// Cage Weight, C.T.L., C.O.L., Bore Depth, Hook Length, F.L., Concrete Qty)
// — parameterized by which fields/labels/units to show (see
// pileMeasurementTriggers.ts for the five trigger points), rather than five
// near-duplicate modals. Mirrors RemarksModal's low-friction, skippable
// pattern: closing without saving (tapping the backdrop — no header X here,
// see showCloseButton={false} below) is always a valid outcome, never a
// hard gate on the actual-time entry that triggered it. Reached from
// PileStepsModal.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard, Platform } from 'react-native';
import { Check } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import type { PilContractor } from '@db/schema';
import type { PileMeasurementFields } from '@app-types/plan';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';

// Field-key pairs that render side-by-side in one row instead of stacked —
// explicit by key (not inferred from array order) so a future reordering in
// pileMeasurementTriggers.ts can't silently break the pairing. Only applies
// when both keys are actually present in the current field list.
const ROW_PAIRS: [string, string][] = [
  ['pileContractorId', 'cageContractorId'],
  ['ctlM', 'colM'],
];

function groupFieldsIntoRows(fields: MeasurementFieldConfig[]): MeasurementFieldConfig[][] {
  const consumed = new Set<string>();
  const rows: MeasurementFieldConfig[][] = [];
  for (const field of fields) {
    if (consumed.has(field.key)) continue;
    const pair = ROW_PAIRS.find(([a, b]) => a === field.key || b === field.key);
    const partnerKey = pair ? (pair[0] === field.key ? pair[1] : pair[0]) : undefined;
    const partner = partnerKey ? fields.find((f) => f.key === partnerKey) : undefined;
    if (partner) {
      rows.push([field, partner]);
      consumed.add(field.key);
      consumed.add(partner.key);
    } else {
      rows.push([field]);
      consumed.add(field.key);
    }
  }
  return rows;
}

/** Strips anything but digits, ".", and (when `allowNegative`) a single
 * leading "-", and collapses every "." after the first into nothing — so
 * "12.3.4" becomes "12.34" rather than parsing to NaN once a stray second
 * decimal point sneaks in. A "-" is only kept at position 0 — e.g. F.L.
 * (Founding Level), which is measured below a reference datum and so is
 * routinely negative. */
function cleanDecimalText(text: string, allowNegative: boolean): string {
  const isNegative = allowNegative && text.trimStart().startsWith('-');
  const digitsAndDot = text.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDot.indexOf('.');
  const cleaned = firstDot === -1 ? digitsAndDot : digitsAndDot.slice(0, firstDot + 1) + digitsAndDot.slice(firstDot + 1).replace(/\./g, '');
  return isNegative ? `-${cleaned}` : cleaned;
}

/** A plain numeric field, or a dropdown backed by the locally-synced
 * pil_contractors table. */
export type MeasurementFieldConfig =
  | {
      key: keyof PileMeasurementFields;
      label: string;
      unit: string;
      type: 'number';
      /** True for a value that's routinely negative, e.g. F.L. (Founding
       * Level) below a reference datum — allows a leading "-" and switches
       * the keyboard to one with a minus key. Defaults to false. */
      allowNegative?: boolean;
    }
  | { key: keyof PileMeasurementFields; label: string; type: 'contractor' };

interface Props {
  visible: boolean;
  title: string;
  fields: MeasurementFieldConfig[];
  /** Whatever's already recorded for this physical pile — pre-fills the
   * fields shown here so re-opening after a partial fill picks up where the
   * user left off. */
  initialValues: Partial<PileMeasurementFields> | null;
  contractors: PilContractor[];
  onClose: () => void;
  onSave: (patch: Partial<PileMeasurementFields>) => void | Promise<void>;
}

export default function MeasurementFieldsModal({
  visible,
  title,
  fields,
  initialValues,
  contractors,
  onClose,
  onSave,
}: Props) {
  const [values, setValues] = useState<Partial<PileMeasurementFields>>(initialValues ?? {});
  // Raw text per numeric field, kept independent of the parsed number —
  // deriving the TextInput's displayed value from Number(text) on every
  // render loses an in-progress trailing "." (Number("12.") === 12, and
  // String(12) === "12"), which made the decimal key look like it did
  // nothing. Only parsed to a number at save time.
  const [numberText, setNumberText] = useState<Record<string, string>>({});
  const [contractorPickerFor, setContractorPickerFor] = useState<keyof PileMeasurementFields | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValues(initialValues ?? {});
      setContractorPickerFor(null);
      const initialText: Record<string, string> = {};
      for (const field of fields) {
        if (field.type === 'number') {
          const v = (initialValues ?? {})[field.key] as number | null | undefined;
          initialText[field.key] = v == null ? '' : String(v);
        }
      }
      setNumberText(initialText);
    }
  }, [visible, initialValues, fields]);

  if (!visible) return null;

  const activeContractors = contractors.filter((c) => c.isActive);

  const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const patch: Partial<PileMeasurementFields> = { ...values };
      for (const field of fields) {
        if (field.type === 'number') {
          const text = numberText[field.key] ?? '';
          const incomplete = text === '' || text === '.' || text === '-' || text === '-.';
          const parsed = incomplete ? null : Number(text);
          (patch as Record<string, number | null>)[field.key] = parsed == null || Number.isNaN(parsed) ? null : parsed;
        }
      }
      await onSave(patch);
      onClose();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save these measurements. Please try again.', {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  };

  function renderField(field: MeasurementFieldConfig, inRow: boolean) {
    const wrapStyle = [styles.fieldWrap, inRow && styles.fieldWrapInRow];

    if (field.type === 'contractor') {
      const selectedId = values[field.key] as string | null | undefined;
      const selected = contractors.find((c) => c.id === selectedId);
      const isPicking = contractorPickerFor === field.key;

      return (
        <View key={field.key} style={wrapStyle}>
          <Text style={styles.label}>{field.label}</Text>
          <Pressable
            style={styles.contractorSelectRow}
            onPress={() => setContractorPickerFor(isPicking ? null : field.key)}
          >
            <Text
              style={selected ? styles.contractorSelectedText : styles.contractorPlaceholderText}
              numberOfLines={1}
            >
              {selected?.name ?? 'Not set — tap to choose'}
            </Text>
          </Pressable>
          {isPicking && (
            <View style={styles.contractorList}>
              {activeContractors.length === 0 && (
                <Text style={styles.emptyText}>No contractors synced for this site yet.</Text>
              )}
              {activeContractors.map((c) => {
                const active = c.id === selectedId;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.contractorRow, active && styles.contractorRowActive]}
                    onPress={() => {
                      setValues((v) => ({ ...v, [field.key]: c.id }));
                      setContractorPickerFor(null);
                    }}
                  >
                    <Text style={[styles.contractorRowText, active && styles.contractorRowTextActive]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {active && <Check size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      );
    }

    return (
      <View key={field.key} style={wrapStyle}>
        <Text style={styles.label}>
          {field.label} ({field.unit})
        </Text>
        <TextInput
          style={styles.input}
          // decimal-pad has no minus key on either platform — a field
          // that allows negative values needs a keyboard that does.
          keyboardType={
            field.allowNegative ? (Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric') : 'decimal-pad'
          }
          placeholder="—"
          placeholderTextColor={colors.textSecondary}
          value={numberText[field.key] ?? ''}
          onChangeText={(text) => {
            setNumberText((t) => ({ ...t, [field.key]: cleanDecimalText(text, !!field.allowNegative) }));
          }}
        />
      </View>
    );
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={title}
      position="bottom"
      subtitle=""
      showCloseButton={false}
    >
      <View style={styles.content}>
        {groupFieldsIntoRows(fields).map((row) => (
          <View
            key={row.map((f) => f.key).join('+')}
            style={row.length === 2 ? styles.fieldRow : undefined}
          >
            {row.map((field) => renderField(field, row.length === 2))}
          </View>
        ))}

        <Button label="Save Measurements" icon={Check} disabled={saving} onPress={handleSave} style={styles.saveBtn} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  fieldRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  // position:'relative' anchors the floating contractorList dropdown below
  // whichever field opened it (see contractorList below).
  fieldWrap: { marginBottom: spacing.md, position: 'relative' },
  fieldWrapInRow: { flex: 1, marginBottom: 0 },
  label: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  contractorSelectRow: {
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  contractorSelectedText: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  contractorPlaceholderText: { ...typography.body, color: colors.textSecondary },
  // Floats over whatever's below instead of pushing it down — absolute
  // relative to fieldWrap/fieldWrapInRow's position:'relative' above, right
  // under the select row (fieldWrap's own height, with this removed from
  // flow, is just the label+select row).
  contractorList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.white,
    zIndex: 30,
    ...shadow.soft,
    elevation: 8,
  },
  contractorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contractorRowActive: { backgroundColor: colors.accentSoft },
  contractorRowText: { ...typography.body, color: colors.textPrimary },
  contractorRowTextActive: { color: colors.accent, fontWeight: '700' },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', padding: spacing.md },
  saveBtn: { marginTop: spacing.sm },
});
