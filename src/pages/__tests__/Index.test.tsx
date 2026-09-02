import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Index from '../Index';
import { AuthProvider } from '@/contexts/AuthContext';

vi.mock('@/api/auth', () => ({
  authApi: {
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

import { authApi } from '@/api/auth';

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<div>teacher dashboard</div>} />
          <Route path="/auth" element={<div>login screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('Index — where "/" sends you', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-14: sends a signed-in teacher to the teacher dashboard', async () => {
    // A cold load with a live refresh cookie: bookmark, typed address, shared link.
    vi.mocked(authApi.refreshToken).mockResolvedValue(undefined);
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'ac140000-0000-0000-0000-000000000001',
      email: 'teacher@example.com',
      active: true,
      created_at: '2026-09-02T00:00:00Z',
    });

    renderLanding();

    await waitFor(() => expect(screen.getByText('teacher dashboard')).toBeInTheDocument());
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login screen', async () => {
    vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('no refresh cookie'));

    renderLanding();

    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
    expect(screen.queryByText('teacher dashboard')).not.toBeInTheDocument();
  });

  it('decides nothing while the session check is still running', () => {
    vi.mocked(authApi.refreshToken).mockReturnValue(new Promise(() => {}));

    renderLanding();

    // Neither destination yet. Redirecting before the answer arrives is the bug this pins.
    expect(screen.queryByText('teacher dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });
});
