// src/config/env.ts

import { Platform } from 'react-native';

const LOCAL_IP = '192.168.0.106';

function resolveBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Physical device on same WiFi needs the host machine's LAN IP —
      // 10.0.2.2 only works for the Android emulator, not real devices.
      return `http://${LOCAL_IP}:4000/api`;
    }
    // iOS simulator can reach your Mac's localhost directly.
    return 'http://localhost:4000/api';
  }
  // Production
  return 'https://suntech-core.onrender.com/api';
}

export const API_BASE_URL = resolveBaseUrl();