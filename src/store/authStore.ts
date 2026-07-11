// src/store/authStore.ts

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { login as loginRequest, getMe, AuthUser } from '@services/authService';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const LOGIN_TIMESTAMP_KEY = 'auth_login_timestamp';

const OFFLINE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isBootstrapping: boolean;
  isLoggingIn: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isBootstrapping: true,
  isLoggingIn: false,
  error: null,

  // Called once on app launch.
  // Restores cached token/user from SecureStore immediately so the app
  // shows the home screen right away (no login needed while token is valid).
  // Validates the token with the server in the background — only forces
  // logout on an explicit 401, not on network failure.
  bootstrap: async () => {
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (!token || !userJson) {
        set({ isBootstrapping: false });
        return;
      }

      set({ token, user: JSON.parse(userJson), isBootstrapping: false });

      // Background token validation — non-blocking
      try {
        const freshUser = await getMe();
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(freshUser));
        set({ user: freshUser });
      } catch (err: any) {
        if (err?.response?.status === 401) {
          // Token explicitly rejected — force logout
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          await SecureStore.deleteItemAsync(USER_KEY);
          await SecureStore.deleteItemAsync(LOGIN_TIMESTAMP_KEY);
          set({ token: null, user: null });
        }
        // Any other error (no network etc.) — keep cached session as-is
      }
    } catch {
      set({ isBootstrapping: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoggingIn: true, error: null });
    try {
      // Try online login first
      const { token, user } = await loginRequest(email, password);

      // Persist token, user profile, and login timestamp for offline fallback
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, token),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
        SecureStore.setItemAsync(LOGIN_TIMESTAMP_KEY, String(Date.now())),
      ]);

      set({ token, user, isLoggingIn: false });
    } catch (err: any) {
      // If online login failed due to network error, try offline fallback
      const isNetworkError =
        !err?.response &&
        (err?.message?.includes('Network') ||
         err?.message?.includes('network') ||
         err?.code === 'ERR_NETWORK');

      if (isNetworkError) {
        const [cachedToken, cachedUserJson, cachedTimestamp] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
          SecureStore.getItemAsync(LOGIN_TIMESTAMP_KEY),
        ]);

        if (cachedToken && cachedUserJson && cachedTimestamp) {
          const elapsed = Date.now() - Number(cachedTimestamp);
          if (elapsed < OFFLINE_WINDOW_MS) {
            set({
              token: cachedToken,
              user: JSON.parse(cachedUserJson),
              isLoggingIn: false,
              error: null,
            });
            return;
          }
        }
      }

      const message =
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Login failed. Please try again.');
      set({ isLoggingIn: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(LOGIN_TIMESTAMP_KEY),
    ]);
    set({ token: null, user: null });
  },
}));