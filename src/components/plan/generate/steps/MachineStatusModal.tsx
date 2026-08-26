// src/components/plan/generate/steps/MachineStatusModal.tsx
//
// Direct status editor for one machine, opened from its status chip in
// MachineSelectStep. Unlike MachineDownModal/MachineIdleModal (which log a
// BREAKDOWN/RESUMED/IDLE_START/IDLE_END *event* against a specific pile+
// step), there's no checklist yet during plan generation, so this writes
// the machine's status directly via updateMachineStatus — a plain admin-
// style edit, not an event log, hence no notes/time fields.

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { CheckCircle2, Coffee, AlertTriangle, PowerOff, type LucideIcon } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import TileGroup, { type TileGroupOption } from '@components/shared/TileGroup';
import SaveEventButton from '@components/plan/actual/machineEvents/SaveEventButton';
import { colors, spacing } from '@theme/theme';
import { STATUS_META, type MachineStatus } from '@utils/helpers';
import { updateMachineStatus } from '@repositories/machinesRepository';
import { notify } from '@utils/notify';

const STATUS_ICON: Record<MachineStatus, LucideIcon> = {
  ACTIVE: CheckCircle2,
  IDLE: Coffee,
  BREAKDOWN: AlertTriangle,
  INACTIVE: PowerOff,
};

const STATUS_ORDER: MachineStatus[] = ['ACTIVE', 'IDLE', 'BREAKDOWN', 'INACTIVE'];

interface Props {
  visible: boolean;
  machineId: string;
  machineLabel: string;
  currentStatus: MachineStatus;
  onClose: () => void;
  onStatusChanged: (machineId: string, status: MachineStatus) => void;
}

export default function MachineStatusModal({
  visible,
  machineId,
  machineLabel,
  currentStatus,
  onClose,
  onStatusChanged,
}: Props) {
  const [status, setStatus] = useState<MachineStatus>(currentStatus);
  const [saving, setSaving] = useState(false);

  const options: TileGroupOption[] = STATUS_ORDER.map((s) => {
    const meta = STATUS_META[s];
    return { id: s, label: meta.label, icon: STATUS_ICON[s], color: meta.color, soft: meta.soft };
  });

  async function handleSave() {
    setSaving(true);
    try {
      await updateMachineStatus(machineId, status);
      onStatusChanged(machineId, status);
      onClose();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not update machine status. Please try again.', {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal visible={visible} onClose={onClose} title={machineLabel} subtitle="Machine status" position="center">
      <View style={styles.page}>
        <View style={styles.divider} />
        <TileGroup options={options} valueId={status} onSelect={(id) => setStatus(id as MachineStatus)} columns={2} />
        <SaveEventButton
          saving={saving}
          canSave={status !== currentStatus && !saving}
          onPress={handleSave}
          label="Update status"
        />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: {},
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
});
