// src/config/env.ts

import { Platform } from 'react-native';

const LOCAL_IP = '192.168.1.XX';

function resolveBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Android emulator can't reach your PC via "localhost" — it needs
      // this special alias that maps to the host machine.
      return 'http://10.0.2.2:4000/api';
      // If testing on a PHYSICAL Android device on the same Wi-Fi instead
      // of the emulator, use LOCAL_IP here instead of 10.0.2.2.
    }
    // iOS simulator can reach your Mac's localhost directly.
    return 'http://localhost:4000/api';
  }
  // Production
  return 'https://suntech-core.onrender.com/api';
}

export const API_BASE_URL = resolveBaseUrl();