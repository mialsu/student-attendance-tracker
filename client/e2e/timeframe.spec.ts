/**
 * Spec 0008 AC-16: the timeframe filter, with no mouse at all.
 *
 * A journey rather than a swept state, which is why it is here and not in `states.spec.ts`. That
 * file's table asserts what a state *looks like* — axe, contrast, reflow — and it cannot assert
 * that a control **acts** when Enter reaches it. `core-loop.spec.ts`'s keyboard half is the
 * pattern, and `DESIGN.md` §5's `A11Y-1` and `A11Y-2` are what this enforces on this surface:
 * every control reachable by Tab, reached in the order it is read, and operable once reached.
 *
 * **The calendar is the part worth walking.** Two date pickers are two Radix popovers over a
 * `react-day-picker` grid, and a grid is where keyboard support is most often skipped — the
 * arrow-key roving focus and the Enter that commits are library behaviour this app configures but
 * does not implement, so nothing in the repo proves it until something drives it. jsdom cannot:
 * `ClassStatistics.test.tsx` reaches the same days with `user.click`, which needs no focus at all.
 */
import { KURSSI } from './rows';
import { oneKurssi, register, signedIn, statistics } from './mocks';
import { tabSequence, tabTo } from './assertions';
import { expect, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

const classUrl = `/class/${KURSSI.id}`;

/**
 * Reach *Tilastot* and its filter, by keyboard, the way the tab strip actually works.
 *
 * **Radix Tabs is a roving tabstop, and the first version of this helper got it wrong** — it
 * tabbed toward the *Tilastot* tab and failed with "not reachable by keyboard within 30 Tab
 * presses" on all eight tests. That was the helper being wrong, not the app: only the SELECTED tab
 * is in the tab order, by design and per the ARIA authoring practices. One Tab reaches the strip
 * and lands on whichever tab is selected; arrows move between them. So tabbing to an unselected
 * tab can never work, and a test written that way would demand a keyboard behaviour that would be
 * a WCAG failure if the app had it (three tabs meaning three tab stops).
 */
async function openTilastotByKeyboard(page: Page): Promise<void> {
  /*
   * **Wait for the strip to exist before touching it, and this line is the fix for the original
   * flake.** `page.goto` resolves on the navigation, not on React having rendered — and unlike a
   * locator assertion, `evaluateAll` below does NOT auto-wait: it returns `[]` for a selector that
   * matches nothing yet, silently. So the helper read an empty tab list and failed with
   * "saw: " (nothing), and before that, `tabTo` was pressing Tab thirty times at a page with
   * nothing focusable on it. Both failed only under the load of a full run, because only then was
   * rendering slow enough to lose the race — the signature that sent two earlier fixes after the
   * wrong cause.
   */
  await expect(page.getByRole('tab', { name: 'Tilastot', exact: true })).toBeVisible();

  // The tab names, in DOM order, so the walk to *Tilastot* is computed rather than assumed.
  const names = await page
    .getByRole('tab')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
  const target = names.indexOf('Tilastot');
  expect(target, `Tilastot should be one of the tabs; saw: ${names.join(', ')}`).toBeGreaterThan(-1);

  const selected = page.getByRole('tab', { selected: true });
  const start = names.indexOf(((await selected.textContent()) ?? '').trim());

  // One Tab into the strip, which lands on whichever tab is selected.
  await tabTo(page, selected);

  /*
   * Then arrows, one tab at a time, WAITING for focus to land after each press.
   *
   * **The wait is what makes this deterministic, and its absence flaked twice.** The first version
   * looped `while not focused: press ArrowRight`, re-reading `document.activeElement` straight
   * after each press. Radix moves focus in a React state update, so that read returns the
   * PREVIOUS tab, the loop presses again, and it overshoots — and a Radix tab list **wraps**, so
   * overshooting from the last tab goes back to the first. The failure surfaced as
   * `toBeFocused() failed` in 2 of 3 full runs and never once when this spec ran alone, which is
   * the signature of a race against a state update rather than a bug in the app.
   */
  for (let i = start; i < target; i += 1) {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: names[i + 1], exact: true })).toBeFocused();
  }

  const tilastot = page.getByRole('tab', { name: 'Tilastot', exact: true });
  await expect(tilastot).toBeFocused();

  // Radix defaults to automatic activation, so the arrow that moved focus also selected the tab.
  // Asserting that rather than pressing Enter is the stronger test: it pins the behaviour the
  // app actually has, and an Enter here would pass under either setting and prove neither.
  await expect(tilastot).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByText('Ladataan tilastoja...')).toBeHidden();
  await expect(page.getByLabel('Alkaen')).toBeVisible();
}

/**
 * Open one end's calendar from the keyboard and wait until a day actually holds focus.
 *
 * **The wait is the whole point of this helper, and it exists because its absence flaked.** The
 * clear-action test below used to press `Enter, ArrowLeft, Enter` with nothing in between; it
 * passed on its own and on most full runs, and failed once in `npx playwright test` with every
 * spec loaded. The mechanism: the popover animates in, so under load the `ArrowLeft` lands before
 * the grid is mounted and focused, goes nowhere, and the second `Enter` re-toggles the TRIGGER —
 * closing the calendar instead of committing a day. The trigger then still reads "Valitse
 * päivämäärä" and the assertion fails.
 *
 * `retries: 0` is this walk's claim to determinism, so a keystroke fired at an animating overlay
 * is a defect in the test rather than something to retry away — the same reasoning
 * `states.spec.ts` records for sampling axe mid-transition.
 */
async function openCalendar(page: Page, end: string): Promise<Locator> {
  const trigger = page.getByLabel(end);
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');

  // `aria-expanded` is the trigger's own account of the state, not a visual guess.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const calendar = page.getByRole('dialog');
  await expect(calendar).toBeVisible();

  // `initialFocus` is what puts focus inside the grid. Waiting for it is what makes the next
  // keystroke land on a day rather than on the page.
  await expect(calendar.locator('button[name="day"]:focus')).toHaveCount(1);
  return calendar;
}

test.describe('the timeframe filter, from the keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
    await oneKurssi(page);
    await register(page);
    // Figures whatever the range, so this spec is about operating the control rather than about
    // which rows come back. `states.spec.ts` owns the empty-timeframe state.
    await statistics(page);
    await page.goto(classUrl);
  });

  test('both ends are reachable by Tab, in the order they are read', async ({ page }) => {
    await openTilastotByKeyboard(page);

    // `tabSequence` walks from a blurred start and records what each press reaches, which is the
    // pattern `core-loop.spec.ts` established for A11Y-2 — the ORDER, never an exact count, since
    // an exact number breaks on any layout change and proves nothing about order.
    const order = await tabSequence(page);
    const at = (id: string) => order.indexOf(id);

    expect(
      [at('statistics-date-from'), at('statistics-date-to')],
      `both ends should be reachable by Tab. Order was: ${order.join(' → ')}`,
    ).not.toContain(-1);
    expect(
      at('statistics-date-to'),
      'Päättyen is read after Alkaen and must be reached after it',
    ).toBeGreaterThan(at('statistics-date-from'));
  });

  test('every focused control shows a focus ring', async ({ page }) => {
    await openTilastotByKeyboard(page);

    // A11Y-3's shape: `focus-visible:ring-2` is a class until something proves it renders. Read
    // the computed outline/box-shadow of the real focused element, because a `ring` in Tailwind is
    // a box-shadow and an `outline: none` with no replacement is the failure this catches.
    for (const label of ['Alkaen', 'Päättyen']) {
      const control = page.getByLabel(label);
      await tabTo(page, control);
      await expect(control).toBeFocused();

      const ring = await control.evaluate((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, outline: s.outlineStyle, width: s.outlineWidth };
      });
      const visible =
        (ring.shadow !== 'none' && ring.shadow !== '') ||
        (ring.outline !== 'none' && ring.width !== '0px');
      expect(visible, `${label} must show a visible focus indicator, got ${JSON.stringify(ring)}`).toBe(
        true,
      );
    }
  });

  test('the calendar opens, moves and commits a day without a mouse', async ({ page }) => {
    await openTilastotByKeyboard(page);

    const from = page.getByLabel('Alkaen');
    const calendar = await openCalendar(page, 'Alkaen');

    // A day already holds focus, because `initialFocus` put it there — so the arrows move between
    // days rather than scrolling the page, which is the defect this test exists to catch.
    const before = await calendar.locator('button[name="day"]:focus').textContent();

    await page.keyboard.press('ArrowLeft');
    const after = await calendar.locator('button[name="day"]:focus').textContent();
    expect(after, 'ArrowLeft must move the roving focus to another day').not.toBe(before);

    // And Enter commits it: the trigger stops saying "Valitse päivämäärä" and carries a date.
    await page.keyboard.press('Enter');
    await expect(from).not.toHaveText('Valitse päivämäärä');
    await expect(from).toHaveText(/\d{1,2}\.\d{1,2}\.\d{4}/);
  });

  test('the clear action appears with a range and is operable by keyboard', async ({ page }) => {
    await openTilastotByKeyboard(page);

    // US-5: one action back to the whole Kurssi. It is absent until there is something to clear,
    // so it cannot be tabbed to before a date is picked — assert that first, since an
    // always-present disabled button would pass the rest of this test while failing the intent.
    const clear = page.getByRole('button', { name: 'Tyhjennä aikaväli' });
    await expect(clear).toBeHidden();

    const from = page.getByLabel('Alkaen');
    await openCalendar(page, 'Alkaen');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(from).toHaveText(/\d{1,2}\.\d{1,2}\.\d{4}/);
    await expect(page.getByText('Päivät valitulla aikavälillä')).toBeVisible();

    await expect(clear).toBeVisible();
    await tabTo(page, clear);
    await page.keyboard.press('Enter');

    // Back to the whole Kurssi, from the keyboard alone.
    await expect(from).toHaveText('Valitse päivämäärä');
    await expect(page.getByText('Kaikki päivät, joilta läsnäoloja on kirjattu')).toBeVisible();
    await expect(clear).toBeHidden();
  });
});
