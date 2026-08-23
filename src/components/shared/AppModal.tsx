// src/components/shared/AppModal.tsx

import React, { forwardRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DEFAULT_TOP_OFFSET = Platform.OS === 'ios' ? 64 : 44;
// Swipe-down-to-dismiss thresholds for the header/grabber drag zone.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

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
}

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

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flexContainer}>
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

                {(title || subtitle) && (
                  <View style={styles.headerRow}>
                    <View style={styles.headerTextWrap}>
                      {title && <Text style={styles.title}>{title}</Text>}
                      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    </View>
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
      </GestureHandlerRootView>
    </Modal>
  );
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