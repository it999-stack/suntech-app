// src/config/env.ts

import { Platform } from 'react-native';

const LOCAL_IP = '192.168.0.106';

function resolveBaseUrl() {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return `http://${LOCAL_IP}:8000/api`;
      // return "https://suntech-core-1.onrender.com/api";
    }
    return 'http://localhost:8000/api';
  }
  // Production
  return 'https://suntech-core-1.onrender.com/api';
}

export const API_BASE_URL = resolveBaseUrl();

export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE ?? 'Asia/Kolkata';