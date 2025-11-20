import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type CreateRegistrationCodeRequest } from '@/api/admin';
import type { RegistrationCode } from '@/api/types';

export const useRegistrationCodes = () => {
  return useQuery<RegistrationCode[]>({
    queryKey: ['registrationCodes'],
    queryFn: () => adminApi.getRegistrationCodes(),
  });
};

export const useCreateRegistrationCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRegistrationCodeRequest) => adminApi.createRegistrationCode(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrationCodes'] });
    },
  });
};

export const useRevokeRegistrationCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (codeId: string) => adminApi.revokeRegistrationCode(codeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrationCodes'] });
    },
  });
};
