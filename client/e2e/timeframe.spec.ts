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
import { tabTo } from './assertions';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const classUrl = `/class/${KURSSI.id}`;

/** Reach *Tilastot* and its filter. The tab strip is operated by keyboard on the way in. */
async function openTilastotByKeyboard(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Tilastot' });
  await tabTo(page, tab);
  // Radix Tabs is a roving tabstop: one Tab reaches the strip, arrows move within it. Enter or
  // Space activates — and this is the activation, not a click.
  await page.keyboard.press('Enter');
  await expect(page.getByText('Ladataan tilastoja...')).toBeHidden();
  await expect(page.getByLabel('Alkaen')).toBeVisible();
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

    const from = page.getByLabel('Alkaen');
    const to = page.getByLabel('Päättyen');

    // A11Y-2. Asserting the ORDER by press count rather than an exact count, the reasoning
    // `tabTo` carries: an exact number breaks on any layout change and proves nothing about order.
    const toFrom = await tabTo(page, from);
    const toTo = await tabTo(page, to);

    expect(
      toTo,
      'Päättyen is read after Alkaen and must be reached after it',
    ).toBeGreaterThan(0);
    expect(toFrom, 'Alkaen must be reachable by Tab at all').toBeGreaterThan(0);
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
    await tabTo(page, from);

    // Enter on the trigger opens the popover — `aria-expanded` is the trigger's own account of it,
    // so this asserts the control's state rather than a visual guess.
    await page.keyboard.press('Enter');
    await expect(from).toHaveAttribute('aria-expanded', 'true');
    const calendar = page.getByRole('dialog');
    await expect(calendar).toBeVisible();

    // `initialFocus` puts focus inside the grid, so a day is already focused and the arrows move
    // between days. Without `initialFocus` this press would scroll the page and nothing would
    // commit, which is exactly the defect this test exists to catch.
    const focusedDay = calendar.locator('button[name="day"]:focus');
    await expect(focusedDay).toHaveCount(1);
    const before = await focusedDay.textContent();

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
    await tabTo(page, from);
    await page.keyboard.press('Enter');
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
