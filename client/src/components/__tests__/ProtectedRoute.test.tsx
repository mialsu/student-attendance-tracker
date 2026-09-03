import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';

// The refresh cookie is HttpOnly and lives in the browser, so the seam a test can hold is the
// API module the context calls. Both calls succeeding IS "a valid session survived a reload".
vi.mock('@/api/auth', () => ({
  authApi: {
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

import { authApi } from '@/api/auth';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>teacher dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>login screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('ProtectedRoute — cold load with a live session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page instead of bouncing to the login screen', async () => {
    // A page reload: nothing in memory, but the refresh cookie still works.
    vi.mocked(authApi.refreshToken).mockResolvedValue(undefined);
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'ac1d0000-0000-0000-0000-000000000001',
      email: 'teacher@example.com',
      active: true,
      created_at: '2026-09-02T00:00:00Z',
    });

    renderAt('/dashboard');

    // The regression this pins: `loading` used to start false, so the first render redirected
    // before checkAuth could run. The refresh then succeeded against a page already gone.
    await waitFor(() => expect(screen.getByText('teacher dashboard')).toBeInTheDocument());
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  it('shows the session check before it resolves, rather than the login screen', () => {
    vi.mocked(authApi.refreshToken).mockReturnValue(new Promise(() => {}));

    renderAt('/dashboard');

    expect(screen.getByText(/Tarkistetaan istuntoa/i)).toBeInTheDocument();
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  it('still sends a genuinely signed-out visitor to the login screen', async () => {
    vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

    renderAt('/dashboard');

    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
    expect(screen.queryByText('teacher dashboard')).not.toBeInTheDocument();
  });
});
