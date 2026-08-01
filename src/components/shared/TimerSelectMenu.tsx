// src/components/shared/TimerSelectMenu.tsx
//
// Rounded, centered 12-hour time picker: hour / minute / AM-PM wheels over a
// gradient sheet that crossfades between "day" and "night" as the hour
// changes. 'duration' mode swaps this for a plain 0-23h/minute picker.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Dimensions, FlatList, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  interpolateColor,
  Extrapolation,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { createAudioPlayer } from 'expo-audio';
import { colors as themeColors } from '@theme/theme';

const ITEM_HEIGHT = 84;
const VISIBLE_ROWS = 3;
const HALF = Math.floor(VISIBLE_ROWS / 2);

// Infinite columns repeat their value array this many times and recenter
// near either buffer edge — enough that a fling can't outrun a recenter.
const REPEAT_COUNT = 21;
const MIDDLE_COPY = Math.floor(REPEAT_COUNT / 2);

// Caps the tick sound's rate (~25/sec) — a fast fling crosses rows far
// faster than that, and without this cap the backlog of queued tick calls
// keeps clicking after the wheel has already stopped.
const MIN_TICK_INTERVAL_MS = 40;

type WheelListItem = { label: string; index: number };

// Day (AM) → night (PM) gradient stops — intentionally not theme colors.
const amTop = '#040404';
const amBottom = '#007BE5';
const pmTop = '#007BE5';
const pmBottom = '#626262';

interface TimerSelectMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Required in 'time' mode (the default). Ignored in 'duration' mode. */
  onTimeSelect?: (date: Date) => void;
  initialDate?: Date;
  /** Optional callback fired when user confirms - receives the selected date (time mode only). */
  onConfirm?: (date: Date) => void;
  /**
   * 'time' (default) — 12-hour wall-clock picker with AM/PM and day/night gradient.
   * 'duration' — plain hour/minute picker (0-23h), no AM/PM, white background,
   * a custom title instead of the weekday/date header. Used for things like
   * "how much time is left on this step" rather than a time of day.
   */
  mode?: 'time' | 'duration';
  /** Duration mode: initial total minutes (0-1439) to preselect the wheels. */
  initialMinutes?: number;
  /** Duration mode: fires with the selected total minutes on Confirm. */
  onDurationSelect?: (totalMinutes: number) => void;
  /** Header title shown instead of the weekday/date row. Defaults to "Select remaining time" in duration mode. */
  title?: string;
  /**
   * Renders the picker content inline (no own Modal/backdrop) so a caller can
   * embed it inside their own modal/card. Caller owns visibility in this case.
   */
  embedded?: boolean;
}

// One shared player for every wheel's tick; volume is set per-play so fast
// flings tick louder than a settling scroll.
const tickPlayer = createAudioPlayer(require('../../../assets/sounds/tick.wav'));

function tick(volume: number) {
  tickPlayer.volume = volume;
  tickPlayer.seekTo(0);
  tickPlayer.play();
}

interface WheelItemProps {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  fontSize: number;
  textColor: string;
}

function WheelItem({ label, index, scrollY, fontSize, textColor }: WheelItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = scrollY.value / ITEM_HEIGHT - index;
    const opacity = interpolate(distance, [-2, -1, 0, 1, 2], [0.15, 0.4, 1, 0.4, 0.15], Extrapolation.CLAMP);
    const scale = interpolate(distance, [-2, -1, 0, 1, 2], [0.7, 0.86, 1, 0.86, 0.7], Extrapolation.CLAMP);
    // Cylindrical tilt: rows above/below the center lean away, like text
    // wrapping around a drum.
    const rotateX = interpolate(distance, [-2, -1, 0, 1, 2], [55, 30, 0, -30, -55], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ perspective: 200 }, { rotateX: `${rotateX}deg` }, { scale }],
    };
  });
  return (
    <View style={styles.itemRow}>
      <Animated.Text style={[styles.itemText, { fontSize, color: textColor }, animatedStyle]}>{label}</Animated.Text>
    </View>
  );
}

interface WheelColumnProps {
  values: string[];
  selectedIndex: number;
  /** `deltaCycles`: signed wrap count since last selection (0 for non-infinite
   * columns). Only the hour column uses it, to auto-flip AM/PM. */
  onSelect: (index: number, deltaCycles?: number) => void;
  width: number;
  fontSize: number;
  textColor: string;
  /** Loops past both ends instead of stopping — used for the hour/minute wheels. */
  infinite?: boolean;
}

function WheelColumn({ values, selectedIndex, onSelect, width, fontSize, textColor, infinite = false }: WheelColumnProps) {
  const scrollRef = useAnimatedRef<FlatList<WheelListItem>>();
  const len = values.length;

  const fullList = useMemo(() => {
    const copies = infinite ? REPEAT_COUNT : 1;
    const list: WheelListItem[] = [];
    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < len; i++) {
        list.push({ label: values[i], index: c * len + i });
      }
    }
    return list;
  }, [values, len, infinite]);

  const initialExpandedIndex = infinite ? MIDDLE_COPY * len + selectedIndex : selectedIndex;

  const scrollY = useSharedValue(initialExpandedIndex * ITEM_HEIGHT);
  const lastTicked = useSharedValue(initialExpandedIndex);
  const lastExpandedIndex = useSharedValue(initialExpandedIndex);
  const prevScrollY = useSharedValue(initialExpandedIndex * ITEM_HEIGHT);
  const prevScrollT = useSharedValue(0);
  const lastTickTime = useSharedValue(0);

  // Distinguishes "parent echoed our own scroll" (skip re-scroll — may rest
  // in any buffer copy) from a real external change. `null` forces one
  // corrective scrollToOffset on mount, since initialScrollIndex isn't
  // reliable at this list size.
  const lastReportedIndexRef = useRef<number | null>(null);

  function handleColumnSelect(index: number, deltaCycles: number, settleTo: number) {
    lastReportedIndexRef.current = index;
    // Only jump when settleTo is a real target (-1 means the native rest
    // position was already correct) — snapping unconditionally, even to the
    // same spot it's already at, produced a visible little "push" on settle.
    if (settleTo >= 0) {
      scrollRef.current?.scrollToOffset({ offset: settleTo * ITEM_HEIGHT, animated: false });
    }
    onSelect(index, deltaCycles);
  }

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      const idx = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      if (idx !== lastTicked.value) {
        lastTicked.value = idx;

        // Faster scroll → louder tick. Computed here (not the native
        // `velocity` field) since that's unreliable on Android.
        const now = performance.now();
        const dt = now - prevScrollT.value;
        const dy = e.contentOffset.y - prevScrollY.value;
        const velocity = dt > 0 ? Math.abs(dy / dt) : 0;
        prevScrollY.value = e.contentOffset.y;
        prevScrollT.value = now;
        const volume = interpolate(velocity, [0, 2.5], [0.35, 1], Extrapolation.CLAMP);

        // Cap the tick rate (~25/sec) so a fast fling never queues up more
        // JS-thread audio calls than can be drained in real time — otherwise
        // the backlog keeps clicking after the wheel has already stopped.
        if (now - lastTickTime.value >= MIN_TICK_INTERVAL_MS) {
          lastTickTime.value = now;
          // scheduleOnRN(tick, volume);
        }
      }
    },
    onMomentumEnd: (e) => {
      const rawIndex = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      const clampedIndex = infinite ? rawIndex : Math.max(0, Math.min(len - 1, rawIndex));
      const realIndex = infinite ? ((clampedIndex % len) + len) % len : clampedIndex;

      let deltaCycles = 0;
      let settleIndex = clampedIndex;
      if (infinite) {
        deltaCycles = Math.round((clampedIndex - lastExpandedIndex.value) / len);
        lastExpandedIndex.value = clampedIndex;

        // Recenter near either buffer edge — via handleColumnSelect's
        // JS-thread scrollToOffset, since a UI-thread scrollTo here desyncs
        // VirtualizedList's render window and leaves the column blank.
        const copy = Math.floor(clampedIndex / len);
        if (copy <= 1 || copy >= REPEAT_COUNT - 2) {
          settleIndex = MIDDLE_COPY * len + realIndex;
          lastExpandedIndex.value = settleIndex;
        }
      }

      // Only correct the rest position when it actually drifted off the
      // exact row grid (or a recenter is needed) — jumping unconditionally,
      // even back to the same spot, causes a visible little "push" on settle.
      const alreadyAligned = Math.abs(e.contentOffset.y - settleIndex * ITEM_HEIGHT) < 0.5;
      const settleTo = alreadyAligned ? -1 : settleIndex;

      scheduleOnRN(handleColumnSelect, realIndex, deltaCycles, settleTo);
    },
  });

  // Re-sync on external changes (sheet reopening, AM/PM nudging the hour
  // column) — not on infinite columns' own echoed selection. First run snaps
  // instantly; later ones animate.
  useEffect(() => {
    if (infinite && lastReportedIndexRef.current === selectedIndex) return;
    const isInitialMount = lastReportedIndexRef.current === null;
    lastReportedIndexRef.current = selectedIndex;
    const offset = infinite ? (MIDDLE_COPY * len + selectedIndex) * ITEM_HEIGHT : selectedIndex * ITEM_HEIGHT;
    scrollRef.current?.scrollToOffset({ offset, animated: !isInitialMount });
    if (infinite) lastExpandedIndex.value = MIDDLE_COPY * len + selectedIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE_ROWS, width }}>
      <Animated.FlatList
        ref={scrollRef}
        data={fullList}
        renderItem={({ item }) => (
          <WheelItem label={item.label} index={item.index} scrollY={scrollY} fontSize={fontSize} textColor={textColor} />
        )}
        keyExtractor={(item) => String(item.index)}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        initialScrollIndex={initialExpandedIndex}
        initialNumToRender={VISIBLE_ROWS + 2}
        maxToRenderPerBatch={VISIBLE_ROWS + 2}
        windowSize={5}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * HALF }}
      />
    </View>
  );
}

export default function TimerSelectMenu({
  visible,
  onClose,
  onTimeSelect,
  initialDate,
  onConfirm,
  mode = 'time',
  initialMinutes,
  onDurationSelect,
  title,
  embedded = false,
}: TimerSelectMenuProps) {
  const isDuration = mode === 'duration';

  const [hour24, setHour24] = useState(() =>
    isDuration ? Math.floor((initialMinutes ?? 0) / 60) : (initialDate ?? new Date()).getHours(),
  );
  const [minute, setMinute] = useState(() =>
    isDuration ? (initialMinutes ?? 0) % 60 : (initialDate ?? new Date()).getMinutes(),
  );
  const [dayDate, setDayDate] = useState(initialDate ?? new Date());

  // Reset the wheels to the current value every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    if (isDuration) {
      const total = Math.max(0, initialMinutes ?? 0);
      setHour24(Math.floor(total / 60));
      setMinute(total % 60);
    } else {
      const d = initialDate ?? new Date();
      setHour24(d.getHours());
      setMinute(d.getMinutes());
      setDayDate(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isPM = !isDuration && hour24 >= 12;
  const gradientProgress = useSharedValue(isPM ? 1 : 0);
  useEffect(() => {
    gradientProgress.value = withTiming(isPM ? 1 : 0, { duration: 400 });
  }, [isPM, gradientProgress]);

  // Single interpolated gradient rather than two crossfading layers —
  // avoids a visible seam and reads as one continuous day → night sweep.
  const topDotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(gradientProgress.value, [0, 1], [amTop, pmTop]),
  }));
  const sheetGradientStyle = useAnimatedStyle(() => ({
    opacity: gradientProgress.value,
  }));

  // Entrance: fade + scale in place — sliding reads wrong for something
  // that's supposed to simply appear where it sits.
  const centerProgress = useSharedValue(0);

  useEffect(() => {
    if (embedded) return;
    centerProgress.value = withTiming(visible ? 1 : 0, { duration: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, embedded]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: centerProgress.value,
    transform: [{ scale: interpolate(centerProgress.value, [0, 1], [0.92, 1]) }],
  }));

  // Hour wheel starts at "12" so the array's cycle boundary lands between
  // "11" and "12" (12 starts a half-day, doesn't end one) — index 0 ==
  // hour24 % 12.
  const hourValues = isDuration
    ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
    : ['12', ...Array.from({ length: 11 }, (_, i) => String(i + 1).padStart(2, '0'))];
  const hourIndex = isDuration ? hour24 : hour24 % 12;
  const minuteValues = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const headerLabel = useMemo(() => {
    const weekday = dayDate.toLocaleDateString(undefined, { weekday: 'long' });
    const date = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return { weekday, date };
  }, [dayDate]);

  function commitHour(idx: number, deltaCycles = 0) {
    if (isDuration) {
      setHour24(idx);
      if (embedded) onDurationSelect?.(idx * 60 + minute);
      return;
    }
    // Odd wrap count flips AM/PM (± 12h); even count cancels out.
    setHour24((prevHour24) => {
      const currentIsPM = prevHour24 >= 12;
      const flips = ((deltaCycles % 2) + 2) % 2;
      const newIsPM = flips === 1 ? !currentIsPM : currentIsPM;
      return idx + (newIsPM ? 12 : 0);
    });
  }

  function commitMinute(idx: number) {
    setMinute(idx);
    if (isDuration && embedded) onDurationSelect?.(hour24 * 60 + idx);
  }

  function commitPeriod(idx: number) {
    // idx 0 = AM, 1 = PM
    setHour24((hour24 % 12) + (idx === 1 ? 12 : 0));
  }

  function handleDone() {
    if (isDuration) {
      onDurationSelect?.(hour24 * 60 + minute);
      onClose();
      return;
    }
    const d = new Date(initialDate ?? new Date());
    d.setHours(hour24, minute, 0, 0);
    onTimeSelect?.(d);
    onConfirm?.(d);
    onClose();
  }

  const textColor = isDuration ? themeColors.textPrimary : themeColors.white;

  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = windowHeight * 0.6;

  const content = (
    <Animated.View
      style={[
        styles.sheet,
        { maxHeight: sheetMaxHeight },
        isDuration && styles.sheetDuration,
        embedded && styles.sheetEmbedded,
        !embedded && entranceStyle,
      ]}
    >
      {!isDuration && (
        <>
          <LinearGradient
            colors={[amTop, amBottom]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <Animated.View style={[StyleSheet.absoluteFill, sheetGradientStyle]}>
            <LinearGradient
              colors={[pmTop, pmBottom]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </Animated.View>
        </>
      )}

      <View style={styles.header}>
        {isDuration ? (
          <Text style={styles.headerDateDark}>{title ?? 'Select remaining time'}</Text>
        ) : (
          <>
            <Animated.View style={[styles.headerDot, topDotStyle]} />
            <Text style={styles.headerWeekday}>{headerLabel.weekday.toLowerCase()}</Text>
            <Text style={styles.headerDate}> · {headerLabel.date}</Text>
          </>
        )}
      </View>

      <View style={styles.pickerRow}>
        {/* Translucent pill behind the center row, spanning all columns. */}
        <View pointerEvents="none" style={[styles.selectionPill, isDuration && styles.selectionPillDark]} />

        <WheelColumn values={hourValues} selectedIndex={hourIndex} onSelect={commitHour} width={90} fontSize={32} textColor={textColor} infinite />
        <Text style={[styles.colon, isDuration && styles.colonDark]}>:</Text>
        <WheelColumn values={minuteValues} selectedIndex={minute} onSelect={commitMinute} width={90} fontSize={32} textColor={textColor} infinite />
        {!isDuration && (
          <WheelColumn
            values={['AM', 'PM']}
            selectedIndex={isPM ? 1 : 0}
            onSelect={commitPeriod}
            width={64}
            fontSize={18}
            textColor={textColor}
          />
        )}
      </View>

      {/* Embedded host owns its own submit action via onDurationSelect. */}
      {!embedded && (
        <View style={styles.footer}>
          <Pressable style={[styles.doneBtn, isDuration && styles.doneBtnAccent]} onPress={handleDone} hitSlop={10}>
            <Text style={[styles.doneText, isDuration && styles.doneTextLight]}>Confirm</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );

  if (embedded) return content;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.centerWrap} pointerEvents="box-none">
        {content}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,20,0.45)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    position: 'relative',
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    overflow: 'hidden',
    paddingBottom: 28,
  },
  sheetDuration: {
    backgroundColor: themeColors.white,
  },
  sheetEmbedded: {
    position: 'relative',
    borderRadius: 20,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  headerWeekday: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  headerDate: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.white,
  },
  headerDateDark: {
    fontSize: 15,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  selectionPill: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: ITEM_HEIGHT * HALF,
    height: ITEM_HEIGHT,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  selectionPillDark: {
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  itemRow: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontWeight: '700',
    color: themeColors.white,
    fontVariant: ['tabular-nums'],
  },
  colon: {
    fontSize: 32,
    fontWeight: '700',
    color: themeColors.white,
    marginHorizontal: 2,
  },
  colonDark: {
    color: themeColors.textPrimary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  doneBtn: {
    backgroundColor: themeColors.white,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: 'center',
  },
  doneBtnAccent: {
    backgroundColor: themeColors.accent,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.black,
  },
  doneTextLight: {
    color: themeColors.white,
  },
});
