// src/components/shared/TimerSelectMenu.tsx
//
// Rounded bottom-sheet 12-hour time picker: hour / minute / AM-PM wheels
// over a gradient sheet that crossfades between a "day" and "night" theme
// as the selected hour changes. Header shows the selected day and date.
// A translucent pill sits behind the center row, and a single accent
// "Confirm" button sits at the bottom.
//
// Usage:
//   const [visible, setVisible] = useState(false);
//   const [selectedTime, setSelectedTime] = useState(new Date());
//
//   <TimerSelectMenu
//     visible={visible}
//     onClose={() => setVisible(false)}
//     onTimeSelect={(date) => setSelectedTime(date)}
//     initialDate={selectedTime}
//   />

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Dimensions, FlatList } from 'react-native';
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
import * as Haptics from 'expo-haptics';
import { colors as themeColors } from '@theme/theme';

const ITEM_HEIGHT = 84;
const VISIBLE_ROWS = 3;
const HALF = Math.floor(VISIBLE_ROWS / 2);

type WheelListItem = { label: string; index: number };

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.6;

// Day (AM) theme: near-black fading into blue.
// Night (PM) theme: blue fading into grey.
// Tweak these to reskin — e.g. swap in your theme's colors.accent for a
// branded look instead of the reference's literal blue.
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

function tick() {
  Haptics.selectionAsync();
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
  onSelect: (index: number) => void;
  width: number;
  fontSize: number;
  textColor: string;
}

function WheelColumn({ values, selectedIndex, onSelect, width, fontSize, textColor }: WheelColumnProps) {
  const scrollRef = useAnimatedRef<FlatList<WheelListItem>>();
  const len = values.length;

  // A finite list keeps the picker light: only the actual hour/minute/period
  // values exist, with no duplicated rows or infinite-scroll recentering.
  const fullList = useMemo(() => {
    return values.map((label, index) => ({ label, index }));
  }, [values, len]);

  const scrollY = useSharedValue(selectedIndex * ITEM_HEIGHT);
  const lastTicked = useSharedValue(selectedIndex);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      const idx = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      if (idx !== lastTicked.value) {
        lastTicked.value = idx;
        scheduleOnRN(tick);
      }
    },
    onMomentumEnd: (e) => {
      const index = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      scheduleOnRN(onSelect, Math.max(0, Math.min(len - 1, index)));
    },
  });

  // Keep the wheel synced when the value is changed from outside
  // (e.g. AM/PM toggle nudging the hour column).
  useEffect(() => {
    scrollRef.current?.scrollToOffset({
      offset: selectedIndex * ITEM_HEIGHT,
      animated: true,
    });
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
        initialScrollIndex={selectedIndex}
        initialNumToRender={VISIBLE_ROWS + 2}
        maxToRenderPerBatch={VISIBLE_ROWS + 2}
        windowSize={5}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
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

  const displayHour12 = ((hour24 + 11) % 12) + 1; // 1-12 (time mode)

  const hourValues = isDuration
    ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
    : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const hourIndex = isDuration ? hour24 : displayHour12 - 1;
  const minuteValues = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const headerLabel = useMemo(() => {
    const weekday = dayDate.toLocaleDateString(undefined, { weekday: 'long' });
    const date = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return { weekday, date };
  }, [dayDate]);

  function commitHour(idx: number) {
    if (isDuration) {
      setHour24(idx);
      if (embedded) onDurationSelect?.(idx * 60 + minute);
      return;
    }
    const newHour12 = idx + 1; // 1-12
    setHour24((newHour12 % 12) + (isPM ? 12 : 0));
  }

  function commitMinute(idx: number) {
    setMinute(idx);
    if (isDuration && embedded) onDurationSelect?.(hour24 * 60 + idx);
  }

  function commitPeriod(idx: number) {
    // idx 0 = AM, 1 = PM
    setHour24((displayHour12 % 12) + (idx === 1 ? 12 : 0));
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

  const textColor = isDuration ? themeColors.textPrimary : '#ffffff';

  const content = (
    <View style={[styles.sheet, isDuration && styles.sheetDuration, embedded && styles.sheetEmbedded]}>
      {!isDuration && (
        <>
          {/* Base (day) gradient, always present */}
          <LinearGradient
            colors={[amTop, amBottom]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          {/* Night gradient fades in on top as the hour crosses noon */}
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

      {!embedded && <View style={[styles.grabber, isDuration && styles.grabberDark]} />}

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
        {/* Translucent selection pill behind the center row, spanning
            the full width so all columns read as one continuous strip. */}
        <View pointerEvents="none" style={[styles.selectionPill, isDuration && styles.selectionPillDark]} />

        <WheelColumn values={hourValues} selectedIndex={hourIndex} onSelect={commitHour} width={90} fontSize={32} textColor={textColor} />
        <Text style={[styles.colon, isDuration && styles.colonDark]}>:</Text>
        <WheelColumn values={minuteValues} selectedIndex={minute} onSelect={commitMinute} width={90} fontSize={32} textColor={textColor} />
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

      {/* Embedded usage reports live via onDurationSelect as the wheels move —
          the host owns its own submit action, so no internal button here. */}
      {!embedded && (
        <View style={styles.footer}>
          <Pressable style={[styles.doneBtn, isDuration && styles.doneBtnAccent]} onPress={handleDone} hitSlop={10}>
            <Text style={[styles.doneText, isDuration && styles.doneTextLight]}>Confirm</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (embedded) return content;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,20,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SHEET_MAX_HEIGHT,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  grabberDark: {
    backgroundColor: 'rgba(28,28,46,0.15)',
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
    color: '#ffffff',
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
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  colon: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
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
    backgroundColor: '#ffffff',
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
    color: '#000000',
  },
  doneTextLight: {
    color: themeColors.white,
  },
});
