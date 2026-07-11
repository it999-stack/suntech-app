// src/screens/Profile/site-settings/ShiftsScreen.tsx

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Clock, ChevronRight, Plus } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { useSiteSettings } from '@state/SiteSettingsContext';
import { shiftDurationMinutes } from '@app-types/siteSettings';

export default function ShiftsScreen() {
  const navigation = useNavigation<any>();
  const { shifts, addShift } = useSiteSettings();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');

  const [startMinutes, setStartMinutes] = useState(7 * 60);
  const [endMinutes, setEndMinutes] = useState(19 * 60);

  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // When the modal opens, seed start = last shift's end (or 07:00); end = start + 12 h
  useEffect(() => {
    if (modalOpen) {
      const seed = shifts.length > 0 ? shifts[shifts.length - 1].endMinutes : 7 * 60;
      setStartMinutes(seed);
      setEndMinutes((seed + 12 * 60) % (24 * 60));
      setName('');
    }
  }, [modalOpen]);

  /** When start changes, auto-set end = start + 12 hours (wraps around midnight). */
  function handleStartChange(mins: number) {
    setStartMinutes(mins);
    setEndMinutes((mins + 12 * 60) % (24 * 60));
  }

  const coveredHrs = Math.round(
    (shifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0) / 60) * 10
  ) / 10;

  function resetForm() {
    setName('');
    // start/end will be re-seeded when modal next opens via useEffect
  }

  function handleSave() {
    if (!name.trim()) return;
    addShift({ name: name.trim(), startMinutes, endMinutes });
    resetForm();
    setModalOpen(false);
  }

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Shifts</Text>
            <View style={{ width: 22 }} />
          </View>
          <Text style={styles.subtitle}>{coveredHrs} of 24 hrs covered</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {shifts.map((shift) => (
            <Pressable key={shift.id} onPress={() => navigation.navigate('ShiftWindows', { shiftId: shift.id })}>
              <GlassCard style={styles.shiftCard}>
                <View style={styles.shiftRow}>
                  <View style={styles.iconWrap}>
                    <Clock size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftName}>{shift.name}</Text>
                    <Text style={styles.shiftTime}>
                      {formatMinutes(shift.startMinutes)} – {formatMinutes(shift.endMinutes)}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </View>
              </GlassCard>
            </Pressable>
          ))}

          <Pressable style={styles.addButton} onPress={() => setModalOpen(true)}>
            <Plus size={16} color={colors.accent} />
            <Text style={styles.addButtonText}>Add shift</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <AppModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add shift"
        subtitle="Shifts together should cover the full 24 hours"
      >
        <Text style={styles.fieldLabel}>Shift name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Day Shift"
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

        <Pressable
          style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!name.trim()}
        >
          <Text style={styles.saveButtonText}>Save shift</Text>
        </Pressable>
      </AppModal>

      <TimerSelectMenu
        visible={startPickerOpen}
        onClose={() => setStartPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          handleStartChange(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0); return d; })()}
      />
      <TimerSelectMenu
        visible={endPickerOpen}
        onClose={() => setEndPickerOpen(false)}
        onTimeSelect={(date) => {
          const m = date.getHours() * 60 + date.getMinutes();
          setEndMinutes(m);
        }}
        initialDate={(() => { const d = new Date(); d.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0); return d; })()}
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
    gap: spacing.md,
  },

  shiftCard: {},
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  shiftTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
