// src/config/env.ts

import { Platform } from 'react-native';

const LOCAL_IP = '192.168.0.107';

function resolveBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Physical device on same WiFi needs the host machine's LAN IP —
      // 10.0.2.2 only works for the Android emulator, not real devices.
      return `http://${LOCAL_IP}:8000/api`;
    }
    // iOS simulator can reach your Mac's localhost directly.
    return 'http://localhost:8000/api';
  }
  // Production
  return 'https://suntech-core-1.onrender.com/api';
}

export const API_BASE_URL = resolveBaseUrl();

// IANA zone name this deployment assumes the device's own OS timezone is set
// to — see toLocalIsoString() in src/utils/formatTime.ts for why that
// assumption matters. Expo exposes EXPO_PUBLIC_*-prefixed vars from .env
// automatically, no extra config needed.
export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE ?? 'Asia/Kolkata';