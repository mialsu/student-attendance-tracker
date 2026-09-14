/**
 * The core loop, twice: once with a mouse and once with no mouse at all.
 *
 * `DESIGN.md` §2 defines it — open the app, the Kurssi, *Läsnäolon kirjaus*, type a name,
 * autocomplete offers previous Students by frequency, set a quantity, the toast confirms and the
 * field clears. It is the flow the application exists for, and the one a teacher runs dozens of
 * times a week.
 *
 * The keyboard half is `A11Y-1` and `A11Y-2`'s enforcer, which `DESIGN.md` §5 had as
 * `live:keyboard-walk` — a real check that ran when someone remembered. It asserts three things
 * prose cannot: every control is *reachable* by Tab, the order it is reached in matches the order
 * it is read in, and Enter *acts* on it.
 *
 * Both halves assert the POST body rather than only the toast. "Läsnäolo kirjattu" proves the
 * screen reacted; only the request proves the Kurssi was told the right name and the right count.
 */
import { KURSSI, SUGGESTIONS } from './rows';
import { attendanceLogging, oneKurssi, register, signedIn } from './mocks';
import { tabSequence, tabTo, toast } from './assertions';
import { expect, test } from './fixtures';

const classUrl = `/class/${KURSSI.id}`;

test.describe('the core loop', () => {
  test('with a mouse: autocomplete by frequency, a quantity, and the field clears', async ({
    page,
  }) => {
    await signedIn(page);
    await oneKurssi(page);
    await register(page);
    const { posted } = await attendanceLogging(page);

    // The whole way in, from the dashboard, because the loop starts there.
    await page.goto('/dashboard');
    await page.getByText(KURSSI.name).first().click();
    await expect(page.getByText('Kirjaa opiskelijan läsnäolo')).toBeVisible();

    const name = page.getByLabel('Opiskelijan nimi', { exact: true });
    await name.fill('Li');

    // Frequency order is part of the feature: 15 attendances before 13 before 1.
    const options = page.getByRole('option');
    await expect(options).toHaveCount(SUGGESTIONS.length);
    await expect(options).toHaveText([
      new RegExp(`${SUGGESTIONS[0]!.name}.*15`),
      new RegExp(`${SUGGESTIONS[1]!.name}.*13`),
      new RegExp(`${SUGGESTIONS[2]!.name}.*1`),
    ]);

    await options.first().click();
    await expect(name).toHaveValue(SUGGESTIONS[0]!.name);

    await page.getByLabel('Määrä', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Kirjaa läsnäolo' }).click();

    await expect(toast(page, 'Läsnäolo kirjattu')).toBeVisible();
    expect(posted).toEqual([
      expect.objectContaining({ student_name: SUGGESTIONS[0]!.name, quantity: 3 }),
    ]);

    // "the toast confirms and the field clears" — DESIGN.md §2, both halves.
    await expect(name).toHaveValue('');
    await expect(page.getByLabel('Määrä', { exact: true })).toHaveValue('1');
  });

  test('with no mouse: reachable in reading order, and Enter acts', async ({ page }) => {
    await signedIn(page);
    await oneKurssi(page);
    await register(page);
    const { posted } = await attendanceLogging(page);

    await page.goto(classUrl);
    await expect(page.getByText('Kirjaa opiskelijan läsnäolo')).toBeVisible();

    const name = page.getByLabel('Opiskelijan nimi', { exact: true });
    const quantity = page.getByLabel('Määrä', { exact: true });

    // A11Y-2: the form's controls come in the order they are read — date, name, quantity, submit.
    const order = await tabSequence(page);
    const at = (id: string) => order.indexOf(id);

    expect(
      [at('attendance-date'), at('studentName'), at('quantity')],
      `every control should be reachable by Tab. Order was: ${order.join(' → ')}`,
    ).not.toContain(-1);
    expect(
      at('studentName'),
      'the name field is read after the date picker and must be reached after it',
    ).toBeGreaterThan(at('attendance-date'));
    expect(
      at('quantity'),
      'the quantity is read after the name and must be reached after it',
    ).toBeGreaterThan(at('studentName'));
    expect(
      order.findIndex((entry) => entry.includes('Kirjaa läsnäolo')),
      'the submit button is read last and must be reached last',
    ).toBeGreaterThan(at('quantity'));

    // A11Y-1: operable, not merely reachable. Type into the name field from the keyboard, dismiss
    // the suggestions with Escape, and let Enter in the quantity field do the submit.
    await tabTo(page, name);
    await page.keyboard.type('Väinö Nieminen');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option')).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(quantity).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');

    await expect(toast(page, 'Läsnäolo kirjattu')).toBeVisible();
    expect(posted).toEqual([
      expect.objectContaining({ student_name: 'Väinö Nieminen', quantity: 2 }),
    ]);
    await expect(name).toHaveValue('');
  });

  /**
   * AC4 / US-13, and the half the test above cannot reach. It types a whole name and dismisses
   * the list with Escape, which was the only keyboard path that ever worked: measured on
   * 2026-09-11, two ArrowDown presses left the active option at index 0, focus never left the
   * input, and Enter left the field holding "Vä". The list rendered as a sibling of the input, so
   * the `Command` that was supposed to "handle arrow navigation" never received a key.
   *
   * jsdom cannot be the enforcer here — the defect was about which element had focus — so this
   * runs in the browser, beside the walk it belongs to.
   */
  test('with no mouse: the suggestion list itself is operable', async ({ page }) => {
    await signedIn(page);
    await oneKurssi(page);
    await register(page);
    const { posted } = await attendanceLogging(page);

    await page.goto(classUrl);
    const name = page.getByLabel('Opiskelijan nimi', { exact: true });
    await name.click();
    await page.keyboard.type('Li');

    const options = page.getByRole('option');
    await expect(options).toHaveCount(SUGGESTIONS.length);

    // ARIA's combobox nominates nothing until a key asks, so that Enter on a freshly opened list
    // still means "submit what I typed".
    await expect(name).not.toHaveAttribute('aria-activedescendant', /./);

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');

    // The input keeps focus and points at the active row, which is the whole reason
    // `aria-activedescendant` exists. Focus moving into the list would break typing.
    await expect(name).toBeFocused();
    expect(await name.getAttribute('aria-activedescendant')).toBe(
      await options.nth(1).getAttribute('id'),
    );

    // Enter accepts the nomination. It must not also submit — that would post on the keystroke
    // that was only meant to choose a name.
    await page.keyboard.press('Enter');
    await expect(name).toHaveValue(SUGGESTIONS[1]!.name);
    await expect(options).toHaveCount(0);
    await expect(name).toHaveAttribute('aria-expanded', 'false');
    expect(posted).toEqual([]);

    // The second, deliberate Enter is the submit.
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Läsnäolo kirjattu')).toBeVisible();
    expect(posted).toEqual([
      expect.objectContaining({ student_name: SUGGESTIONS[1]!.name, quantity: 1 }),
    ]);
  });
});
