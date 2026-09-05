// src/screens/Piles/components/FiltersSheet.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@theme/theme';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import Checkbox from '@components/shared/Checkbox';
import Radio from '@components/shared/Radio';
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
  function selectStatus(status: PileStatus): void {
    onChangeDraft({ ...draft, statuses: [status] });
  }
  function clearAll(): void {
    onChangeDraft({ areaIds: [], statuses: [] });
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      title="Filters"
      position="bottom"
      showCloseButton={false}
      // Occupies the header's trailing slot — free here because the close
      // button is hidden, so this sits inline with the title instead of
      // taking a row of its own above the first section.
      headerRight={
        <Pressable onPress={clearAll} hitSlop={spacing.sm} style={styles.clearAllBtn}>
          <Text style={styles.clearAll}>Clear All</Text>
        </Pressable>
      }
    >
      <SectionTitle first>Area</SectionTitle>
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

/** `first` drops the top margin — the leading section sits directly under the
 * modal header, which already supplies its own spacing below the title. */
function SectionTitle({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <Text style={[styles.sectionTitle, first && styles.sectionTitleFirst]}>{children}</Text>;
}

function CheckboxRow({
  label, checked, onPress,
}: { label: string; checked: boolean; onPress: () => void; }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <Checkbox checked={checked} />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function RadioRow({
  label, checked, onPress,
}: { label: string; checked: boolean; onPress: () => void; }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <Radio checked={checked} />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // AppModal's header row aligns its children to flex-start; centring this
  // against the taller title text keeps the two visually on one line.
  clearAllBtn: { alignSelf: 'center' },
  clearAll: { ...typography.caption, color: colors.danger, fontWeight: '700' },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitleFirst: { marginTop: 0 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  checkboxLabel: { ...typography.body, color: colors.textPrimary },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  cancelBtn: { flex: 1 },
  applyBtn: { flex: 2 },
});
