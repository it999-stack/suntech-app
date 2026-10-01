// src/config/env.ts

// __DEV__ picks the backend: EXPO_PUBLIC_API_BASE_URL_DEV in a dev build,
// EXPO_PUBLIC_API_BASE_URL once you make a release build.
const API_BASE_URL_VALUE = __DEV__
  ? process.env.EXPO_PUBLIC_API_BASE_URL_DEV
  : process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL_VALUE) {
  const missing = __DEV__ ? 'EXPO_PUBLIC_API_BASE_URL_DEV' : 'EXPO_PUBLIC_API_BASE_URL';
  throw new Error(`${missing} is not set — add it to .env`);
}

export const API_BASE_URL = API_BASE_URL_VALUE;

export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE ?? 'Asia/Kolkata';
