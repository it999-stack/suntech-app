// src/screens/Profile/site-settings/StepDetailScreen.tsx
// Shows duration templates for a single piling step.
// Tap "+ Add" → AppModal with synced dia/depth chips + duration inputs.
// Templates are stored with dimension_id (FK) — no redundant dia/depth columns.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Clock } from 'lucide-react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { colors, spacing, radius, typography } from '@/theme/theme';
import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import {
  getTemplatesWithDimensions,
  insertTemplate,
  deleteTemplate,
} from '@repositories/stepsRepository';
import type { TemplateWithDimension } from '@repositories/stepsRepository';
import { getDimensionsBySite } from '@repositories/dimensionsRepository';
import { useAuthStore } from '@/store/authStore';
import type { PilingDimension } from '@/db/schema';
import type { ProfileStackParamList } from '@/types/navigation';

type Route = RouteProp<ProfileStackParamList, 'StepDetail'>;

// ── Labeled text input ────────────────────────────────────────────────────────

function LabeledInput({
  label,
  placeholder,
  value,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
        returnKeyType="done"
      />
    </View>
  );
}

// ── Add-template modal ────────────────────────────────────────────────────────

function AddTemplateModal({
  visible,
  stepId,
  siteId,
  existingTemplates,
  onClose,
  onSaved,
}: {
  visible: boolean;
  stepId: string;
  siteId: string | undefined;
  existingTemplates: TemplateWithDimension[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dimensions, setDimensions]   = useState<PilingDimension[]>([]);
  const [dimsLoading, setDimsLoading] = useState(true);
  const [selectedDimId, setSelectedDimId] = useState<string | null>(null);
  const [duration, setDuration] = useState('');
  const [buffer, setBuffer]     = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDimsLoading(true);
    getDimensionsBySite(siteId ?? '')
      .then(setDimensions)
      .catch(console.error)
      .finally(() => setDimsLoading(false));
    setSelectedDimId(null);
    setDuration('');
    setBuffer('');
  }, [visible, siteId]);

  // dimension IDs that already have a template for this step
  const usedDimIds = new Set(existingTemplates.map((t) => t.dimensionId));

  const selectedDim = dimensions.find((d) => d.id === selectedDimId) ?? null;

  async function handleSave() {
    if (!selectedDim) {
      Alert.alert('Select a combination', 'Please choose a Dia / Depth combination first.');
      return;
    }
    const dur = parseInt(duration, 10);
    const buf = parseInt(buffer || '0', 10);
    if (!dur || dur <= 0) {
      Alert.alert('Missing duration', 'Enter a duration in minutes.');
      return;
    }

    setSaving(true);
    try {
      await insertTemplate({
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        stepId,
        dimensionId: selectedDim.id,
        durationMinutes: dur,
        bufferBeforeMinutes: isNaN(buf) ? 0 : buf,
      });
      onSaved();
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save template.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Add Duration Template"
      subtitle="Choose a dia / depth combo, then enter timing"
    >
      <View style={styles.modalBody}>
        {/* ── Dia/Depth chips ─────────────────────────────────────── */}
        <View>
          <Text style={styles.sectionLabel}>Dia / Depth combination</Text>
          {dimsLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
          ) : dimensions.length === 0 ? (
            <Text style={styles.noDimsText}>
              No dimensions synced yet. Run a sync from the Profile tab first.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {dimensions.map((dim) => {
                const isUsed     = usedDimIds.has(dim.id);
                const isSelected = dim.id === selectedDimId;
                return (
                  <Pressable
                    key={dim.id}
                    style={[
                      styles.chip,
                      isSelected && styles.chipSelected,
                      isUsed && !isSelected && styles.chipUsed,
                    ]}
                    onPress={() => setSelectedDimId(isSelected ? null : dim.id)}
                    disabled={isUsed}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                        isUsed && !isSelected && styles.chipTextUsed,
                      ]}
                    >
                      {dim.dia} / {dim.depth} m
                    </Text>
                    {isUsed && <Text style={styles.chipUsedBadge}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Duration + Buffer ───────────────────────────────────── */}
        <View style={styles.row2}>
          <View style={styles.flex1}>
            <LabeledInput
              label="Duration (min)"
              placeholder="e.g. 90"
              value={duration}
              onChangeText={setDuration}
            />
          </View>
          <View style={styles.flex1}>
            <LabeledInput
              label="Buffer before (min)"
              placeholder="e.g. 0"
              value={buffer}
              onChangeText={setBuffer}
            />
          </View>
        </View>

        {/* ── Save ────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.saveBtn, (saving || !selectedDim) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !selectedDim}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Template</Text>
          )}
        </Pressable>
      </View>
    </AppModal>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onDelete,
}: {
  template: TemplateWithDimension;
  onDelete: (id: string) => void;
}) {
  const dim = template.dimension;

  function confirmDelete() {
    const label = dim ? `Ø${dim.dia} / ${dim.depth} m` : template.dimensionId;
    Alert.alert('Delete template', `Remove ${label} template?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(template.id) },
    ]);
  }

  return (
    <GlassCard innerStyle={styles.templateRow}>
      {/* Dia × depth (resolved from joined dimension) */}
      <View style={styles.dimGroup}>
        {dim ? (
          <>
            <Text style={styles.dimLabel}>Ø</Text>
            <Text style={styles.dimValue}>{dim.dia}</Text>
            <Text style={styles.dimSep}>/</Text>
            <Text style={styles.dimValue}>{dim.depth} m</Text>
          </>
        ) : (
          <Text style={styles.dimValue}>—</Text>
        )}
      </View>

      {/* Duration + buffer */}
      <View style={styles.durationGroup}>
        <Clock color={colors.accent} size={14} strokeWidth={2} />
        <Text style={styles.durationText}>{template.durationMinutes} min</Text>
        {template.bufferBeforeMinutes > 0 && (
          <Text style={styles.bufferText}>+{template.bufferBeforeMinutes} buf</Text>
        )}
      </View>

      {/* Delete */}
      <Pressable onPress={confirmDelete} style={styles.deleteBtn} hitSlop={8}>
        <Trash2 color={colors.warning} size={18} strokeWidth={2} />
      </Pressable>
    </GlassCard>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StepDetailScreen() {
  const route = useRoute<Route>();
  const { stepId, stepName } = route.params;
  const siteId = useAuthStore((s) => s.user?.siteId);

  const [templates, setTemplates] = useState<TemplateWithDimension[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTemplatesWithDimensions(stepId)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stepId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    await deleteTemplate(id);
    load();
  }

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header */}
        <View style={styles.headerArea}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.pageTitle}>{stepName}</Text>
              <Text style={styles.pageSubtitle}>Duration templates by dia × depth</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={() => setModalOpen(true)}>
              <Plus color="#fff" size={18} strokeWidth={2.5} />
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: spacing.xxxl }} />
        ) : (
          <FlatList
            data={templates}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No templates yet — tap Add to create one.</Text>
            }
            renderItem={({ item }) => (
              <TemplateRow template={item} onDelete={handleDelete} />
            )}
          />
        )}

        {/* Modal */}
        <AddTemplateModal
          visible={modalOpen}
          stepId={stepId}
          siteId={siteId}
          existingTemplates={templates}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addBtnText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },

  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalBody: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  noDimsText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.15)',
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipUsed: { opacity: 0.45 },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    fontSize: 13,
  },
  chipTextSelected: { color: '#fff' },
  chipTextUsed: { color: colors.textSecondary },
  chipUsedBadge: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  row2: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  fieldInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(28,28,46,0.15)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    backgroundColor: 'rgba(28,28,46,0.04)',
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // ── Template row ──────────────────────────────────────────────────────────
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    width: '100%',
  },
  dimGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  dimLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13,
  },
  dimValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 16,
  },
  dimSep: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  durationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  durationText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '700',
  },
  bufferText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  deleteBtn: { padding: 4 },

  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});