// src/config/env.ts

import { Platform } from 'react-native';

const DEV_ANDROID_HOST = process.env.EXPO_PUBLIC_DEV_ANDROID_HOST ?? '192.168.0.110';

function resolveBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return `http://${DEV_ANDROID_HOST}:8000/api`;
    }
    return 'http://localhost:8000/api';
  }
  // Production
  return 'https://suntech-core-1.onrender.com/api';
}

export const API_BASE_URL = resolveBaseUrl();

export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE ?? 'Asia/Kolkata';