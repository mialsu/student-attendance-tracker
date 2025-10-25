import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import Auth from '@/pages/Auth';

describe('Authentication Flow Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should allow user to sign up as a teacher', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    // Switch to signup mode
    const switchButton = screen.getByRole('button', { name: /ei tiliä\? rekisteröidy/i });
    await user.click(switchButton);

    // Fill in signup form
    const emailInput = screen.getByLabelText('Sähköposti');
    const passwordInput = screen.getByLabelText('Salasana');

    await user.type(emailInput, 'teacher@test.com');
    await user.type(passwordInput, 'password123');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /rekisteröidy/i });
    await user.click(submitButton);

    // Verify user was created in localStorage
    await waitFor(() => {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: 'teacher@test.com',
        password: 'password123',
        isTeacher: true,
      });
    });
  });

  it('should allow user to log in with existing credentials', async () => {
    const user = userEvent.setup();

    // Create a user first
    const existingUsers = [
      {
        email: 'existing@test.com',
        password: 'existingpass',
        isTeacher: true,
      },
    ];
    localStorage.setItem('users', JSON.stringify(existingUsers));

    render(<Auth />);

    // Fill in login form
    const emailInput = screen.getByLabelText('Sähköposti');
    const passwordInput = screen.getByLabelText('Salasana');

    await user.type(emailInput, 'existing@test.com');
    await user.type(passwordInput, 'existingpass');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /^kirjaudu$/i });
    await user.click(submitButton);

    // Verify current user was set in localStorage
    await waitFor(() => {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      expect(currentUser).toMatchObject({
        email: 'existing@test.com',
        isTeacher: true,
      });
    });
  });

  it('should prevent duplicate email signup', async () => {
    const user = userEvent.setup();

    // Create existing user
    const existingUsers = [
      {
        email: 'existing@test.com',
        password: 'password',
        isTeacher: true,
      },
    ];
    localStorage.setItem('users', JSON.stringify(existingUsers));

    render(<Auth />);

    // Switch to signup
    const switchButton = screen.getByRole('button', { name: /ei tiliä\? rekisteröidy/i });
    await user.click(switchButton);

    // Try to signup with existing email
    const emailInput = screen.getByLabelText('Sähköposti');
    const passwordInput = screen.getByLabelText('Salasana');

    await user.type(emailInput, 'existing@test.com');
    await user.type(passwordInput, 'newpassword');

    const submitButton = screen.getByRole('button', { name: /rekisteröidy/i });
    await user.click(submitButton);

    // Verify no new user was created
    await waitFor(() => {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      expect(users).toHaveLength(1);
    });
  });

  it('should toggle between login and signup modes', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    // Initially in login mode
    expect(screen.getByRole('heading', { name: /kirjaudu sisään/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /kirjaudu/i }).length).toBeGreaterThan(0);

    // Switch to signup
    const toSignupButton = screen.getByRole('button', { name: /ei tiliä\? rekisteröidy/i });
    await user.click(toSignupButton);

    expect(screen.getByRole('heading', { name: /rekisteröidy/i })).toBeInTheDocument();

    // Switch back to login
    const toLoginButton = screen.getByRole('button', { name: /on jo tili\? kirjaudu/i });
    await user.click(toLoginButton);

    expect(screen.getByRole('heading', { name: /kirjaudu sisään/i })).toBeInTheDocument();
  });
});
