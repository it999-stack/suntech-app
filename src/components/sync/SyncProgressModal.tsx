// src/components/sync/SyncProgressModal.tsx
// Shows live sync progress inside AppModal: a progress bar, the step
// currently running, and a checklist of completed/pending steps.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Check, X as XIcon, RefreshCw } from 'lucide-react-native';
import AppModal from '@/components/shared/AppModal';
import { colors, spacing, radius, typography } from '../../theme/theme';
import { useSyncStore } from '../../store/syncStore';
import { getStepDoneLabel, TOTAL_SYNC_STEPS } from '../../sync/stepLabels';
import { BOOTSTRAP_STEPS } from '../../sync/bootstrap/stepRegistry';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function SpinningIcon() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <RefreshCw size={13} color={colors.accent} />
    </Animated.View>
  );
}

export default function SyncProgressModal({ visible, onClose }: Props) {
  const { currentStep, completedSteps, isSyncing, error } = useSyncStore();

  const doneCount = completedSteps.length;
  const progressPct = Math.min(100, Math.round((doneCount / TOTAL_SYNC_STEPS) * 100));

  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progressPct,
      duration: 300,
      useNativeDriver: false, // width isn't a native-driver-supported property
    }).start();
  }, [progressPct]);

  const completedNames = new Set(completedSteps.map((s) => s.step));

  return (
    <AppModal visible={visible} onClose={onClose} title={isSyncing ? 'Syncing your site' : 'Sync complete'}>
      <View style={styles.headerRow}>
        <Text style={styles.headerCount}>
          {doneCount} of {TOTAL_SYNC_STEPS}
        </Text>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            },
            error ? styles.fillError : null,
          ]}
        />
      </View>

      <View style={styles.stepList}>
        {BOOTSTRAP_STEPS.map((step) => {
          const stepName = step.name;
          const result = completedSteps.find((s) => s.step === stepName);
          const isDone = completedNames.has(stepName);
          const isActive = !isDone && currentStep === stepName;
          const failed = !!result?.error;

          return (
            <View key={stepName} style={styles.stepRow}>
              {isDone ? (
                <View style={[styles.stepIcon, failed ? styles.stepIconError : styles.stepIconDone]}>
                  {failed ? (
                    <XIcon size={11} color={colors.danger} />
                  ) : (
                    <Check size={11} color={colors.textInverse} />
                  )}
                </View>
              ) : isActive ? (
                <View style={styles.stepIconActive}>
                  <SpinningIcon />
                </View>
              ) : (
                <View style={styles.stepIconPending} />
              )}

              <Text
                style={[
                  styles.stepLabel,
                  isActive ? styles.stepLabelActive : null,
                  !isDone && !isActive ? styles.stepLabelPending : null,
                  failed ? styles.stepLabelError : null,
                ]}
              >
                {getStepDoneLabel(stepName)}
                {failed ? ' — failed' : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.xs,
  },
  headerCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  fillError: {
    backgroundColor: colors.danger,
  },
  stepList: {
    gap: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stepIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: colors.accent,
  },
  stepIconError: {
    backgroundColor: colors.dangerSoft,
  },
  stepIconActive: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconPending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(28,28,46,0.15)',
  },
  stepLabel: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
  },
  stepLabelActive: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepLabelPending: {
    color: colors.textSecondary,
    opacity: 0.6,
  },
  stepLabelError: {
    color: colors.danger,
  },
});