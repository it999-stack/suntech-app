// src/navigation/RootNavigator.tsx

// src/navigation/RootNavigator.tsx
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { colors, spacing } from '@theme/theme';
import MainTabNavigator from '@navigation/MainTabNavigator';
import AuthStackNavigator from '@navigation/AuthStackNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SplashScreen({ message }: { message?: string }) {
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.splash}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      {message && <Text style={styles.splashText}>{message}</Text>}
    </LinearGradient>
  );
}

export default function RootNavigator() {
  const { token, isBootstrapping, bootstrap } = useAuthStore();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return <SplashScreen />;
  }

  // SYNC DISABLED — isSyncingInitialData will always be false until
  // bootstrap sync is re-enabled. Keeping the check commented out
  // so it's easy to restore when sync endpoints are ready.
  // if (isSyncingInitialData) {
  //   return <SplashScreen message="Setting up your workspace…" />;
  // }

  const isLoggedIn = !!token;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStackNavigator} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  splashText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});