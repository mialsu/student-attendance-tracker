/**
 * `/auth` is a surface `DESIGN.md` §1 lists, so the walk drives the real login form rather than
 * injecting a session.
 *
 * ADR-0005 rejected `storageState` from a setup project for this: the access token is a
 * module-level variable in `src/api/client.ts`, so no saved browser state can carry it, and a
 * generated JSON file that looks like a credential would buy nothing. Signing in costs one click.
 *
 * `/auth` is also the one protected-free surface — neither `Index` nor `ProtectedRoute` wraps it —
 * so a cold visit here makes no auth request at all, and the `/refresh` mock only matters on the
 * way out.
 */
import { SESSION } from './rows';
import { mockJson, oneKurssi } from './mocks';
import { toast } from './assertions';
import { expect, test } from './fixtures';

/**
 * `{ exact: true }` on every label is not tidiness. `getByLabel` matches a substring, and the
 * password field's own show/hide toggle is `aria-label="Näytä salasana"` — so the loose form
 * resolves to two elements and Playwright's strict mode refuses. The toggle is the accessible
 * name the a11y gate wants; the walk has to be specific instead.
 */

test.describe('/auth', () => {
  test('the form is the form on a cold visit, and asks for nothing', async ({ page }) => {
    await page.goto('/auth');

    await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible();
    await expect(page.getByLabel('Sähköposti', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Salasana', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirjaudu', exact: true })).toBeVisible();

    // The hermetic guards assert at teardown that this made no API call and left no origin.
  });

  test('the right password reaches the dashboard', async ({ page }) => {
    await mockJson(page, '**/api/auth/login', SESSION);
    await oneKurssi(page);

    await page.goto('/auth');
    await page.getByLabel('Sähköposti', { exact: true }).fill('opettaja@koulu.fi');
    await page.getByLabel('Salasana', { exact: true }).fill('oikea-salasana');
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Kurssit' })).toBeVisible();
    // Scoped to `main` since slice 3: the sidebar lists the same Kurssi on every signed-in
    // surface, so a bare `getByText` now resolves to two elements and trips strict mode. The
    // assertion still means what it meant — the Kurssi reached the dashboard, not just the nav.
    await expect(page.getByRole('main').getByText('Matematiikka MAA5')).toBeVisible();
  });

  test('a wrong password says so and stays on the form', async ({ page }) => {
    // 401 with the API's own `detail`, which Auth.tsx prefers over its fallback copy.
    await mockJson(page, '**/api/auth/login', { detail: 'Väärä sähköposti tai salasana' }, 401);

    await page.goto('/auth');
    await page.getByLabel('Sähköposti', { exact: true }).fill('opettaja@koulu.fi');
    await page.getByLabel('Salasana', { exact: true }).fill('väärä');
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();

    await expect(toast(page, 'Väärä sähköposti tai salasana')).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
  });

  /*
   * The split-screen, spec 0006 slice 4. These two live in the browser and cannot live anywhere
   * else: the aside's whole behaviour is a media query, and jsdom applies none — the same reason
   * `DESIGN.md`'s A11Y-3 row gives for why the walk caught two nameless controls that the jsdom
   * sweep and jsx-a11y both read as fine.
   *
   * Each project runs one viewport (`playwright.config.ts:58`), either side of `shell` (940px), so
   * the pair below is the same assertion asked twice rather than a resize dance inside one test.
   */
  test('the aside is the panel above shell and the lede alone below it', async ({ page }) => {
    await page.goto('/auth');

    const aside = page.getByRole('complementary');
    const lede = aside.getByText('Kaikki kurssisi samassa näkymässä', { exact: false });

    // The one sentence US-2 turns on survives to 320px. This is the Owner's call of 2026-09-11
    // against the prototype, which hides the aside outright below 940px and leaves a phone with
    // nothing on screen saying what the app is.
    await expect(lede).toBeVisible();

    const wide = page.viewportSize()!.width >= 940;

    // The three function rows and the display line are the desktop half of the aside.
    const functions = aside.getByRole('listitem');
    if (wide) {
      await expect(functions).toHaveCount(3);
      await expect(aside.getByText('Läsnäolojen kirjaus kursseille.')).toBeVisible();
    } else {
      await expect(functions).toHaveCount(0);
      await expect(aside.getByText('Läsnäolojen kirjaus kursseille.')).toBeHidden();
    }
  });

  test('the registration hint states the code rules, and names no role', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: 'Ei tiliä? Rekisteröidy' }).click();

    const code = page.getByLabel('Rekisteröintikoodi', { exact: true });
    await expect(code).toBeVisible();

    // `aria-describedby`, so the rules reach a screen reader on the field rather than only a
    // sighted reader below it.
    await expect(code).toHaveAccessibleDescription(/Kertakäyttöinen, voimassa 24 tuntia/);

    // ADR-0003 deleted the superadmin role, so the prototype's "Saat koodin koulusi
    // pääkäyttäjältä" describes something this app does not have. Asserted as an absence because
    // the next person to copy a string out of prototype/index.html will reach for that line.
    await expect(page.getByText(/pääkäyttäj/i)).toHaveCount(0);
  });

  test('a mock registered in a test outranks the /api guard', async ({ page }) => {
    // Not a product assertion — it pins the ordering the whole fixture file depends on. If
    // Playwright ever matched routes oldest-first, every mock here would be shadowed by the 501
    // guard and every spec would fail in a way that looks like an app bug.
    await mockJson(page, '**/api/auth/login', SESSION);
    await oneKurssi(page);

    const answered: number[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/auth/login')) answered.push(response.status());
    });

    await page.goto('/auth');
    await page.getByLabel('Sähköposti', { exact: true }).fill('opettaja@koulu.fi');
    await page.getByLabel('Salasana', { exact: true }).fill('oikea-salasana');
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    expect(answered).toEqual([200]);
  });
});
