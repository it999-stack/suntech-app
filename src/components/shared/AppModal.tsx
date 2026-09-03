// src/components/shared/AppModal.tsx

import React, { forwardRef, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ViewStyle,
  Platform,
  Dimensions,
} from 'react-native';
// RN core's KeyboardAvoidingView tracks the keyboard via JS-side `Keyboard`
// events + Android window-resize heuristics, which is unreliable inside a
// <Modal> — the modal's own window doesn't always get the same resize
// behavior the Activity root does, so the sheet can end up not shrinking
// enough and the keyboard covers/cuts off its bottom content. This one
// (backed by react-native-keyboard-controller's native keyboard tracking,
// already provided app-wide via KeyboardProvider in App.tsx) is a drop-in
// replacement that measures the real keyboard height directly.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { useModalHost } from '@components/shared/ModalHost';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DEFAULT_TOP_OFFSET = Platform.OS === 'ios' ? 64 : 44;
// Swipe-down-to-dismiss thresholds for the header/grabber drag zone.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

let modalIdCounter = 0;

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  position?: 'bottom' | 'top' | 'center';
  topOffset?: number;
  scrollable?: boolean;
  avoidKeyboard?: boolean;
  /** Set false to hide the header's X close button — e.g. when a caller wants
   * swipe-down-to-dismiss to be the only way to close. Defaults to true; the
   * drag gesture itself is unaffected either way. */
  showCloseButton?: boolean;
  /** Custom content for the header's trailing slot (next to the title, where
   * the close button normally sits) — e.g. a small status pill. Renders
   * alongside the close button when both are present; most callers pairing
   * this with showCloseButton={false} to use that slot exclusively. */
  headerRight?: React.ReactNode;
}

/** Renders nothing itself — registers its sheet content into the single
 * shared ModalHost (see ModalHost.tsx) instead of rendering its own native
 * <Modal>, so any number of AppModal instances open at once (e.g. one
 * opening another) become layers inside ONE native window instead of
 * stacking independent native windows, which is what used to make closing
 * an inner one able to break/close the outer one on Android. */
export default forwardRef<ScrollView, Props>(function AppModal(
  {
    visible,
    onClose,
    title,
    subtitle,
    children,
    contentContainerStyle,
    position = 'bottom',
    topOffset = DEFAULT_TOP_OFFSET,
    scrollable = true,
    avoidKeyboard = true,
    showCloseButton = true,
    headerRight,
  },
  scrollRef,
) {
  const isTop = position === 'top';
  const isCenter = position === 'center';
  const hiddenValue = isTop ? -SCREEN_HEIGHT : SCREEN_HEIGHT;

  const translateY = useSharedValue(hiddenValue);
  const centerProgress = useSharedValue(0);

  useEffect(() => {
    if (isCenter) {
      centerProgress.value = withTiming(visible ? 1 : 0, { duration: 220 });
    } else {
      translateY.value = withTiming(visible ? 0 : hiddenValue, { duration: 260 });
    }
  }, [visible, hiddenValue, isCenter, centerProgress, translateY]);

  const dragGesture = Gesture.Pan()
    .enabled(!isTop && !isCenter)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const shouldDismiss = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(hiddenValue, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => {
    if (isCenter) {
      return {
        opacity: centerProgress.value,
        transform: [{ scale: interpolate(centerProgress.value, [0, 1], [0.92, 1]) }],
      };
    }
    return { transform: [{ translateY: translateY.value }] };
  });

  const content = (
    <KeyboardAvoidingView
      style={styles.flexContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={avoidKeyboard}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View
        style={isCenter ? styles.centerWrap : styles.flexContainer}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            isCenter ? styles.sheetCenter : isTop ? [styles.sheetTop, { top: topOffset }] : styles.sheetBottom,
            sheetAnimatedStyle,
          ]}
        >
          <GestureDetector gesture={dragGesture}>
            <View>
              {!isTop && !isCenter && <View style={styles.grabber} />}

              {(title || subtitle || headerRight) && (
                <View style={styles.headerRow}>
                  <View style={styles.headerTextWrap}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                  </View>
                  {headerRight}
                  {showCloseButton && (
                    <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                      <X size={18} color={colors.textSecondary} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </GestureDetector>

          {scrollable ? (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.scrollContent, contentContainerStyle]}>{children}</View>
          )}

          {isTop && <View style={styles.grabberTop} />}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );

  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) idRef.current = `app-modal-${++modalIdCounter}`;
  const { push, remove } = useModalHost();

  // Re-registers on every render while visible so the host always holds
  // current content/closures (not a stale snapshot from first open) —
  // removes itself the moment visible turns false. No dependency array is
  // intentional here: content is a fresh element every render.
  useEffect(() => {
    if (visible) {
      push(idRef.current!, content, onClose);
    } else {
      remove(idRef.current!);
    }
  });

  // Separate mount-only effect purely for the unmount case — a no-deps
  // effect's own cleanup would fire before every re-render too (removing
  // and immediately re-adding on each render), which this avoids.
  useEffect(() => {
    return () => remove(idRef.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
});

const styles = StyleSheet.create({
  flexContainer: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,20,0.4)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.white,
    maxHeight: '85%',
    paddingTop: spacing.sm,
    ...shadow.soft,
  },
  sheetBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetTop: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  sheetCenter: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(28,28,46,0.15)',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  grabberTop: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(28,28,46,0.15)',
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerTextWrap: { flex: 1, marginRight: spacing.sm },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
