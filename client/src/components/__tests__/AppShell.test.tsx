/**
 * The app shell: spec 0006 slice 3, US-6 and US-7.
 *
 * These four things are here because **nothing else in the harness can prove them**, and that is
 * the whole selection rule for this file:
 *
 * 1. **The drawer opens and closes below 940px.** The browser walk sweeps the drawer *open* at
 *    320px, but a sweep is a snapshot: it cannot assert that the trigger is absent above the
 *    breakpoint, and a trigger that is merely `shell:hidden` would still be tabbable. Width comes
 *    from `vi.mock('@/hooks/useMediaQuery')`, the convention `surfaces.a11y.test.tsx` and
 *    `StudentLogs.legacy.test.tsx` already use, and which `use-mobile.tsx` now routes through.
 * 2. **The drawer has an accessible name.** The walk provably cannot catch this: axe's
 *    `aria-dialog-name` is tagged `best-practice`, and `e2e/assertions.ts` runs only `wcag2a`,
 *    `wcag2aa`, `wcag21a` and `wcag21aa` — the nameless version of this drawer swept clean.
 * 3. **The current location is marked** (US-7). `aria-current="page"` is a property, not a
 *    pixel; axe has no opinion on whether the *right* item carries it.
 * 4. **The course list never claims "no courses" when the request failed.** The quiet form of the
 *    defect slice 1 closed on three surfaces — and `QueryErrorState`'s `role="alert"` is
 *    deliberately absent here, so `error-states.test.tsx` would not see it either.
 *
 * Mocked at the hook seam, like its neighbours. Nothing reaches the network; `src/test/setup.ts`
 * fails the test if it tries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { TeacherLayout } from '@/components/layouts/TeacherLayout';
import * as useClassesHooks from '@/hooks/useClasses';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';
import type { Class } from '@/api/types';

vi.mock('@/hooks/useClasses');
vi.mock('@/hooks/useMediaQuery');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// TeacherLayout's account chip reads the auth context, whose only collaborator is this module.
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

const KURSSI: Class = {
  id: 'kurssi-1',
  name: 'Matematiikka MAA5',
  description: null,
  teacher_id: 'teacher-1',
  active: true,
  created_at: '2025-11-03T08:00:00Z',
  updated_at: null,
  attendance_count: 50,
  student_count: 25,
};

const asClasses = (v: unknown) => v as ReturnType<typeof useClassesHooks.useClasses>;

/** `narrow` drives `useMediaQuery`, which `useIsMobile` — and so the whole shell — reads. */
function renderShell({ narrow = false, classes = asClasses({ data: [KURSSI], isLoading: false }) } = {}) {
  vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(narrow);
  vi.mocked(useClassesHooks.useClasses).mockReturnValue(classes);
  return render(
    <TeacherLayout breadcrumbs={[{ label: 'Kurssit' }]}>
      <p>surface</p>
    </TeacherLayout>,
  );
}

describe('the app shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/dashboard');
  });

  describe('the off-canvas drawer', () => {
    it('has no trigger above the shell breakpoint, where the sidebar is simply there', () => {
      renderShell({ narrow: false });

      expect(screen.queryByRole('button', { name: 'Avaa valikko' })).not.toBeInTheDocument();
      // The nav is present without being opened — that is what "persistent" means.
      expect(screen.getByRole('link', { name: /Kaikki kurssit/ })).toBeInTheDocument();
    });

    it('opens from the trigger and closes on Escape below it', async () => {
      const user = userEvent.setup();
      renderShell({ narrow: true });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Avaa valikko' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('names itself, so it is not announced as an unlabelled dialog', async () => {
      const user = userEvent.setup();
      renderShell({ narrow: true });

      await user.click(screen.getByRole('button', { name: 'Avaa valikko' }));

      expect(screen.getByRole('dialog', { name: 'Valikko' })).toBeInTheDocument();
    });

    it('closes itself when a course is chosen, instead of covering the surface it opened', async () => {
      const user = userEvent.setup();
      renderShell({ narrow: true });

      await user.click(screen.getByRole('button', { name: 'Avaa valikko' }));
      const drawer = screen.getByRole('dialog');
      await user.click(within(drawer).getByRole('link', { name: /Matematiikka MAA5/ }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('the course list', () => {
    it('marks the current location and nothing else (US-7)', () => {
      window.history.pushState({}, '', `/class/${KURSSI.id}`);
      renderShell();

      expect(screen.getByRole('link', { name: /Matematiikka MAA5/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: /Kaikki kurssit/ })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('marks the dashboard when that is where you are', () => {
      renderShell();

      expect(screen.getByRole('link', { name: /Kaikki kurssit/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('gives the count a unit, so a bare number cannot be read as attendances', () => {
      renderShell();

      // The visible text is "Matematiikka MAA5" and "25"; the name says what 25 counts. Asserted
      // as the whole name rather than a loose match, because the defect this caught was a
      // *missing separator* — "Matematiikka MAA525opiskelijaa" would satisfy a sloppier regex.
      expect(
        screen.getByRole('link', { name: 'Matematiikka MAA5, 25 opiskelijaa' }),
      ).toBeInTheDocument();
    });

    it('drops the count rather than inventing one when the API omits it', () => {
      renderShell({
        classes: asClasses({
          data: [{ ...KURSSI, student_count: undefined }],
          isLoading: false,
        }),
      });

      expect(screen.getByRole('link', { name: 'Matematiikka MAA5' })).toBeInTheDocument();
    });

    it('says the courses could not be loaded rather than that there are none', () => {
      renderShell({
        classes: asClasses({ data: undefined, isLoading: false, error: new Error('boom') }),
      });

      expect(screen.getByText('Kursseja ei voitu ladata')).toBeInTheDocument();
      // The assertion that matters: the empty sentence is the one the old code would have shown.
      expect(screen.queryByText('Ei kursseja')).not.toBeInTheDocument();
    });

    it('says there are none when there are genuinely none', () => {
      renderShell({ classes: asClasses({ data: [], isLoading: false }) });

      expect(screen.getByText('Ei kursseja')).toBeInTheDocument();
      expect(screen.queryByText('Kursseja ei voitu ladata')).not.toBeInTheDocument();
    });
  });

  it('keeps logging out reachable, which the prototype sidebar had dropped', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /Tili/ }));

    expect(screen.getByRole('menuitem', { name: /Kirjaudu ulos/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Asetukset/ })).toBeInTheDocument();
  });
});
