import { apiClient } from './client';
import type { RegistrationCode } from './types';

export interface CreateRegistrationCodeRequest {
  email_restriction: string;
}

export const adminApi = {
  async getRegistrationCodes(): Promise<RegistrationCode[]> {
    const response = await apiClient.get('/api/admin/codes');
    return response.data;
  },

  async createRegistrationCode(data: CreateRegistrationCodeRequest): Promise<RegistrationCode> {
    const response = await apiClient.post('/api/admin/codes', data);
    return response.data;
  },

  async revokeRegistrationCode(codeId: string): Promise<void> {
    await apiClient.delete(`/api/admin/codes/${codeId}`);
  },
};
