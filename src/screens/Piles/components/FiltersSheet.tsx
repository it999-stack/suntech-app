// src/screens/Piles/components/FiltersSheet.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, spacing, typography } from '@theme/theme';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import type { PileStatus } from '@repositories/pilesRepository';
import { STATUS_META, type PilesFiltersState } from './types';

export interface AreaOption {
  id: string;
  name: string;
  count: number;
}

interface FiltersSheetProps {
  visible: boolean;
  onCancel: () => void;
  draft: PilesFiltersState;
  onChangeDraft: (next: PilesFiltersState) => void;
  onApply: () => void;
  areaOptions: AreaOption[];
}

const STATUS_OPTIONS: PileStatus[] = ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED'];

export default function FiltersSheet({ visible, onCancel, draft, onChangeDraft, onApply, areaOptions }: FiltersSheetProps) {
  function toggleArea(id: string): void {
    const areaIds = draft.areaIds.includes(id) ? draft.areaIds.filter((a) => a !== id) : [...draft.areaIds, id];
    onChangeDraft({ ...draft, areaIds });
  }
  // Radio-button style, matching StatsGrid's stat tiles — selecting a status
  // replaces whatever was selected; tapping the already-selected one is a
  // no-op (it stays selected rather than toggling off). Clear All is the
  // only way back to no status filter.
  function selectStatus(status: PileStatus): void {
    onChangeDraft({ ...draft, statuses: [status] });
  }
  function clearAll(): void {
    onChangeDraft({ areaIds: [], statuses: [] });
  }

  return (
    <AppModal visible={visible} onClose={onCancel} title="Filters" position="bottom">
      <View style={styles.headerRow}>
        <Pressable onPress={clearAll} hitSlop={spacing.sm}>
          <Text style={styles.clearAll}>Clear All</Text>
        </Pressable>
      </View>

      <SectionTitle>Area</SectionTitle>
      {areaOptions.map((opt) => (
        <CheckboxRow
          key={opt.id}
          label={`${opt.name} (${opt.count})`}
          checked={draft.areaIds.includes(opt.id)}
          onPress={() => toggleArea(opt.id)}
        />
      ))}

      <SectionTitle>Status</SectionTitle>
      {STATUS_OPTIONS.map((status) => (
        <RadioRow
          key={status}
          label={STATUS_META[status].label}
          checked={draft.statuses.includes(status)}
          onPress={() => selectStatus(status)}
        />
      ))}

      <View style={styles.footerRow}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.cancelBtn} />
        <Button label="Apply Filters" onPress={onApply} style={styles.applyBtn} />
      </View>
    </AppModal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function CheckboxRow({
  label, checked, onPress,
}: { label: string; checked: boolean; onPress: () => void; }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Check size={12} color={colors.white} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function RadioRow({
  label, checked, onPress,
}: { label: string; checked: boolean; onPress: () => void; }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <View style={[styles.radio, checked && styles.radioChecked]}>
        {checked && <View style={styles.radioDot} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const CHECKBOX_SIZE = 18;

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.xs },
  clearAll: { ...typography.caption, color: colors.danger, fontWeight: '700' },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  checkbox: {
    width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderRadius: 5, borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxLabel: { ...typography.body, color: colors.textPrimary },
  radio: {
    width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderRadius: CHECKBOX_SIZE / 2, borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  radioChecked: { borderColor: colors.accent },
  radioDot: { width: 11, height: 11, borderRadius: 20, backgroundColor: colors.accent },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  cancelBtn: { flex: 1 },
  applyBtn: { flex: 2 },
});
