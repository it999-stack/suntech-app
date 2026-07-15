// src/screens/LoginScreen.tsx

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HardHat, AlertCircle } from 'lucide-react-native';

import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { useAuthStore } from '@store/authStore';
import KeyboardAwareScreen from '@/components/shared/KeyboardAwareScreen';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoggingIn, error } = useAuthStore();

  const handleLogin = () => {
    login(email, password).catch(() => {
      // error is already captured in the store and shown below
    });
  };

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAwareScreen>
          <View style={styles.content}>
            <View style={styles.logoWrap}>
              <HardHat size={32} color={colors.accent} />
            </View>
            <Text style={styles.title}>Suntech</Text>

            <View style={styles.cardShadowWrap}>
              <BlurView intensity={40} tint="light" style={styles.cardBlur}>
                <View style={styles.cardInner}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@company.com"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!isLoggingIn}
                    style={styles.input}
                  />

                  <Text style={[styles.label, { marginTop: spacing.md }]}>Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    editable={!isLoggingIn}
                    style={styles.input}
                  />

                  {error && (
                    <View style={styles.errorBox}>
                      <AlertCircle size={16} color={colors.danger} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={handleLogin}
                    disabled={isLoggingIn}
                    style={({ pressed }) => [
                      styles.button,
                      (pressed || isLoggingIn) && styles.buttonPressed,
                    ]}
                  >
                    {isLoggingIn ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={styles.buttonText}>Sign in</Text>
                    )}
                  </Pressable>
                </View>
              </BlurView>
            </View>
          </View>
        </KeyboardAwareScreen>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.pageTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },

  cardShadowWrap: {
    borderRadius: radius.xl,
    ...shadow.glass,
  },
  cardBlur: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cardInner: {
    backgroundColor: colors.glassFillStrong,
    padding: spacing.lg,
  },

  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },

  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    height: 48,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.buttonLabel,
    color: colors.textInverse,
  },
});