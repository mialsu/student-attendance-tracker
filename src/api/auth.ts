import { apiClient, setAccessToken, clearTokens } from './client';
import type { User, AuthTokens, LoginRequest, SignupRequest } from './types';

export const authApi = {
  async signup(data: SignupRequest): Promise<{ user: User } & AuthTokens> {
    const response = await apiClient.post('/api/auth/signup', data);
    setAccessToken(response.data.access_token);
    return response.data;
  },

  async login(data: LoginRequest): Promise<{ user: User } & AuthTokens> {
    const response = await apiClient.post('/api/auth/login', data);
    setAccessToken(response.data.access_token);
    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      clearTokens();
    }
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  async updateEmail(newEmail: string, currentPassword: string): Promise<User> {
    const response = await apiClient.put('/api/auth/email', {
      new_email: newEmail,
      current_password: currentPassword,
    });
    return response.data;
  },

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.put('/api/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  async refreshToken(): Promise<{ access_token: string }> {
    const response = await apiClient.post('/api/auth/refresh');
    setAccessToken(response.data.access_token);
    return response.data;
  },
};
