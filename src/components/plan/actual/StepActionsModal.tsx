// src/components/plan/actual/StepActionsModal.tsx
//
// Per-step actions modal, opened from the ellipsis icon on a step row in
// FillActualScreen. Two swipeable tabs: Remarks and Machine events. The tab
// selector reuses SegmentedToggle; swipe-to-switch reuses the same PagerView
// mechanism SwipeableTabBar wraps (page-height measured per tab, same as
// SwipeableTabBar, since this sits inside AppModal's vertical ScrollView).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Clock3, CalendarDays } from 'lucide-react-native'
import PagerView from 'react-native-pager-view';
import { AlertTriangle } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { SegmentedToggle, type SegmentOption } from '@components/shared/SegmentedToggle';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import AppCalendar from '@components/shared/AppCalendar';
import MachineSelect, { type MachineSelectKind } from '@components/plan/generate/steps/pile-assign/MachineSelect';
import type { SimpleMachine } from '@components/plan/generate/steps/pile-assign/types';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilMachineEvent } from '@db/schema';
import { colors, spacing, radius, typography } from '@theme/theme';
import { toLocalIsoString, toLocalDateStr } from '@utils/formatTime';

type Track = 'RIG' | 'CRANE' | 'COMPRESSOR';
type EventType = 'BREAKDOWN' | 'REPLACED' | 'RESUMED';
type TabKey = 'remarks' | 'machine_events';

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
  /** Every machine at this site — filtered internally per track/status. */
  machines: StepActionsMachine[];
  /** Current assigned machine id per track, for this pile at this step's position. */
  currentMachineIdByTrack: Partial<Record<Track, string>>;
  history: PilMachineEvent[];
  remarks?: string;
  initialTab?: TabKey;
  /** Only the current step can log/edit machine events — completed and
   * locked steps get remarks only, so the tab switcher itself is hidden. */
  allowMachineEvents: boolean;
  onClose: () => void;
  onSaveRemarks: (text: string) => Promise<void>;
  onLogMachineEvent: (input: LogMachineEventInput) => Promise<void>;
}

const TAB_OPTIONS: SegmentOption<TabKey>[] = [
  { label: 'Remarks', value: 'remarks' },
  { label: 'Machine events', value: 'machine_events' },
];

const EVENT_TYPE_OPTIONS: SegmentOption<EventType>[] = [
  { label: 'Breakdown', value: 'BREAKDOWN' },
  { label: 'Replaced', value: 'REPLACED' },
  { label: 'Resumed', value: 'RESUMED' },
];

const FALLBACK_PAGE_HEIGHT = 260;

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

export default function StepActionsModal({
  visible,
  pileCode,
  stepName,
  defaultTrack,
  machines,
  currentMachineIdByTrack,
  history,
  remarks,
  initialTab = 'remarks',
  allowMachineEvents,
  onClose,
  onSaveRemarks,
  onLogMachineEvent,
}: Props) {
  const pagerRef = useRef<PagerView>(null);
  const [tab, setTab] = useState<TabKey>(allowMachineEvents ? initialTab : 'remarks');
  // Both tabs share one pager height — the taller of the two measured pages —
  // so switching tabs never visibly resizes the sheet.
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({});
  const activeIndex = TAB_OPTIONS.findIndex((o) => o.value === tab);
  const measuredHeights = Object.values(pageHeights);
  const pagerHeight = measuredHeights.length ? Math.max(...measuredHeights) : FALLBACK_PAGE_HEIGHT;

  // Gate the modal's reveal on both pages already being measured, so the
  // sheet appears at its final height from frame one instead of opening at
  // FALLBACK_PAGE_HEIGHT and visibly resizing mid-slide-in once onLayout
  // reports the real (usually taller) content height.
  const [measured, setMeasured] = useState(!allowMachineEvents);
  const measureWidth = Dimensions.get('window').width - spacing.lg * 2;

  useEffect(() => {
    if (measured || !allowMachineEvents) return;
    if (pageHeights[0] != null && pageHeights[1] != null) setMeasured(true);
  }, [measured, allowMachineEvents, pageHeights]);

  // ── Remarks tab state ────────────────────────────────────────────────────
  const [remarksText, setRemarksText] = useState(remarks ?? '');
  const [savingRemarks, setSavingRemarks] = useState(false);

  // ── Machine events tab state ─────────────────────────────────────────────
  const tracksInPile = useMemo(
    () => Object.keys(currentMachineIdByTrack) as Track[],
    [currentMachineIdByTrack],
  );
  const trackOptions: SegmentOption<Track>[] = (tracksInPile.length ? tracksInPile : [defaultTrack]).map(
    (t) => ({ label: trackLabel(t), value: t }),
  );
  const [track, setTrack] = useState<Track>(defaultTrack);
  const [eventType, setEventType] = useState<EventType>('REPLACED');
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [resumeMachineId, setResumeMachineId] = useState<string | null>(null);
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

  const canSaveEvent =
    !savingEvent &&
    ((eventType === 'BREAKDOWN' && !!currentMachineId) ||
      (eventType === 'REPLACED' && !!currentMachineId && !!replacementId) ||
      (eventType === 'RESUMED' && !!resumeMachineId));

  function handleTabChange(next: TabKey) {
    setTab(next);
    pagerRef.current?.setPage(TAB_OPTIONS.findIndex((o) => o.value === next));
  }

  function handleLayout(index: number, height: number) {
    setPageHeights((prev) => (prev[index] === height ? prev : { ...prev, [index]: height }));
  }

  async function handleSaveRemarks() {
    Keyboard.dismiss();
    setSavingRemarks(true);

    try {
      await onSaveRemarks(remarksText.trim());
      onClose();
    } catch (err) {
      Alert.alert(
        'Failed to save',
        err instanceof Error
          ? err.message
          : 'Could not save this remark. Please try again.',
      );
    } finally {
      setSavingRemarks(false);
    }
  }

  async function handleSaveEvent() {
    Keyboard.dismiss();
    setSavingEvent(true);
    try {
      const input: LogMachineEventInput =
        eventType === 'RESUMED'
          ? {
              track,
              eventType,
              machineId: resumeMachineId,
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

  const remarksForm = (
    <>
      <TextInput
        style={styles.textarea}
        multiline
        numberOfLines={5}
        placeholder="Add a note for this step…"
        placeholderTextColor={colors.textSecondary}
        value={remarksText}
        onChangeText={setRemarksText}
        textAlignVertical="top"
      />
      <Pressable
        style={[styles.saveBtn, (!remarksText.trim() || savingRemarks) && styles.saveBtnDisabled]}
        disabled={!remarksText.trim() || savingRemarks}
        onPress={handleSaveRemarks}
      >
        <Text style={styles.saveBtnText}>Add Remarks</Text>
      </Pressable>
    </>
  );

  const machineEventsForm = (
    <>
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
      <View style={styles.toggleWrap}>
        <SegmentedToggle options={EVENT_TYPE_OPTIONS} value={eventType} onChange={setEventType} />
      </View>

      {eventType !== 'RESUMED' && (
        <>
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            {eventType === 'BREAKDOWN' ? `${trackLabel(track)} (going down)` : `Current ${trackLabel(track)}`}
          </Text>
          {currentMachine ? (
            <View style={styles.currentMachineRow}>
              <Text style={styles.currentMachineText}>{currentMachine.machineNo}</Text>
              {/* Breakdown always shows this — it's literally what's being
                  logged. Replaced only shows it if the machine is already
                  down for some other reason — Replaced itself doesn't imply
                  a breakdown (it may just be reassigned elsewhere). */}
              {(eventType === 'BREAKDOWN' || currentMachine.status === 'BREAKDOWN') && (
                <View style={styles.downBadge}>
                  <AlertTriangle size={12} color={colors.danger} />
                  <Text style={styles.downBadgeText}>Reported down</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No {trackLabel(track).toLowerCase()} assigned to this pile.
            </Text>
          )}
        </>
      )}

      {eventType === 'REPLACED' && (
        <MachineSelect
          label="Replacement"
          kind={trackToMachineSelectKind(track)}
          options={replacementOptions}
          valueId={replacementId}
          onSelect={setReplacementId}
        />
      )}

      {eventType === 'RESUMED' && (
        <MachineSelect
          label={`${trackLabel(track)} to resume`}
          kind={trackToMachineSelectKind(track)}
          options={resumeOptions}
          valueId={resumeMachineId}
          onSelect={setResumeMachineId}
        />
      )}

      <View style={styles.timeRow}>
        <Pressable
          style={styles.timeField}
          onPress={() => setTimePickerOpen(true)}
        >
          <Text style={styles.fieldLabel}>Occurred at</Text>

          <View style={styles.valueRow}>
            <Clock3 size={18} color="#6B7280" />
            <Text style={styles.fieldValue}>{formatTimeOfDay(occurredAt)}</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.timeField}
          onPress={() => setDatePickerOpen(true)}
        >
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
    </>
  );

  // Pre-measure both pages off-screen (at the width they'll actually have
  // inside AppModal) before revealing the modal at all — see `measured` above.
  if (allowMachineEvents && !measured) {
    return (
      <View style={styles.hiddenMeasure} pointerEvents="none">
        <View style={{ width: measureWidth }} onLayout={(e) => handleLayout(0, e.nativeEvent.layout.height)}>
          {remarksForm}
        </View>
        <View style={{ width: measureWidth }} onLayout={(e) => handleLayout(1, e.nativeEvent.layout.height)}>
          {machineEventsForm}
        </View>
      </View>
    );
  }

  // Completed/locked steps only get remarks — no tab switcher needed since
  // there's nothing to switch to.
  if (!allowMachineEvents) {
    return (
      <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName}>
        <View style={styles.page}>{remarksForm}</View>
      </AppModal>
    );
  }

  return (
    <AppModal visible={visible} onClose={onClose} title={pileCode} subtitle={stepName}>
      <View style={styles.toggleWrap}>
        <SegmentedToggle options={TAB_OPTIONS} value={tab} onChange={handleTabChange} />
      </View>

      <PagerView
        ref={pagerRef}
        style={[styles.pager, { height: pagerHeight }]}
        initialPage={activeIndex}
        onPageSelected={(e) => setTab(TAB_OPTIONS[e.nativeEvent.position].value)}
      >
        {/* ── Remarks page ─────────────────────────────────────────────── */}
        <View key="remarks">
          <View onLayout={(e) => handleLayout(0, e.nativeEvent.layout.height)} style={styles.page}>
            {remarksForm}
          </View>
        </View>

        {/* ── Machine events page ──────────────────────────────────────── */}
        <View key="machine_events">
          <View onLayout={(e) => handleLayout(1, e.nativeEvent.layout.height)} style={styles.page}>
            {machineEventsForm}
          </View>
        </View>
      </PagerView>

      <TimerSelectMenu
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialDate={occurredAt}
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
  pager: { marginTop: spacing.md },
  page: { paddingBottom: spacing.md },
  // SegmentedToggle is a frosted-glass control designed to sit on this app's
  // gradient screen backdrops (see PilesScreen) — on AppModal's solid white
  // sheet the blur has nothing to contrast against and reads as invisible.
  // This tinted surface gives it something to blur/sit on in modal contexts.
  toggleWrap: {
    backgroundColor: 'rgba(28,28,46, 0.07)',
    borderRadius: radius.pill,
  },
  hiddenMeasure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
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
