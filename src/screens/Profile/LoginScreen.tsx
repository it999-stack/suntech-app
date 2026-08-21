// src/screens/LoginScreen.tsx

import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react-native';

import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { useAuthStore } from '@store/authStore';
import KeyboardAwareScreen from '@/components/shared/KeyboardAwareScreen';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../../assets/android-icon-foreground.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Sign In To Your Account</Text>
              <Text style={styles.subtitle}>
                Sign in to track and manage your machines
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHandle} />
              <Text style={styles.cardLabel}>Login</Text>

              <View style={styles.fieldWrap}>
                <View style={styles.fieldIconWrap}>
                  <Mail size={16} color={colors.accent} />
                </View>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter Your Email Address"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isLoggingIn}
                  style={styles.fieldInput}
                />
              </View>

              <View style={styles.fieldWrap}>
                <View style={styles.fieldIconWrap}>
                  <Lock size={16} color={colors.accent} />
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter Your Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  editable={!isLoggingIn}
                  style={styles.fieldInput}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  {showPassword ? (
                    <EyeOff size={18} color={colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={colors.textSecondary} />
                  )}
                </Pressable>
              </View>

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
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAwareScreen>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl + spacing.md,
    paddingBottom: spacing.xl,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  logoImage: {
    width: 88,
    height: 88,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl + spacing.sm,
    borderTopRightRadius: radius.xl + spacing.sm,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    ...shadow.glass,
  },
  cardHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  cardLabel: {
    ...typography.h2,
    color: colors.textPrimary,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },

  fieldWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: '#F5F5F8',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },

  errorBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
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
    width: '100%',
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    height: 52,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.buttonLabel,
    color: colors.textInverse,
  },
});
