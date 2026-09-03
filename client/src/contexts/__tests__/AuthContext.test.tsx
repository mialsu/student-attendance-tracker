import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import type { User, AuthResponse } from '@/api/types';

// The context's only collaborator is the API module: the access token lives in memory inside it
// and the refresh token is an HttpOnly cookie the browser owns, so neither is reachable from a
// test. The API module is therefore the seam, and holding it is also what keeps this file off the
// network — the version of this suite it replaces mocked nothing and every run really posted to
// http://localhost:8000.
vi.mock('@/api/auth', () => ({
  authApi: {
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

import { authApi } from '@/api/auth';

const teacher: User = {
  id: 'ac1d0000-0000-0000-0000-000000000001',
  email: 'teacher@example.com',
  active: true,
  created_at: '2026-09-02T00:00:00Z',
};

const authResponse = (user: User): AuthResponse => ({
  access_token: 'an-access-token',
  token_type: 'bearer',
  user,
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const renderAuth = () => renderHook(() => useAuth(), { wrapper });

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with no user', () => {
      const { result } = renderAuth();

      expect(result.current.user).toBeNull();
    });

    it('starts loading, so a guard cannot decide before the session is known', () => {
      // Starting `false` let ProtectedRoute render once with no user and redirect, logging the
      // teacher out on every reload with a perfectly valid session. See REVIEW-DEBT.md, 2026-09-02.
      const { result } = renderAuth();

      expect(result.current.loading).toBe(true);
    });
  });

  describe('checkAuth', () => {
    it('restores the session when the refresh cookie is still good', async () => {
      vi.mocked(authApi.refreshToken).mockResolvedValue({ access_token: 'fresh' });
      vi.mocked(authApi.getCurrentUser).mockResolvedValue(teacher);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.user).toEqual(teacher);
      expect(result.current.loading).toBe(false);
    });

    it('leaves no user when there is no valid cookie', async () => {
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.user).toBeNull();
      expect(authApi.getCurrentUser).not.toHaveBeenCalled();
    });

    it('stops loading even when the refresh fails', async () => {
      // A `loading` that never clears is the same bug as redirecting too early: the guard waits
      // forever instead of showing the login screen.
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.loading).toBe(false);
    });

    it('does not ask again once it has already checked', async () => {
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.checkAuth();
      });
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(authApi.refreshToken).toHaveBeenCalledTimes(1);
    });

    it('does not ask at all when a user is already signed in', async () => {
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(authApi.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('holds the user the API returned', async () => {
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });

      expect(result.current.user).toEqual(teacher);
    });

    it('sends the credentials the caller gave it, unchanged', async () => {
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login('Teacher@Example.com', 'correct-password');
      });

      expect(authApi.login).toHaveBeenCalledWith({
        email: 'Teacher@Example.com',
        password: 'correct-password',
      });
    });

    it('rejects on wrong credentials and signs nobody in', async () => {
      vi.mocked(authApi.login).mockRejectedValue(new Error('401'));

      const { result } = renderAuth();
      await expect(
        act(async () => {
          await result.current.login(teacher.email, 'wrong-password');
        }),
      ).rejects.toThrow();

      expect(result.current.user).toBeNull();
    });

    it('still works after a cold check found no session', async () => {
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.checkAuth();
      });
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });

      expect(result.current.user).toEqual(teacher);
    });
  });

  describe('signup', () => {
    it('holds the user the API returned', async () => {
      vi.mocked(authApi.signup).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signup(teacher.email, 'a-password', 'A1B2C3D4E5F6G7H8');
      });

      expect(result.current.user).toEqual(teacher);
    });

    it('sends the registration code under the name the API expects', async () => {
      // An account cannot be created without a code, and the wire name is snake_case. Getting
      // this wrong fails only against the real API, which no other test in this file touches.
      vi.mocked(authApi.signup).mockResolvedValue(authResponse(teacher));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signup(teacher.email, 'a-password', 'A1B2C3D4E5F6G7H8');
      });

      expect(authApi.signup).toHaveBeenCalledWith({
        email: teacher.email,
        password: 'a-password',
        registration_code: 'A1B2C3D4E5F6G7H8',
      });
    });

    it('rejects a refused code and signs nobody in', async () => {
      vi.mocked(authApi.signup).mockRejectedValue(new Error('400 code already used'));

      const { result } = renderAuth();
      await expect(
        act(async () => {
          await result.current.signup(teacher.email, 'a-password', 'ALREADYUSEDCODE1');
        }),
      ).rejects.toThrow();

      expect(result.current.user).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the user', async () => {
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.logout).mockResolvedValue(undefined);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
    });

    it('lets a later cold check run again', async () => {
      // Logging out has to reopen the question of who is signed in, or the next visitor on this
      // tab inherits the previous answer.
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.logout).mockResolvedValue(undefined);
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await act(async () => {
        await result.current.logout();
      });
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(authApi.refreshToken).toHaveBeenCalledTimes(1);
    });

    it('surfaces a failed logout instead of swallowing it', async () => {
      // CURRENT BEHAVIOUR, not the desired one: the request rejects, so `setUser(null)` never
      // runs and the screen still shows a signed-in teacher whose access token is already gone.
      // Confessed in REVIEW-DEBT.md — this test pins what the code does today so the fix has
      // something to turn red.
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.logout).mockRejectedValue(new Error('network down'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await expect(
        act(async () => {
          await result.current.logout();
        }),
      ).rejects.toThrow();

      expect(result.current.user).toEqual(teacher);
    });
  });

  describe('updateEmail', () => {
    it('replaces the held user with the one the API returned', async () => {
      const renamed = { ...teacher, email: 'new@example.com' };
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.updateEmail).mockResolvedValue(renamed);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await act(async () => {
        await result.current.updateEmail('new@example.com', 'correct-password');
      });

      expect(result.current.user).toEqual(renamed);
    });

    it('proves the current password to the API', async () => {
      vi.mocked(authApi.updateEmail).mockResolvedValue(teacher);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.updateEmail('new@example.com', 'correct-password');
      });

      expect(authApi.updateEmail).toHaveBeenCalledWith('new@example.com', 'correct-password');
    });

    it('leaves the held user alone when the API refuses', async () => {
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.updateEmail).mockRejectedValue(new Error('401 wrong password'));

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await expect(
        act(async () => {
          await result.current.updateEmail('taken@example.com', 'wrong-password');
        }),
      ).rejects.toThrow();

      expect(result.current.user).toEqual(teacher);
    });
  });

  describe('updatePassword', () => {
    it('sends the current and the new password', async () => {
      vi.mocked(authApi.updatePassword).mockResolvedValue(undefined);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.updatePassword('old-password', 'new-password');
      });

      expect(authApi.updatePassword).toHaveBeenCalledWith('old-password', 'new-password');
    });

    it('rejects when the current password is wrong', async () => {
      vi.mocked(authApi.updatePassword).mockRejectedValue(new Error('401'));

      const { result } = renderAuth();
      await expect(
        act(async () => {
          await result.current.updatePassword('wrong-password', 'new-password');
        }),
      ).rejects.toThrow();
    });

    it('keeps this session signed in', async () => {
      // INV-8 ends every session that predates the change — every one except the one that made
      // it. A teacher who changes their password must not be thrown out of the tab they did it in.
      vi.mocked(authApi.login).mockResolvedValue(authResponse(teacher));
      vi.mocked(authApi.updatePassword).mockResolvedValue(undefined);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.login(teacher.email, 'correct-password');
      });
      await act(async () => {
        await result.current.updatePassword('old-password', 'new-password');
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(teacher);
      });
    });
  });

  describe('useAuth', () => {
    it('refuses to be used outside the provider', () => {
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within AuthProvider',
      );
    });
  });
});
