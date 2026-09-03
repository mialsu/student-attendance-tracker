import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should start with no user', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.user).toBeNull();
    });

    it('should load user from localStorage on mount', () => {
      const storedUser = { email: 'test@test.com', isTeacher: true };
      localStorage.setItem('currentUser', JSON.stringify(storedUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.user).toEqual(storedUser);
    });

  });

  describe('signup', () => {
    it('should create new user and set as current user', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.signup('newuser@test.com', 'password123', true);
      });

      expect(success).toBe(true);
      expect(result.current.user).toEqual({
        email: 'newuser@test.com',
        isTeacher: true,
      });

      // Verify stored in localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: 'newuser@test.com',
        password: 'password123',
        isTeacher: true,
      });

      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      expect(currentUser).toEqual({
        email: 'newuser@test.com',
        isTeacher: true,
      });
    });

    it('should prevent signup with duplicate email', async () => {
      const existingUsers = [
        { email: 'existing@test.com', password: 'pass', isTeacher: true },
      ];
      localStorage.setItem('users', JSON.stringify(existingUsers));

      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.signup('existing@test.com', 'newpass', false);
      });

      expect(success).toBe(false);
      expect(result.current.user).toBeNull();

      // Verify no new user was added
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      expect(users).toHaveLength(1);
    });

    it('should allow signup as non-teacher', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signup('student@test.com', 'password', false);
      });

      expect(result.current.user).toEqual({
        email: 'student@test.com',
        isTeacher: false,
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      const users = [
        { email: 'teacher@test.com', password: 'teacherpass', isTeacher: true },
        { email: 'student@test.com', password: 'studentpass', isTeacher: false },
      ];
      localStorage.setItem('users', JSON.stringify(users));
    });

    it('should login with correct credentials', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.login('teacher@test.com', 'teacherpass');
      });

      expect(success).toBe(true);
      expect(result.current.user).toEqual({
        email: 'teacher@test.com',
        isTeacher: true,
      });

      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      expect(currentUser).toEqual({
        email: 'teacher@test.com',
        isTeacher: true,
      });
    });

    it('should fail login with incorrect password', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.login('teacher@test.com', 'wrongpass');
      });

      expect(success).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should fail login with non-existent email', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.login('nonexistent@test.com', 'password');
      });

      expect(success).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should login non-teacher user', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('student@test.com', 'studentpass');
      });

      expect(result.current.user).toEqual({
        email: 'student@test.com',
        isTeacher: false,
      });
    });
  });

  describe('logout', () => {
    it('should clear user and remove from localStorage', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Login first
      await act(async () => {
        await result.current.signup('user@test.com', 'password', true);
      });

      expect(result.current.user).not.toBeNull();

      // Logout
      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('currentUser')).toBeNull();
    });

    it('should handle logout when no user is logged in', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('updateEmail', () => {
    beforeEach(() => {
      const users = [
        { email: 'user@test.com', password: 'password123', isTeacher: true },
        { email: 'other@test.com', password: 'pass', isTeacher: true },
      ];
      localStorage.setItem('users', JSON.stringify(users));
    });

    it('should update email with correct password', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Login first
      await act(async () => {
        await result.current.login('user@test.com', 'password123');
      });

      // Update email
      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateEmail('newemail@test.com', 'password123');
      });

      expect(success).toBe(true);
      expect(result.current.user?.email).toBe('newemail@test.com');

      // Verify updated in localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const updatedUser = users.find((u: { email: string }) => u.email === 'newemail@test.com');
      expect(updatedUser).toBeDefined();
      expect(updatedUser.password).toBe('password123');

      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      expect(currentUser.email).toBe('newemail@test.com');
    });

    it('should fail with incorrect password', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'password123');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateEmail('newemail@test.com', 'wrongpassword');
      });

      expect(success).toBe(false);
      expect(result.current.user?.email).toBe('user@test.com');
    });

    it('should fail if new email is already taken', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'password123');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateEmail('other@test.com', 'password123');
      });

      expect(success).toBe(false);
      expect(result.current.user?.email).toBe('user@test.com');
    });

    it('should fail if user is not logged in', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateEmail('newemail@test.com', 'password');
      });

      expect(success).toBe(false);
    });

    it('should allow updating to same email', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'password123');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateEmail('user@test.com', 'password123');
      });

      expect(success).toBe(true);
      expect(result.current.user?.email).toBe('user@test.com');
    });
  });

  describe('updatePassword', () => {
    beforeEach(() => {
      const users = [
        { email: 'user@test.com', password: 'oldpassword', isTeacher: true },
      ];
      localStorage.setItem('users', JSON.stringify(users));
    });

    it('should update password with correct current password', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'oldpassword');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updatePassword('oldpassword', 'newpassword123');
      });

      expect(success).toBe(true);

      // Verify password updated in localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const user = users.find((u: { email: string }) => u.email === 'user@test.com');
      expect(user.password).toBe('newpassword123');

      // Verify can login with new password
      act(() => {
        result.current.logout();
      });

      await act(async () => {
        success = await result.current.login('user@test.com', 'newpassword123');
      });

      expect(success).toBe(true);
    });

    it('should fail with incorrect current password', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'oldpassword');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updatePassword('wrongpassword', 'newpassword');
      });

      expect(success).toBe(false);

      // Verify password unchanged
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const user = users.find((u: { email: string }) => u.email === 'user@test.com');
      expect(user.password).toBe('oldpassword');
    });

    it('should fail if user is not logged in', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updatePassword('oldpassword', 'newpassword');
      });

      expect(success).toBe(false);
    });

    it('should maintain user session after password update', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@test.com', 'oldpassword');
      });

      await act(async () => {
        await result.current.updatePassword('oldpassword', 'newpassword');
      });

      // User should still be logged in
      expect(result.current.user).not.toBeNull();
      expect(result.current.user?.email).toBe('user@test.com');
    });
  });

  describe('Error handling', () => {
    it('should throw error when useAuth is used outside AuthProvider', () => {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within AuthProvider');
    });
  });

  describe('Multiple users flow', () => {
    it('should handle multiple users signing up and logging in', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // First user signs up
      await act(async () => {
        await result.current.signup('user1@test.com', 'pass1', true);
      });
      expect(result.current.user?.email).toBe('user1@test.com');

      // Logout
      act(() => {
        result.current.logout();
      });

      // Second user signs up
      await act(async () => {
        await result.current.signup('user2@test.com', 'pass2', false);
      });
      expect(result.current.user?.email).toBe('user2@test.com');
      expect(result.current.user?.isTeacher).toBe(false);

      // Logout and first user logs in
      act(() => {
        result.current.logout();
      });

      await act(async () => {
        await result.current.login('user1@test.com', 'pass1');
      });
      expect(result.current.user?.email).toBe('user1@test.com');
      expect(result.current.user?.isTeacher).toBe(true);

      // Verify both users in localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      expect(users).toHaveLength(2);
    });
  });
});
