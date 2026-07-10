// src/services/authService.ts
import { apiClient } from './apiClient';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  modules: string[];
  siteId?: string;
  siteName?: string;
};

export type LoginResult = {
  token: string;
  user: AuthUser;
};

/**
 * POST /api/auth/login
 * Body: { email, password } → { access_token, user: { id, name, email, role, modules } }
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const response = await apiClient.post('/auth/login', { email, password });
  const { access_token, user } = response.data;
  return { token: access_token, user };
}

/**
 * GET /api/auth/me — validates the cached token is still active.
 * Bearer token is attached automatically by the apiClient interceptor.
 */
export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get('/auth/me');
  return response.data;
}
