// src/components/plan/actual/MachineEventsModal.tsx
//
// Log a machine breakdown/replacement/resume event for a step, and view its
// history. Split out of the old combined StepActionsModal — this modal now
// owns the "machine events" half only, with no tab switcher.

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Keyboard, ActivityIndicator } from 'react-native';
import { Clock3, CalendarDays, AlertTriangle, Coffee, RefreshCw, CheckCircle2, Play } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { SegmentedToggle, type SegmentOption } from '@components/shared/SegmentedToggle';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import AppCalendar from '@components/shared/AppCalendar';
import MachineSelect, { type MachineSelectKind } from '@components/plan/generate/steps/pile-assign/MachineSelect';
import type { SimpleMachine } from '@components/plan/generate/steps/pile-assign/types';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString, toLocalDateStr } from '@utils/formatTime';

type Track = 'RIG' | 'CRANE' | 'COMPRESSOR';
type EventType = 'BREAKDOWN' | 'REPLACED' | 'RESUMED' | 'IDLE_START' | 'IDLE_END';

export interface StepActionsMachine {
  id: string;
  machineNo: string;
  /** Loosely typed to match the local SQLite cache's plain string column. */
  type: string;
  status: string;
}

interface Props {
  visible: boolean;
  pileCode: string;
  stepName: string;
  defaultTrack: Track;
  /** Pre-selects the Event type toggle on open (e.g. opening straight into
   * "End Idle" from the idle banner) instead of always defaulting to Replaced. */
  initialEventType?: EventType;
  /** Every machine at this site — filtered internally per track/status. */
  machines: StepActionsMachine[];
  /** Current assigned machine id per track, for this pile at this step's position. */
  currentMachineIdByTrack: Partial<Record<Track, string>>;
  history: PilMachineEvent[];
  onClose: () => void;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
}

const EVENT_TYPE_OPTIONS: SwipeableTabItem<EventType>[] = [
  {
    value: 'BREAKDOWN',
    label: 'Breakdown',
    color: colors.danger,
    renderIcon: (color) => <AlertTriangle size={14} color={color} />,
  },
  {
    value: 'REPLACED',
    label: 'Replaced',
    color: colors.accent,
    renderIcon: (color) => <RefreshCw size={14} color={color} />,
  },
  {
    value: 'RESUMED',
    label: 'Resumed',
    color: colors.success,
    renderIcon: (color) => <CheckCircle2 size={14} color={color} />,
  },
  {
    value: 'IDLE_START',
    label: 'Start Idle',
    color: colors.warning,
    renderIcon: (color) => <Coffee size={14} color={color} />,
  },
  {
    value: 'IDLE_END',
    label: 'End Idle',
    color: colors.warning,
    renderIcon: (color) => <Play size={14} color={color} />,
  },
];

function trackLabel(track: Track): string {
  if (track === 'RIG') return 'Rig';
  if (track === 'CRANE') return 'Crane';
  return 'Compressor';
}

function trackToMachineSelectKind(track: Track): MachineSelectKind {
  if (track === 'RIG') return 'rig';
  if (track === 'CRANE') return 'crane';
  return 'compressor';
}

function eventTypeLabel(t: string): string {
  if (t === 'BREAKDOWN') return 'Breakdown';
  if (t === 'REPLACED') return 'Replaced';
  if (t === 'RESUMED') return 'Resumed';
  if (t === 'IDLE_START') return 'Idle start';
  if (t === 'IDLE_END') return 'Idle end';
  return t;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function formatTimeOfDay(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

export default function MachineEventsModal({
  visible,
  pileCode,
  stepName,
  defaultTrack,
  initialEventType,
  machines,
  currentMachineIdByTrack,
  history,
  onClose,
  onLogMachineEvent,
}: Props) {
  const tracksInPile = useMemo(
    () => Object.keys(currentMachineIdByTrack) as Track[],
    [currentMachineIdByTrack],
  );
  const trackOptions: SegmentOption<Track>[] = (tracksInPile.length ? tracksInPile : [defaultTrack]).map(
    (t) => ({ label: trackLabel(t), value: t }),
  );
  const [track, setTrack] = useState<Track>(defaultTrack);
  const [eventType, setEventType] = useState<EventType>(initialEventType ?? 'REPLACED');
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [resumeMachineId, setResumeMachineId] = useState<string | null>(null);
  const [idleEndMachineId, setIdleEndMachineId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);

  const currentMachineId = currentMachineIdByTrack[track];
  const currentMachine = machines.find((m) => m.id === currentMachineId);

  const replacementOptions: SimpleMachine[] = machines
    .filter((m) => m.type === track && m.status === 'ACTIVE' && m.id !== currentMachineId)
    .map((m) => ({ id: m.id, machineNo: m.machineNo }));

  const resumeOptions: SimpleMachine[] = machines
    .filter((m) => m.type === track && m.status === 'BREAKDOWN')
    .map((m) => ({ id: m.id, machineNo: m.machineNo }));

  const idleEndOptions: SimpleMachine[] = machines
    .filter((m) => m.type === track && m.status === 'IDLE')
    .map((m) => ({ id: m.id, machineNo: m.machineNo }));

  const canSaveEvent =
    !savingEvent &&
    ((eventType === 'BREAKDOWN' && !!currentMachineId) ||
      (eventType === 'REPLACED' && !!currentMachineId && !!replacementId) ||
      (eventType === 'RESUMED' && !!resumeMachineId) ||
      (eventType === 'IDLE_START' && !!currentMachineId) ||
      (eventType === 'IDLE_END' && !!idleEndMachineId));

  async function handleSaveEvent() {
    Keyboard.dismiss();
    setSavingEvent(true);
    try {
      const input: LogMachineEventInput =
        eventType === 'RESUMED' || eventType === 'IDLE_END'
          ? {
              track,
              eventType,
              machineId: eventType === 'RESUMED' ? resumeMachineId : idleEndMachineId,
              replacementId: null,
              notes: notes.trim() || null,
              occurredAt: toLocalIsoString(occurredAt),
            }
          : {
              track,
              eventType,
              machineId: currentMachineId ?? null,
              replacementId: eventType === 'REPLACED' ? replacementId : null,
              notes: notes.trim() || null,
              occurredAt: toLocalIsoString(occurredAt),
            };
      await onLogMachineEvent(input);
      setReplacementId(null);
      setResumeMachineId(null);
      setIdleEndMachineId(null);
      setNotes('');
      onClose();
    } catch (err) {
      Alert.alert(
        'Failed to save',
        err instanceof Error ? err.message : 'Could not log this event. Please try again.',
      );
      setSavingEvent(false);
    }
  }

  /** The one field that varies per event type — rendered as the swipeable
   * page under the Event type badge row (see EVENT_TYPE_OPTIONS above). */
  function renderEventTypeFields(type: EventType) {
    if (type === 'REPLACED') {
      return (
        <MachineSelect
          label="Replacement"
          kind={trackToMachineSelectKind(track)}
          options={replacementOptions}
          valueId={replacementId}
          onSelect={setReplacementId}
        />
      );
    }
    if (type === 'RESUMED') {
      return (
        <MachineSelect
          label={`${trackLabel(track)} to resume`}
          kind={trackToMachineSelectKind(track)}
          options={resumeOptions}
          valueId={resumeMachineId}
          onSelect={setResumeMachineId}
        />
      );
    }
    if (type === 'IDLE_END') {
      return (
        <MachineSelect
          label={`${trackLabel(track)} to mark active`}
          kind={trackToMachineSelectKind(track)}
          options={idleEndOptions}
          valueId={idleEndMachineId}
          onSelect={setIdleEndMachineId}
        />
      );
    }
    // BREAKDOWN and IDLE_START both act on the pile's current machine on this track.
    return (
      <>
        <Text style={styles.fieldLabel}>
          {type === 'BREAKDOWN' ? `${trackLabel(track)} (going down)` : `Current ${trackLabel(track)}`}
        </Text>
        {currentMachine ? (
          <View style={styles.currentMachineRow}>
            <Text style={styles.currentMachineText}>{currentMachine.machineNo}</Text>
            {(type === 'BREAKDOWN' || currentMachine.status === 'BREAKDOWN') && (
              <View style={styles.downBadge}>
                <AlertTriangle size={12} color={colors.danger} />
                <Text style={styles.downBadgeText}>Reported down</Text>
              </View>
            )}
            {type !== 'BREAKDOWN' && currentMachine.status === 'IDLE' && (
              <View style={styles.idleBadge}>
                <Coffee size={12} color={colors.warning} />
                <Text style={styles.idleBadgeText}>Idle</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.emptyText}>No {trackLabel(track).toLowerCase()} assigned to this pile.</Text>
        )}
      </>
    );
  }

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName}>
      <View style={styles.page}>
        {history.length > 0 && (
          <View style={styles.historyWrap}>
            <Text style={styles.sectionLabel}>History</Text>
            {history.map((h, idx) => (
              <View key={h.id} style={styles.historyRow}>
                <View style={styles.historyRail}>
                  <View style={styles.historyDot} />
                  {idx < history.length - 1 && <View style={styles.historyLine} />}
                </View>
                <View style={styles.historyCard}>
                  <Text style={styles.historyKind}>
                    {eventTypeLabel(h.eventType)} · {trackLabel(h.track as Track)}
                  </Text>
                  <Text style={styles.historyTitle}>
                    {machines.find((m) => m.id === h.machineId)?.machineNo ?? '—'}
                    {h.replacementId
                      ? ` → ${machines.find((m) => m.id === h.replacementId)?.machineNo ?? '—'}`
                      : ''}
                  </Text>
                  {h.notes ? <Text style={styles.historySubtitle}>{h.notes}</Text> : null}
                  <Text style={styles.historyTime}>
                    {formatDate(new Date(h.occurredAt))} · {formatTimeOfDay(new Date(h.occurredAt))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>Log machine event</Text>

        <Text style={styles.fieldLabel}>Track</Text>
        <View style={styles.toggleWrap}>
          <SegmentedToggle options={trackOptions} value={track} onChange={setTrack} />
        </View>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Event type</Text>
        <SwipeableTabBar
          items={EVENT_TYPE_OPTIONS}
          value={eventType}
          onChange={setEventType}
          scrollHint="fade"
          fadeToColor={colors.white}
          pillVariant="piles"
          renderPage={(item) => renderEventTypeFields(item.value)}
        />

        <View style={styles.timeRow}>
          <Pressable style={styles.timeField} onPress={() => setTimePickerOpen(true)}>
            <Text style={styles.fieldLabel}>Occurred at</Text>
            <View style={styles.valueRow}>
              <Clock3 size={18} color="#6B7280" />
              <Text style={styles.fieldValue}>{formatTimeOfDay(occurredAt)}</Text>
            </View>
          </Pressable>

          <Pressable style={styles.timeField} onPress={() => setDatePickerOpen(true)}>
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.valueRow}>
              <CalendarDays size={18} color="#6B7280" />
              <Text style={styles.fieldValue}>{formatDate(occurredAt)}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Notes</Text>
        <TextInput
          style={styles.textarea}
          multiline
          numberOfLines={3}
          placeholder="What happened?"
          placeholderTextColor={colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.saveBtn, !canSaveEvent && styles.saveBtnDisabled]}
          disabled={!canSaveEvent}
          onPress={handleSaveEvent}
        >
          {savingEvent ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save event</Text>
          )}
        </Pressable>
      </View>

      <TimerSelectMenu
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialDate={occurredAt}
        // This modal has its own separate "Date" field + AppCalendar below —
        // TimerSelectMenu only ever picks the time-of-day here.
        allowDateChange={false}
        onConfirm={(d) => {
          setOccurredAt((prev) => {
            const next = new Date(prev);
            next.setHours(d.getHours(), d.getMinutes(), 0, 0);
            return next;
          });
        }}
      />

      <AppModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        title="Select date"
        position="center"
      >
        <AppCalendar
          selectedDate={toLocalDateStr(occurredAt)}
          onSelectDate={(dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            setOccurredAt((prev) => {
              const next = new Date(prev);
              next.setFullYear(y, m - 1, d);
              return next;
            });
            setDatePickerOpen(false);
          }}
          getDayState={(dateStr) => ({
            disabled: dateStr > toLocalDateStr(new Date()),
            selected: dateStr === toLocalDateStr(occurredAt),
          })}
        />
      </AppModal>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: spacing.md },
  // SegmentedToggle is a frosted-glass control designed to sit on this app's
  // gradient screen backdrops (see PilesScreen) — on AppModal's solid white
  // sheet the blur has nothing to contrast against and reads as invisible.
  // This tinted surface gives it something to blur/sit on in modal contexts.
  toggleWrap: {
    backgroundColor: 'rgba(28,28,46, 0.07)',
    borderRadius: radius.pill,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  fieldLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  fieldLabelSpaced: { marginTop: spacing.md, marginBottom: spacing.sm },
  fieldValue: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 100,
    marginTop: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  currentMachineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  currentMachineText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  downBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  downBadgeText: { fontSize: 10.5, fontWeight: '700', color: colors.danger },
  idleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  idleBadgeText: { fontSize: 10.5, fontWeight: '700', color: colors.warning },
  emptyText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  timeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  timeField: {
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyWrap: { marginBottom: spacing.lg },
  historyRow: { flexDirection: 'row', gap: spacing.sm },
  historyRail: { width: 14, alignItems: 'center' },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.white,
    marginTop: 4,
  },
  historyLine: { width: 2, flex: 1, backgroundColor: 'rgba(28,28,46,0.08)', marginTop: 2, minHeight: 20 },
  historyCard: {
    flex: 1,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  historyKind: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  historyTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  historySubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  historyTime: { ...typography.caption, fontSize: 10.5, color: colors.textSecondary, marginTop: 4 },
});
