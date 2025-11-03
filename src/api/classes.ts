import { apiClient } from './client';
import type { Class } from './types';

export interface CreateClassRequest {
  name: string;
  description?: string;
}

export interface UpdateClassRequest {
  name?: string;
  description?: string;
  active?: boolean;
}

export const classesApi = {
  async getAll(skip = 0, limit = 100): Promise<Class[]> {
    const response = await apiClient.get('/api/classes', {
      params: { skip, limit },
    });
    return response.data;
  },

  async getById(id: string): Promise<Class> {
    const response = await apiClient.get(`/api/classes/${id}`);
    return response.data;
  },

  async create(data: CreateClassRequest): Promise<Class> {
    const response = await apiClient.post('/api/classes', data);
    return response.data;
  },

  async update(id: string, data: UpdateClassRequest): Promise<Class> {
    const response = await apiClient.put(`/api/classes/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/classes/${id}`);
  },
};
