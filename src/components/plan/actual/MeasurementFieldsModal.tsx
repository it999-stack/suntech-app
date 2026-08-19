// src/components/plan/actual/MeasurementFieldsModal.tsx
//
// One reusable, skippable popup for the fixed set of one-time per-physical-
// pile engineering measurements (E.G.L., Pile/Cage Contractor, Pile Length,
// Cage Weight, C.T.L., C.O.L., Bore Depth, Hook Length, F.L., Concrete Qty)
// — parameterized by which fields/labels/units to show (see
// pileMeasurementTriggers.ts for the five trigger points), rather than five
// near-duplicate modals. Mirrors RemarksModal's low-friction, skippable
// pattern: closing without saving (the header X, or the backdrop) is always
// a valid outcome, never a hard gate on the actual-time entry that
// triggered it. Reached from PileStepsModal.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Check } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import type { PilContractor } from '@db/schema';
import type { PileMeasurementFields } from '@app-types/plan';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography } from '@theme/theme';

/** Strips anything but digits and ".", and collapses every "." after the
 * first into nothing — so "12.3.4" becomes "12.34" rather than parsing to
 * NaN once a stray second decimal point sneaks in. */
function cleanDecimalText(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

/** A plain numeric field, or a dropdown backed by the locally-synced
 * pil_contractors table. */
export type MeasurementFieldConfig =
  | { key: keyof PileMeasurementFields; label: string; unit: string; type: 'number' }
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
          const parsed = text === '' || text === '.' ? null : Number(text);
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

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Optional — skip any field you don't have yet"
    >
      <View style={styles.content}>
        {fields.map((field) => {
          if (field.type === 'contractor') {
            const selectedId = values[field.key] as string | null | undefined;
            const selected = contractors.find((c) => c.id === selectedId);
            const isPicking = contractorPickerFor === field.key;

            return (
              <View key={field.key} style={styles.fieldWrap}>
                <Text style={styles.label}>{field.label}</Text>
                <Pressable
                  style={styles.contractorSelectRow}
                  onPress={() => setContractorPickerFor(isPicking ? null : field.key)}
                >
                  <Text style={selected ? styles.contractorSelectedText : styles.contractorPlaceholderText}>
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
                          <Text style={[styles.contractorRowText, active && styles.contractorRowTextActive]}>
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
            <View key={field.key} style={styles.fieldWrap}>
              <Text style={styles.label}>
                {field.label} ({field.unit})
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.textSecondary}
                value={numberText[field.key] ?? ''}
                onChangeText={(text) => {
                  setNumberText((t) => ({ ...t, [field.key]: cleanDecimalText(text) }));
                }}
              />
            </View>
          );
        })}

        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} disabled={saving} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Measurements</Text>
        </Pressable>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  fieldWrap: { marginBottom: spacing.md },
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
  contractorList: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
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
  saveBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
