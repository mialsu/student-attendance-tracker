import { apiClient } from './client';
import type { Student, StudentAutocomplete, PaginatedStudentResponse } from './types';

export interface CreateStudentRequest {
  name: string;
  course_credit_received?: boolean;
}

export interface UpdateStudentRequest {
  name?: string;
  course_credit_received?: boolean;
}

export interface MergeStudentsRequest {
  duplicate_student_id: string;
}

export interface ListStudentsParams {
  skip?: number;
  limit?: number;
  search?: string;
  credit_filter?: boolean;
}

export const studentsApi = {
  async list(classId: string, params?: ListStudentsParams): Promise<PaginatedStudentResponse> {
    const response = await apiClient.get(`/api/classes/${classId}/students`, { params });
    return response.data;
  },

  async getAutocomplete(classId: string, query: string, limit: number = 10): Promise<StudentAutocomplete[]> {
    const response = await apiClient.get(
      `/api/classes/${classId}/students/autocomplete`,
      { params: { query, limit } }
    );
    return response.data;
  },

  async update(studentId: string, data: UpdateStudentRequest): Promise<Student> {
    const response = await apiClient.put(`/api/students/${studentId}`, data);
    return response.data;
  },

  async delete(studentId: string): Promise<void> {
    await apiClient.delete(`/api/students/${studentId}`);
  },

  async merge(targetStudentId: string, duplicateStudentId: string): Promise<Student> {
    const response = await apiClient.post(
      `/api/students/${targetStudentId}/merge`,
      { duplicate_student_id: duplicateStudentId }
    );
    return response.data;
  },
};
