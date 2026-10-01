/**
 * `A11Y-6` — `prefers-reduced-motion`, which had **no enforcer at all** until slice 8.
 *
 * The row read "nothing. `animate-fade-in`, `transition-smooth` and `active:scale-[0.98]` all
 * ignore it", and that was accurate: nothing in `index.css` mentioned the media feature, so a
 * teacher who had asked her operating system for less motion got the full 300ms fade and slide on
 * every signed-in surface anyway.
 *
 * **The CSS motion is a pair, and the second test is what makes the first mean anything.** Asserting
 * "duration is 0.01ms under reduce" alone would also pass if the app had no animation whatsoever,
 * or if someone deleted the keyframes. The control asserts the motion is *there* without the
 * preference — 0.3s and 0.2s, the authored values — so the pair proves the media query is doing
 * the switching rather than a constant being read back.
 *
 * Watched red before the CSS existed: the reduce case reported the full `0.3s` while the control
 * passed, which is the pair saying "the animation is there and the preference is ignored".
 *
 * `DESIGN.md` §6 names a second reason this rule was worth an enforcer rather than a review note:
 * axe composites what is painted, so a running animation made `/settings`' tab trigger report
 * 4.43:1 on the walk's first run. An app that honours the preference has no animation to wait for.
 */
import { expect, test } from './fixtures';
import { oneKurssi, register, signedIn, statistics } from './mocks';
import { KURSSI, STATISTICS } from './rows';
import type { Page } from '@playwright/test';

/** What `index.css` authors, in seconds, and therefore what the control expects to find. */
const AUTHORED_FADE = 0.3;
const AUTHORED_TRANSITION = 0.2;

/**
 * The ceiling the reduce block must come under, in seconds.
 *
 * Asserted as a number rather than a string, and that is not fussiness: `index.css` authors
 * `0.01ms`, and `getComputedStyle` hands it back as **`1e-05s`** — normalised to seconds and in
 * exponential notation. Pinning the authored string fails against the real value, and pinning
 * `'1e-05s'` would pin Blink's serialiser instead of the behaviour. The behaviour is "far below
 * anything a reader perceives as motion", so that is what this measures.
 *
 * `index.css` says why the authored value is not a true `0`: a zero-length animation never fires
 * `animationend`, and `settleAnimations` in `assertions.ts` awaits `animation.finished`.
 */
const NEUTRALISED_CEILING = 0.001;

/** Durations come back as `<number>s`, exponential notation included; `parseFloat` reads both. */
const seconds = (value: string) => Number.parseFloat(value);

async function dashboard(page: Parameters<typeof signedIn>[0]) {
  await signedIn(page);
  await oneKurssi(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Kurssit', level: 1 })).toBeVisible();
}

/** What the first DOM change that drew a bar shape carried. */
type FirstFrame = { bars: number; labels: number };

/**
 * Spec 0010 AC-27: the chart's bars do not animate, so the first frame that holds a bar holds every
 * count. Recharts animates in JavaScript, out of reach of `index.css`'s `reduce` block and of
 * `getComputedStyle`, and it draws a bar's `LabelList` only once its grow-in has finished.
 *
 * **No retrying assertion can see this.** With the animation on, the labels arrive 400 ms after
 * the bars, and `toHaveCount` would simply wait for them and pass. So the page records from inside,
 * with a MutationObserver installed before any script runs, the first DOM change that puts a bar
 * shape on screen and how many count labels arrived in that same change.
 */
async function firstFrameWithBars(page: Page): Promise<FirstFrame> {
  await page.addInitScript(() => {
    const record = window as unknown as { __firstBars?: FirstFrame };
    // A drawn bar is a `path` inside its `.recharts-bar-rectangle` group; the group exists from the
    // first render, the path only once the bar has a height, which is the moment that matters here.
    new MutationObserver((_changes, observer) => {
      const bars = document.querySelectorAll('.recharts-bar-rectangle path').length;
      if (bars === 0) return;
      record.__firstBars = {
        bars,
        labels: document.querySelectorAll('.recharts-label-list .recharts-label').length,
      };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await signedIn(page);
  await oneKurssi(page);
  await register(page);
  await statistics(page);
  await page.goto(`/class/${KURSSI.id}`);
  await page.getByRole('tab', { name: 'Tilastot' }).click();
  await expect(page.locator('.recharts-bar-rectangle path')).toHaveCount(
    STATISTICS.daily_stats.length,
  );
  const first = await page.evaluate(
    () => (window as unknown as { __firstBars?: FirstFrame }).__firstBars,
  );
  expect(first, 'no DOM change ever put a bar on screen').toBeDefined();
  return first ?? { bars: 0, labels: 0 };
}

test.describe('the chart draws its numbers with its bars', () => {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`${reducedMotion} — the first frame with bars carries every count`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      const first = await firstFrameWithBars(page);
      expect(first.labels).toBe(first.bars);
    });
  }

  // Decision 5, made deterministic. Recharts sizes itself in an effect, and the page learns the
  // width from a ResizeObserver; usually the two land in one render, and a chart that drew bars
  // before the page knew its width failed AC-27 once in a few hundred runs. Delaying every
  // ResizeObserver report forces the other order on every run, so that chart fails here every time.
  test('no-preference — the bars wait for the width when the ResizeObserver reports late', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const Native = window.ResizeObserver;
      window.ResizeObserver = class extends Native {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => setTimeout(() => callback(entries, observer), 150));
        }
      };
    });
    const first = await firstFrameWithBars(page);
    expect(first.labels).toBe(first.bars);
  });
});

test.describe('prefers-reduced-motion', () => {
  test('reduce — the page fade and the button transition are both neutralised', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dashboard(page);

    const faded = page.locator('.animate-fade-in').first();
    await expect(faded).toBeAttached();
    const fade = await faded.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(fade)).toBeLessThan(NEUTRALISED_CEILING);

    const button = page.getByRole('button', { name: 'Lisää uusi kurssi' });
    const transition = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(seconds(transition)).toBeLessThan(NEUTRALISED_CEILING);
  });

  test('no-preference — the motion this app authored is still there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await dashboard(page);

    const faded = page.locator('.animate-fade-in').first();
    await expect(faded).toBeAttached();
    const fade = await faded.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(fade)).toBeCloseTo(AUTHORED_FADE);

    const button = page.getByRole('button', { name: 'Lisää uusi kurssi' });
    const transition = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(seconds(transition)).toBeCloseTo(AUTHORED_TRANSITION);
  });
});
