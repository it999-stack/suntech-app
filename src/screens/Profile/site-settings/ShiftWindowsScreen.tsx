// src/screens/Profile/site-settings/ShiftWindowsScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ChevronLeft, Clock, Trash2, Plus, Edit2 } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';
import type { NonWorkingWindow } from '@app-types/siteSettings';
import type { NonWorkingWindowBehavior } from '@db/schema';

// TODO: add this route to your site-settings stack's param list, e.g.
// ShiftWindows: { shiftId: string }
type ShiftWindowsRouteProp = RouteProp<{ ShiftWindows: { shiftId: string } }, 'ShiftWindows'>;

export default function ShiftWindowsScreen() {
  const navigation = useNavigation();
  const route = useRoute<ShiftWindowsRouteProp>();
  const { shiftId } = route.params;

  const { shifts, updateShift, windowsForShift, addWindow, updateWindow, deleteWindow } =
    useSiteSettings();
  const shift = shifts.find((s) => s.id === shiftId);
  const shiftWindows = windowsForShift(shiftId);

  // For overnight shifts (endMinutes < startMinutes), the stepper's max must
  // extend past midnight, e.g. shift 20:00→08:00 ⟹ max = 08:00 + 1440 = 1920.
  // formatTime24 wraps % 1440 so it always displays correctly.
  const isOvernight = shift ? shift.endMinutes < shift.startMinutes : false;
  const shiftMaxMinutes = shift
    ? isOvernight
      ? shift.endMinutes + 1440
      : shift.endMinutes
    : 1440;

  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [startMinutes, setStartMinutes] = useState(shift?.startMinutes ?? 480);
  const [endMinutes, setEndMinutes] = useState((shift?.startMinutes ?? 480) + 60);
  const [behavior, setBehavior] = useState<NonWorkingWindowBehavior>('FIXED');

  // Edit existing window
  const [editWindow, setEditWindow] = useState<NonWorkingWindow | null>(null);
  const [editWindowModalOpen, setEditWindowModalOpen] = useState(false);
  const [editWindowLabel, setEditWindowLabel] = useState('');
  const [editWindowStart, setEditWindowStart] = useState(480);
  const [editWindowEnd, setEditWindowEnd] = useState(540);
  const [editWindowBehavior, setEditWindowBehavior] = useState<NonWorkingWindowBehavior>('FIXED');

  // Edit shift timing
  const [editName, setEditName] = useState(shift?.name ?? '');
  const [editStart, setEditStart] = useState(shift?.startMinutes ?? 480);
  const [editEnd, setEditEnd] = useState(shift?.endMinutes ?? 19 * 60);

  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [editStartPickerOpen, setEditStartPickerOpen] = useState(false);
  const [editEndPickerOpen, setEditEndPickerOpen] = useState(false);
  const [editShiftStartPickerOpen, setEditShiftStartPickerOpen] = useState(false);
  const [editShiftEndPickerOpen, setEditShiftEndPickerOpen] = useState(false);

  function resetForm() {
    setLabel('');
    setStartMinutes(shift?.startMinutes ?? 480);
    setEndMinutes((shift?.startMinutes ?? 480) + 60);
  }

  function handleSave() {
    if (!label.trim()) return;
    addWindow({ shiftId, label: label.trim(), startMinutes, endMinutes, behavior });
    resetForm();
    setBehavior('FIXED');
    setModalOpen(false);
  }

  function openEditWindowModal(w: NonWorkingWindow) {
    setEditWindow(w);
    setEditWindowLabel(w.label);
    setEditWindowStart(w.startMinutes);
    setEditWindowEnd(w.endMinutes);
    setEditWindowBehavior(w.behavior);
    setEditWindowModalOpen(true);
  }

  function handleEditWindowSave() {
    if (!editWindow || !editWindowLabel.trim()) return;
    updateWindow(editWindow.id, {
      label: editWindowLabel.trim(),
      startMinutes: editWindowStart,
      endMinutes: editWindowEnd,
      behavior: editWindowBehavior,
    });
    setEditWindowModalOpen(false);
    setEditWindow(null);
  }

  function openEditModal() {
    if (!shift) return;
    setEditName(shift.name);
    setEditStart(shift.startMinutes);
    setEditEnd(shift.endMinutes);
    setEditModalOpen(true);
  }

  function handleEditSave() {
    if (!shift || !editName.trim()) return;
    updateShift(shift.id, { name: editName.trim(), startMinutes: editStart, endMinutes: editEnd });
    setEditModalOpen(false);
  }

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>{shift?.name ?? 'Shift'}</Text>
            {shift ? (
              <Pressable onPress={openEditModal} hitSlop={8} style={styles.editBtn}>
                <Edit2 size={16} color={colors.textSecondary} />
              </Pressable>
            ) : (
              <View style={{ width: 22 }} />
            )}
          </View>
          {shift && (
            <Text style={styles.subtitle}>
              {formatMinutes(shift.startMinutes)} – {formatMinutes(shift.endMinutes)}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <GlassCard>
            {shiftWindows.map((w, idx) => (
              <View key={w.id}>
                <View style={styles.windowRow}>
                  <View style={styles.rowLeft}>
                    <View style={styles.iconWrap}>
                      <Clock size={16} color={colors.accent} />
                    </View>
                    <View>
                      <View style={styles.rowLabelWrap}>
                        <Text style={styles.rowLabel}>{w.label}</Text>
                        <View
                          style={[
                            styles.behaviorBadge,
                            w.behavior === 'AFTER_CURRENT_STEP' && styles.behaviorBadgeAfter,
                          ]}
                        >
                          <Text
                            style={[
                              styles.behaviorBadgeText,
                              w.behavior === 'AFTER_CURRENT_STEP' && styles.behaviorBadgeTextAfter,
                            ]}
                          >
                            {w.behavior === 'AFTER_CURRENT_STEP' ? 'After step' : 'Fixed'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>
                        {formatMinutes(w.startMinutes)} - {formatMinutes(w.endMinutes)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable hitSlop={8} onPress={() => openEditWindowModal(w)}>
                      <Edit2 size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => deleteWindow(w.id)}>
                      <Trash2 size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
                {idx < shiftWindows.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            {shiftWindows.length === 0 && (
              <Text style={styles.emptyText}>No non-working windows for this shift yet.</Text>
            )}
          </GlassCard>

          <Text style={styles.helperText}>
            Time inside these windows is excluded from plan generation for this shift —
            everything else counts as working time.
          </Text>

          <Pressable style={styles.addButton} onPress={() => setModalOpen(true)}>
            <Plus size={16} color={colors.accent} />
            <Text style={styles.addButtonText}>Add non-working window</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <AppModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add non-working window"
        subtitle={shift ? `Scoped to ${shift.name}` : undefined}
      >
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Lunch break"
          placeholderTextColor={colors.textSecondary}
        />

        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setStartPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(startMinutes)}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setEndPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(endMinutes)}</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.fieldLabel}>Behavior</Text>
          <View style={styles.behaviorToggle}>
            {(['FIXED', 'AFTER_CURRENT_STEP'] as NonWorkingWindowBehavior[]).map((opt) => (
              <Pressable
                key={opt}
                style={[styles.behaviorOption, behavior === opt && styles.behaviorOptionActive]}
                onPress={() => setBehavior(opt)}
              >
                <Text
                  style={[
                    styles.behaviorOptionText,
                    behavior === opt && styles.behaviorOptionTextActive,
                  ]}
                >
                  {opt === 'FIXED' ? 'Fixed' : 'After current step'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.behaviorHint}>
            {'Fixed'}: the break stays at its time and steps pause around it.{' '}
            {'After current step'}: if a machine is mid-step when the break starts, the step runs
            through and the break shifts to after it.
          </Text>
        </View>

        <Pressable
          style={[styles.saveButton, !label.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!label.trim()}
        >
          <Text style={styles.saveButtonText}>Save window</Text>
        </Pressable>
      </AppModal>

      <AppModal
        visible={editWindowModalOpen}
        onClose={() => setEditWindowModalOpen(false)}
        title="Edit non-working window"
        subtitle={shift ? `Scoped to ${shift.name}` : undefined}
      >
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput
          style={styles.input}
          value={editWindowLabel}
          onChangeText={setEditWindowLabel}
          placeholder="e.g. Lunch break"
          placeholderTextColor={colors.textSecondary}
        />

        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setEditStartPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(editWindowStart)}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setEditEndPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(editWindowEnd)}</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.fieldLabel}>Behavior</Text>
          <View style={styles.behaviorToggle}>
            {(['FIXED', 'AFTER_CURRENT_STEP'] as NonWorkingWindowBehavior[]).map((opt) => (
              <Pressable
                key={opt}
                style={[styles.behaviorOption, editWindowBehavior === opt && styles.behaviorOptionActive]}
                onPress={() => setEditWindowBehavior(opt)}
              >
                <Text
                  style={[
                    styles.behaviorOptionText,
                    editWindowBehavior === opt && styles.behaviorOptionTextActive,
                  ]}
                >
                  {opt === 'FIXED' ? 'Fixed' : 'After current step'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.behaviorHint}>
            {'Fixed'}: the break stays at its time and steps pause around it.{' '}
            {'After current step'}: if a machine is mid-step when the break starts, the step runs
            through and the break shifts to after it.
          </Text>
        </View>

        <Pressable
          style={[styles.saveButton, !editWindowLabel.trim() && styles.saveButtonDisabled]}
          onPress={handleEditWindowSave}
          disabled={!editWindowLabel.trim()}
        >
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>
      </AppModal>

      <AppModal
        visible={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit shift timing"
        subtitle={shift?.name}
      >
        <Text style={styles.fieldLabel}>Shift name</Text>
        <TextInput
          style={styles.input}
          value={editName}
          onChangeText={setEditName}
          placeholder="e.g. Day Shift"
          placeholderTextColor={colors.textSecondary}
        />

        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setEditShiftStartPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(editStart)}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Pressable style={styles.timePickerBtn} onPress={() => setEditShiftEndPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(editEnd)}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.saveButton, !editName.trim() && styles.saveButtonDisabled]}
          onPress={handleEditSave}
          disabled={!editName.trim()}
        >
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>
      </AppModal>

      <TimerSelectMenu
        visible={startPickerOpen}
        onClose={() => setStartPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          const clamped = Math.max(shift?.startMinutes ?? 0, Math.min(shiftMaxMinutes - 30, m));
          setStartMinutes(clamped);
          if (endMinutes - clamped < 30) setEndMinutes(clamped + 30);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={endPickerOpen}
        onClose={() => setEndPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          const clamped = Math.max(startMinutes + 30, Math.min(shiftMaxMinutes, m));
          setEndMinutes(clamped);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={editStartPickerOpen}
        onClose={() => setEditStartPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          const clamped = Math.max(shift?.startMinutes ?? 0, Math.min(shiftMaxMinutes - 30, m));
          setEditWindowStart(clamped);
          if (editWindowEnd - clamped < 30) setEditWindowEnd(clamped + 30);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(editWindowStart / 60), editWindowStart % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={editEndPickerOpen}
        onClose={() => setEditEndPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          const clamped = Math.max(editWindowStart + 30, Math.min(shiftMaxMinutes, m));
          setEditWindowEnd(clamped);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(editWindowEnd / 60), editWindowEnd % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={editShiftStartPickerOpen}
        onClose={() => setEditShiftStartPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          setEditStart(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(editStart / 60), editStart % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={editShiftEndPickerOpen}
        onClose={() => setEditShiftEndPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          setEditEnd(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(editEnd / 60), editEnd % 60, 0, 0); return d; })()}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  windowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.06)',
    marginVertical: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  addButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accent,
  },

  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  behaviorToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  behaviorOption: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(28,28,46,0.06)',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  behaviorOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  behaviorOptionText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  behaviorOptionTextActive: {
    color: colors.accent,
  },
  behaviorHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  rowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  behaviorBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(28,28,46,0.08)',
  },
  behaviorBadgeAfter: {
    backgroundColor: colors.accentSoft,
  },
  behaviorBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  behaviorBadgeTextAfter: {
    color: colors.accent,
  },
  input: {
    backgroundColor: 'rgba(28,28,46,0.05)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.textPrimary,
  },

  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
  timePickerBtn: {
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  timePickerBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
