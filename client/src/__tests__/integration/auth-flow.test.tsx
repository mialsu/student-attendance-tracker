import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import Auth from '@/pages/Auth';
import type { AuthResponse, User } from '@/api/types';

// Three seams, and each is something the page hands off rather than owns: the API module (the
// auth context's only collaborator), the router's navigate, and the toast. Everything between
// them — the form, its validation, the mode toggle — is the code under test.
const { navigate, toast } = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn() }));

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import { authApi } from '@/api/auth';

const teacher: User = {
  id: 'ac1d0000-0000-0000-0000-000000000001',
  email: 'teacher@example.com',
  active: true,
  created_at: '2026-09-02T00:00:00Z',
};

const authResponse: AuthResponse = {
  access_token: 'an-access-token',
  token_type: 'bearer',
  user: teacher,
};

// Codes are issued from the command line and the field asks for sixteen characters.
const CODE = 'TEST-CODE-000001';

describe('Authentication flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const toSignup = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /ei tiliä\? rekisteröidy/i }));

  const fillSignup = async (
    user: ReturnType<typeof userEvent.setup>,
    { email, password, confirm, code }: {
      email: string;
      password: string;
      confirm?: string;
      code?: string;
    },
  ) => {
    await user.type(screen.getByLabelText('Sähköposti'), email);
    await user.type(screen.getByLabelText('Salasana'), password);
    await user.type(screen.getByLabelText('Vahvista salasana'), confirm ?? password);
    if (code) await user.type(screen.getByLabelText('Rekisteröintikoodi'), code);
  };

  it('signs a teacher up with a registration code', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockResolvedValue(authResponse);

    render(<Auth />);
    await toSignup(user);
    await fillSignup(user, { email: teacher.email, password: 'password123', code: CODE });
    await user.click(screen.getByRole('button', { name: /^rekisteröidy$/i }));

    await waitFor(() => {
      expect(authApi.signup).toHaveBeenCalledWith({
        email: teacher.email,
        password: 'password123',
        registration_code: CODE,
      });
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('logs an existing teacher in', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue(authResponse);

    render(<Auth />);
    await user.type(screen.getByLabelText('Sähköposti'), teacher.email);
    await user.type(screen.getByLabelText('Salasana'), 'password123');
    await user.click(screen.getByRole('button', { name: /^kirjaudu$/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: teacher.email,
        password: 'password123',
      });
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the reason and stays put when the code is refused', async () => {
    const user = userEvent.setup();
    // What the API actually says when a code has already been redeemed (INV-6, single use).
    vi.mocked(authApi.signup).mockRejectedValue({
      response: { data: { detail: 'Registration code has already been used' } },
    });

    render(<Auth />);
    await toSignup(user);
    await fillSignup(user, { email: teacher.email, password: 'password123', code: CODE });
    await user.click(screen.getByRole('button', { name: /^rekisteröidy$/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Virhe',
          description: 'Registration code has already been used',
          variant: 'destructive',
        }),
      );
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when a failed login carries no detail', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(new Error('Network Error'));

    render(<Auth />);
    await user.type(screen.getByLabelText('Sähköposti'), teacher.email);
    await user.type(screen.getByLabelText('Salasana'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^kirjaudu$/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Virhe',
          description: 'Väärä sähköposti tai salasana',
          variant: 'destructive',
        }),
      );
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('never reaches the API with a malformed email', async () => {
    // The inline message from validateEmail is NOT what stops this. The field is type="email"
    // and required, so the browser's own constraint validation refuses to submit the form and
    // handleSubmit never runs — which leaves that message reachable only for the gap between
    // native validation and the stricter regex (`a@b` passes one and fails the other).
    // Confessed in REVIEW-DEBT.md. What is worth asserting is the guarantee that holds: a
    // malformed address does not become a request.
    const user = userEvent.setup();

    render(<Auth />);
    await toSignup(user);
    await fillSignup(user, { email: 'invalid-email', password: 'password123', code: CODE });
    await user.click(screen.getByRole('button', { name: /^rekisteröidy$/i }));

    expect(authApi.signup).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses mismatched passwords before calling the API', async () => {
    const user = userEvent.setup();

    render(<Auth />);
    await toSignup(user);
    await fillSignup(user, {
      email: teacher.email,
      password: 'password123',
      confirm: 'password456',
      code: CODE,
    });
    await user.click(screen.getByRole('button', { name: /^rekisteröidy$/i }));

    await waitFor(() => {
      expect(screen.getByText(/salasanat eivät täsmää/i)).toBeInTheDocument();
    });
    expect(authApi.signup).not.toHaveBeenCalled();
  });

  it('toggles between login and signup', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    expect(screen.getByRole('heading', { name: /kirjaudu sisään/i })).toBeInTheDocument();

    await toSignup(user);
    expect(screen.getByRole('heading', { name: /rekisteröidy/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Rekisteröintikoodi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /takaisin kirjautumiseen/i }));
    expect(screen.getByRole('heading', { name: /kirjaudu sisään/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Rekisteröintikoodi')).not.toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<Auth />);
    await toSignup(user);

    const passwordInput = screen.getByLabelText('Salasana') as HTMLInputElement;
    const confirmPasswordInput = screen.getByLabelText('Vahvista salasana') as HTMLInputElement;

    expect(passwordInput.type).toBe('password');
    expect(confirmPasswordInput.type).toBe('password');

    await user.click(screen.getAllByRole('button', { name: /näytä salasana/i })[0]);
    expect(passwordInput.type).toBe('text');

    await user.click(screen.getByRole('button', { name: /piilota salasana/i }));
    expect(passwordInput.type).toBe('password');
  });

  it('clears every field when switching modes, the code included', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    await toSignup(user);
    await fillSignup(user, { email: teacher.email, password: 'password123', code: CODE });

    await user.click(screen.getByRole('button', { name: /takaisin kirjautumiseen/i }));
    await toSignup(user);

    expect((screen.getByLabelText('Sähköposti') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Salasana') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Vahvista salasana') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Rekisteröintikoodi') as HTMLInputElement).value).toBe('');
  });

  /**
   * The in-flight state, which this form did not have. Measured in the browser before it was
   * written: two clicks on *Kirjaudu* sent two `POST /api/auth/login`. `DESIGN.md:151` says
   * "button disables" for both modes of this surface, and §3 states the convention every other
   * mutation in the app already follows. One `<Button type="submit">` serves both modes
   * (`Auth.tsx:279`), so the two tests below are the two branches of one control.
   */
  const neverSettles = <T,>() => new Promise<T>(() => {});

  it('disables its submit while a login is in flight, so a double click posts once', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockReturnValue(neverSettles<AuthResponse>());

    render(<Auth />);
    await user.type(screen.getByLabelText('Sähköposti'), teacher.email);
    await user.type(screen.getByLabelText('Salasana'), 'password123');
    await user.click(screen.getByRole('button', { name: /^kirjaudu$/i }));

    const pending = await screen.findByRole('button', { name: 'Kirjaudutaan...' });
    expect(pending).toBeDisabled();

    // fireEvent, not userEvent: `disabled:pointer-events-none` makes userEvent refuse the click
    // as unreachable, which would assert the CSS rather than the guard.
    fireEvent.click(pending);
    await waitFor(() => expect(authApi.login).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('disables its submit while a signup is in flight, so a double click posts once', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockReturnValue(neverSettles<AuthResponse>());

    render(<Auth />);
    await toSignup(user);
    await fillSignup(user, { email: teacher.email, password: 'password123', code: CODE });
    await user.click(screen.getByRole('button', { name: /^rekisteröidy$/i }));

    const pending = await screen.findByRole('button', { name: 'Rekisteröidään...' });
    expect(pending).toBeDisabled();

    fireEvent.click(pending);
    await waitFor(() => expect(authApi.signup).toHaveBeenCalledTimes(1));
  });
});
