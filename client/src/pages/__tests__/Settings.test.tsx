/**
 * `/settings` — the two account forms, and the state neither of them had.
 *
 * The surface had **no test file at all** before slice 7, which is how both of these survived:
 *
 * 1. **Neither submit disabled while its request was in flight.** Measured in the browser first,
 *    at both viewports: three clicks on *Tallenna sähköposti* sent three `PUT /api/auth/email`,
 *    and two on *Tallenna salasana* sent two `PUT /api/auth/password`. `DESIGN.md:149` has
 *    asserted "button disables" since the states table was written, and §3 states the convention
 *    outright — "a mutation disables its own control and says what it is doing". Every other
 *    mutation in this app already does (`AttendanceTracking.tsx:389`, `TeacherDashboard.tsx:211`,
 *    four in `StudentLogs.tsx`); the four that go through `AuthContext` did not, because they are
 *    plain `async` functions rather than TanStack mutations.
 * 2. **Tabs hid half the surface.** `prototype/index.html:735` draws two stacked cards, both
 *    forms on screen at once; the shipped page put them behind a two-tab bar. The Owner chose the
 *    cards on 2026-09-11.
 *
 * Rendered inside `ProtectedRoute` with `@/api/auth` mocked — the session seam the rest of this
 * repo uses — rather than by stubbing `useAuth`. That is not ceremony: `Settings.tsx` reads
 * `user.email` unguarded, so a mocked context would let the file render in a state the real route
 * cannot produce, and the mutation under test runs through the real context either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import Settings from '@/pages/Settings';
import ProtectedRoute from '@/components/ProtectedRoute';
import * as useClassesHooks from '@/hooks/useClasses';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';
import type { User } from '@/api/types';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/useClasses');
vi.mock('@/hooks/useMediaQuery');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

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

import { authApi } from '@/api/auth';

const TEACHER: User = {
  id: 'ac1d0000-0000-0000-0000-000000000001',
  email: 'opettaja@koulu.fi',
  active: true,
  created_at: '2026-09-02T00:00:00Z',
};

const asClasses = (v: unknown) => v as ReturnType<typeof useClassesHooks.useClasses>;

/** A request that is accepted and never answered — how an in-flight state is held still. */
const neverSettles = <T,>() => new Promise<T>(() => {});

/** The real session path: ProtectedRoute runs checkAuth, which refreshes then reads /me. */
async function renderSettings() {
  vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(false);
  vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses({ data: [], isLoading: false }));
  vi.mocked(authApi.refreshToken).mockResolvedValue({ access_token: 'an-access-token' });
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(TEACHER);

  const result = render(
    <ProtectedRoute>
      <Settings />
    </ProtectedRoute>,
  );
  expect(await screen.findByRole('heading', { name: 'Asetukset', level: 1 })).toBeInTheDocument();
  return result;
}

describe('/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/settings');
  });

  it('shows both forms at once, so neither is behind a tab', async () => {
    await renderSettings();

    expect(screen.getByLabelText('Uusi sähköposti')).toBeVisible();
    expect(screen.getByLabelText('Uusi salasana')).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('disables the email submit while its PUT is in flight, so a double click sends one', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.updateEmail).mockReturnValue(neverSettles<User>());

    await renderSettings();
    // `clear` first, and it is load-bearing: the field arrives prefilled with the current
    // address, so typing into it appends. That makes the value two addresses joined, which is
    // invalid for `type="email"` — and the browser's own constraint validation then refuses the
    // submit before React sees it, silently. Without this line the test fails with the handler
    // never having run at all.
    await user.clear(screen.getByLabelText('Uusi sähköposti'));
    await user.type(screen.getByLabelText('Uusi sähköposti'), 'uusi@koulu.fi');
    await user.type(screen.getByLabelText('Vahvista salasanallasi'), 'salasana123');
    await user.click(screen.getByRole('button', { name: 'Tallenna sähköposti' }));

    const pending = await screen.findByRole('button', { name: 'Tallennetaan...' });
    expect(pending).toBeDisabled();

    // fireEvent, not userEvent: `disabled:pointer-events-none` makes userEvent refuse the click
    // as unreachable, which would assert the CSS rather than the guard.
    fireEvent.click(pending);
    await waitFor(() => expect(authApi.updateEmail).toHaveBeenCalledTimes(1));
  });

  it('disables the password submit while its PUT is in flight, so a double click sends one', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.updatePassword).mockReturnValue(neverSettles<void>());

    await renderSettings();
    await user.type(screen.getByLabelText('Nykyinen salasana'), 'vanha-salasana');
    await user.type(screen.getByLabelText('Uusi salasana'), 'uusi-salasana');
    await user.type(screen.getByLabelText('Vahvista uusi salasana'), 'uusi-salasana');
    await user.click(screen.getByRole('button', { name: 'Tallenna salasana' }));

    const pending = await screen.findByRole('button', { name: 'Tallennetaan...' });
    expect(pending).toBeDisabled();

    fireEvent.click(pending);
    await waitFor(() => expect(authApi.updatePassword).toHaveBeenCalledTimes(1));
  });
});
