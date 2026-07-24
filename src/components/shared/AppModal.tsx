// src/components/shared/AppModal.tsx

import React, { useEffect } from 'react';
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
  /** Anchors the sheet to the top or bottom of the screen. Defaults to 'bottom'. */
  position?: 'bottom' | 'top';
  /** For position="top": distance from the screen top, clearing the status bar / notch. */
  topOffset?: number;
  /**
   * Set false to render children in a plain View instead of a ScrollView —
   * required when children contain their own FlatList/VirtualizedList (e.g.
   * a wheel picker), since nesting same-orientation VirtualizedLists inside
   * a ScrollView breaks touch handling. Defaults to true.
   */
  scrollable?: boolean;
}

export default function AppModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  contentContainerStyle,
  position = 'bottom',
  topOffset = DEFAULT_TOP_OFFSET,
  scrollable = true,
}: Props) {
  const isTop = position === 'top';
  const hiddenValue = isTop ? -SCREEN_HEIGHT : SCREEN_HEIGHT;
  const translateY = useSharedValue(hiddenValue);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : hiddenValue, { duration: 260 });
  }, [visible, hiddenValue, translateY]);

  // Swipe-down-to-dismiss, scoped to the grabber/header zone only — the
  // scrollable body below keeps its own native scroll untouched, so there's
  // no gesture arbitration needed between this and the content ScrollView.
  // Bottom sheets only (a "top" popover would need the opposite direction).
  const dragGesture = Gesture.Pan()
    .enabled(!isTop)
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

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      {/* RN's Modal renders into its own native root, which the app-level
          GestureHandlerRootView (in App.tsx) doesn't extend into — without
          this, the drag gesture below silently does nothing inside a Modal. */}
      <GestureHandlerRootView style={styles.flexContainer}>
      <KeyboardAvoidingView
        style={styles.flexContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            isTop ? [styles.sheetTop, { top: topOffset }] : styles.sheetBottom,
            sheetAnimatedStyle,
          ]}
        >
          <GestureDetector gesture={dragGesture}>
            <View>
              {!isTop && <View style={styles.grabber} />}

              {(title || subtitle) && (
                <View style={styles.headerRow}>
                  <View style={styles.headerTextWrap}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                  </View>
                  <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                    <X size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              )}
            </View>
          </GestureDetector>

          {scrollable ? (
            <ScrollView
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
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

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