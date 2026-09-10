// src/config/env.ts

import { Platform } from 'react-native';

const DEV_ANDROID_HOST = process.env.EXPO_PUBLIC_DEV_ANDROID_HOST ?? '192.168.0.110';

/** The deployed backend a release build talks to. Staging today; production
 * gets its own droplet later, at which point this becomes the production URL
 * and staging builds set EXPO_PUBLIC_API_BASE_URL instead. */
const STAGING_API_BASE_URL = 'https://staging.suntechinfra.com:8443/api';

const API_BASE_URL_OVERRIDE = process.env.EXPO_PUBLIC_API_BASE_URL;

function resolveBaseUrl() {
  if (API_BASE_URL_OVERRIDE) return API_BASE_URL_OVERRIDE;
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return `http://${DEV_ANDROID_HOST}:8000/api`;
    }
    return 'http://localhost:8000/api';
  }
  return STAGING_API_BASE_URL;
}

export const API_BASE_URL = resolveBaseUrl();

export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE ?? 'Asia/Kolkata';