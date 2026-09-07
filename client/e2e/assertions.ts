/**
 * What a real browser can prove, and the two ways it can lie to you if you let it.
 *
 * axe with `color-contrast` **enabled** and the `A11Y-7` reflow measurement are the reasons
 * ADR-0005 chose a browser at all: jsdom has no layout and no paint, so it returns contrast as
 * *incomplete* — neither a pass nor a failure, and trivially mistaken for a pass (ADR-0004).
 *
 * Both measurements wait first, and neither wait is tidiness:
 *
 * - `fontsReady`, because `font-display: swap` means the first paint is system-ui, whose advance
 *   widths differ. A reflow assertion taken before the swap measures a typeface the app does not
 *   use.
 * - `settleAnimations`, because axe composites what is painted. Mid-`animate-fade-in` it read
 *   `--muted-foreground` at 0.83 alpha over its own background and reported a 4.43:1 "defect" —
 *   at 320px and not at 1280px, which is impossible for a contrast ratio and is what gave it away.
 */
import { createRequire } from 'node:module';
import { expect, type Locator, type Page } from '@playwright/test';
import type { RunOptions } from 'axe-core';

declare global {
  interface Window {
    axe: typeof import('axe-core');
  }
}

const require_ = createRequire(import.meta.url);

/**
 * axe's own bundle, injected into the page rather than reached for through a wrapper.
 *
 * `axe-core` is already a dependency — `src/components/__tests__/surfaces.a11y.test.tsx` runs it
 * under jsdom — so `@axe-core/playwright` would be a second way to do a thing this repo already
 * does (PRINCIPLES #3). It is a thin wrapper around exactly this injection.
 */

const AXE_BUNDLE = require_.resolve('axe-core/axe.min.js');

/**
 * The same four WCAG tag sets the jsdom sweep runs — and `color-contrast` **on**, which is the
 * whole reason a real browser is here.
 *
 * jsdom has no layout and no paint, so it cannot know what is drawn behind what and returns
 * contrast as *incomplete*: neither a pass nor a failure, and trivially mistaken for a pass
 * (ADR-0004). `src/__tests__/tokens-contrast.test.ts` asserts the token *pairs* clear AA, which
 * proves the palette and says nothing about a rendered screen. This closes that, and `DESIGN.md`
 * §6 names the gap it closes.
 */

export const AXE_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

/**
 * Wait for the webfont before measuring anything.
 *
 * Fira Sans is self-hosted and same-origin, so this always resolves — but `font-display: swap`
 * means the first paint is system-ui, whose advance widths differ. A reflow assertion taken
 * before the swap measures the wrong font, which would make `A11Y-7` a test about a typeface the
 * app does not use.
 */

export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Let every finite animation finish before measuring anything.
 *
 * Not tidiness — without it the sweep reports contrast failures that are not in the palette.
 * `animate-fade-in` runs for 0.3s and axe composites what is actually painted, so mid-fade it
 * reads the text blended against its own background: `--muted-foreground` is `#48566a`, and axe
 * measured `#637081`, which is exactly that colour at **0.83 alpha** over `#e9f2f4` — the same
 * alpha on all three channels. That turned a passing token pair into a 4.43:1 "defect", and made
 * it appear at 320px and not at 1280px, because the only difference was how long the page took to
 * get there. A width-dependent contrast ratio is impossible, which is what gave it away.
 *
 * Infinite animations are excluded on purpose: the loading states hold `animate-spin`, which never
 * finishes, and awaiting it would hang the walk rather than measure it.
 */

export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/**
 * axe over the whole document, contrast included. `where` names the state in the failure.
 *
 * `known` is **shrink-only in both directions**, the convention
 * `src/components/__tests__/surfaces.a11y.test.tsx` established: a new rule id fails because it is
 * a new defect, and a listed id that stops appearing *also* fails and names the row to delete, so
 * ground once won cannot be given back. A row here is legitimate only alongside a
 * `REVIEW-DEBT.md` entry saying why.
 */

export async function expectNoAxeViolations(
  page: Page,
  where: string,
  known: string[] = [],
): Promise<void> {
  await fontsReady(page);
  await settleAnimations(page);
  await page.addScriptTag({ path: AXE_BUNDLE });

  const found = await page.evaluate(async (options: RunOptions) => {
    const { violations } = await window.axe.run(document, options);
    return violations.map((v) => {
      const node = v.nodes[0];
      const target = node?.target.join(' ') ?? 'no target';
      // A contrast row without numbers is not actionable: axe already measured the two colours
      // and the ratio it wanted, and the token-pair test cannot see either, so carry them out.
      const measured = node?.any.find((check) => check.id === 'color-contrast')?.data as
        | { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string }
        | undefined;
      const numbers = measured?.contrastRatio
        ? ` [${measured.fgColor} on ${measured.bgColor} = ${measured.contrastRatio}:1, wanted ${measured.expectedContrastRatio}]`
        : '';
      return `${v.id} × ${v.nodes.length} — ${v.help} (${target})${numbers}`;
    });
  }, AXE_OPTIONS);

  if (known.length > 0) {
    const ids = found.map((row) => row.split(' ')[0] ?? '').sort();
    expect(
      ids,
      `${where}: expected exactly the known violations ${known.join(', ')}. A new id is a new ` +
        `defect; a missing one means it is FIXED — delete its KNOWN_VIOLATIONS row and close the ` +
        `REVIEW-DEBT entry. Saw: ${found.join(' | ') || 'nothing'}`,
    ).toEqual([...known].sort());
    return;
  }

  expect(found, `${where}: axe found ${found.length} violation(s)`).toEqual([]);
}

/**
 * `A11Y-7` / WCAG 1.4.10: the **page** may not scroll sideways at 320px.
 *
 * An inner container that scrolls is fine and deliberate — the register is one table at every
 * width with a `min-w-[34rem]`, so below about 544px it scrolls inside its own box. That is the
 * shape variant A chose. What is not fine is the document scrolling, which is what this measures,
 * and the failure names the three widest offenders because "the page scrolls" is not actionable
 * on its own.
 */

export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  await fontsReady(page);
  // A fade-in that translates would overflow transiently; measure the page it settles into.
  await settleAnimations(page);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    const widest = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 3)
      .map((el) => {
        const cls = (el.getAttribute('class') ?? '').split(' ')[0] ?? '';
        const right = Math.round(el.getBoundingClientRect().right);
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} → ${right}px`;
      });
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest };
  });

  expect(overflow, `${where}: the page itself scrolls sideways (A11Y-7, WCAG 1.4.10)`).toBeNull();
}

export function toast(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

/**
 * The autocomplete rows, ordered by frequency the way the API orders them — `total_attendance`
 * descending. `DESIGN.md` §2 makes that ordering part of the core loop, so the fixture has to
 * carry it or the walk proves a list rather than the feature.
 */

export async function tabSequence(page: Page, presses = 25): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return '(nothing)';
        return el.id || (el.textContent ?? '').trim().slice(0, 40) || el.tagName.toLowerCase();
      }),
    );
  }
  return seen;
}

/**
 * Press Tab until `locator` holds focus, and return how many presses it took.
 *
 * The count is what makes `A11Y-2` (focus order follows reading order) assertable: the controls of
 * a form must be reachable in increasing numbers of presses, in the order they are read. Asserting
 * an exact count instead would break on any layout change and prove nothing about the order.
 */

export async function tabTo(page: Page, locator: Locator, maxPresses = 30): Promise<number> {
  for (let pressed = 1; pressed <= maxPresses; pressed += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((el) => el === document.activeElement)) return pressed;
  }
  throw new Error(`not reachable by keyboard within ${maxPresses} Tab presses`);
}
