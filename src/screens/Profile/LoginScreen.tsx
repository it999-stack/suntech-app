// src/screens/LoginScreen.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HardHat } from 'lucide-react-native';

import { colors, spacing, radius, typography, shadow } from '../../theme/theme';
import { useAuthStore } from '../../store/authStore';

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
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
                    style={styles.input}
                  />

                  <Text style={[styles.label, { marginTop: spacing.md }]}>Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    style={styles.input}
                  />

                  {error && <Text style={styles.errorText}>{error}</Text>}

                  <Pressable
                    onPress={handleLogin}
                    disabled={isLoggingIn}
                    style={({ pressed }) => [
                      styles.button,
                      (pressed || isLoggingIn) && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>
                      {isLoggingIn ? 'Signing in…' : 'Sign in'}
                    </Text>
                  </Pressable>
                </View>
              </BlurView>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },

  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.buttonLabel,
    color: colors.textInverse,
  },
});