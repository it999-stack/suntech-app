// src/services/apiClient.ts

import axios from 'axios';
import { API_BASE_URL } from '../config/env';
import { useAuthStore } from '../store/authStore';

// Shared axios instance — use this for every authenticated call
// (piles, checklists, sync push/pull), not just auth, so the token
// is attached automatically everywhere.
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  // Read lazily at request time (not at import time) to avoid a
  // circular-import issue with authStore, which itself uses authService.
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});