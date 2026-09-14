/**
 * A11Y-4's enforcer: the colour tokens in src/index.css must clear WCAG AA.
 *
 * Why this and not axe. axe is the obvious tool and it cannot do this job here — its
 * `color-contrast` rule needs a layout engine to know what is painted behind what, and jsdom has
 * none, so it reports the check as *incomplete* rather than passing or failing. Adding axe and
 * believing contrast was covered would have been the worst outcome: a green suite asserting
 * nothing. Every ratio in this app comes from a token pair declared in one file, so the pair is
 * the honest unit to test.
 *
 * What it therefore does NOT prove, restated in DESIGN.md §6: that any given screen puts these
 * pairs together the way the table below assumes, that text over an image or a gradient is
 * readable, or that a disabled control at 50% opacity clears anything. It proves the palette is
 * capable of AA, not that a rendered screen achieves it.
 *
 * KNOWN_FAILING is a ratchet, not an exemption — same shape as .harness-baseline. A pair listed
 * there must still fail; fix one and this test tells you to delete its row, so the ground cannot
 * be given back. Adding a row is only legitimate alongside a REVIEW-DEBT.md entry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Hsl = { h: number; s: number; l: number };

const CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** Pull `--name: H S% L%;` declarations out of one CSS block. */
function tokensIn(selector: string): Record<string, Hsl> {
  // The token blocks are the only ones in this file declaring bare HSL triples, and each is
  // opened by its selector and closed by the first `}` that follows a declaration list.
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in index.css`);
  const block = CSS.slice(start, CSS.indexOf('\n  }', start));
  const out: Record<string, Hsl> = {};
  for (const [, name, h, s, l] of block.matchAll(
    /--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g,
  )) {
    out[name] = { h: Number(h), s: Number(s), l: Number(l) };
  }
  return out;
}

function relativeLuminance({ h, s, l }: Hsl): number {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return lN - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(channel(0)) + 0.7152 * linear(channel(8)) + 0.0722 * linear(channel(4));
}

function ratio(a: Hsl, b: Hsl): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 4.5:1 for body text (WCAG 1.4.3); 3:1 for a boundary that identifies a control (1.4.11). */
const TEXT = 4.5;
const UI = 3;

type Pair = { fg: string; bg: string; need: number; where: string };

/** Only pairs this app actually paints — each `where` was grepped, not assumed. */
const PAIRS: Pair[] = [
  { fg: 'foreground', bg: 'background', need: TEXT, where: 'body text' },
  { fg: 'foreground', bg: 'card', need: TEXT, where: 'text on a Card' },
  { fg: 'muted-foreground', bg: 'background', need: TEXT, where: '64 uses of text-muted-foreground' },
  { fg: 'muted-foreground', bg: 'card', need: TEXT, where: 'secondary text on a Card' },
  { fg: 'muted-foreground', bg: 'muted', need: TEXT, where: '15 uses of bg-muted' },
  { fg: 'primary-foreground', bg: 'primary', need: TEXT, where: 'every default Button, e.g. "Kirjaa läsnäolo"' },
  { fg: 'secondary-foreground', bg: 'secondary', need: TEXT, where: '8 uses of bg-secondary' },
  { fg: 'destructive-foreground', bg: 'destructive', need: TEXT, where: '6 uses of bg-destructive' },
  { fg: 'primary', bg: 'background', need: TEXT, where: "the 404's only link, since slice 8" },
  { fg: 'ring', bg: 'background', need: UI, where: 'the focus ring, 23 components' },
  { fg: 'input', bg: 'background', need: UI, where: 'a form field is identified by its border alone' },

  // Added by spec 0006 slice 2, and the first two exist because a pair moved INTO this test's
  // reach. The *Suoritus* badge used to be `bg-primary/10 text-primary` — an alpha composite with
  // no token behind it, which this file's maths cannot express and which therefore lived in
  // `e2e/states.spec.ts`'s KNOWN_VIOLATIONS at 3.25:1 where only axe could see it. `badge.tsx`
  // now paints `--accent` / `--accent-foreground`, so the pair is solid, gated here in both
  // themes, and that exemption is deleted.
  { fg: 'accent-foreground', bg: 'accent', need: TEXT, where: 'the Suoritus badge (badge.tsx default variant)' },
  { fg: 'accent-foreground', bg: 'card', need: TEXT, where: 'accent text on a Card' },
  // The tighter half of the control-boundary rule, and it was missing: a field usually sits on a
  // Card, not on the page, and `--card` is lighter than `--background` in the light theme. Solving
  // `--input` against `background` alone would have left the commoner case unasserted.
  { fg: 'input', bg: 'card', need: UI, where: 'a form field inside a Card — the commoner case' },

  // Added by spec 0006 slice 4, and it is the first pair here that gates a GRADIENT. The auth
  // aside paints `linear-gradient(150deg, hsl(var(--primary)), hsl(var(--auth-aside-to)))` with
  // `--primary-foreground` text, and the file header above is explicit that this test cannot see
  // "text over an image or a gradient". It can see this one, because the gradient was reduced to
  // two token endpoints between which every channel moves monotonically — so no pixel behind the
  // aside's text is lighter than `--auth-aside-to` (light theme) or darker than `--primary`
  // (dark, where the text colour inverts). Gate the endpoints and the span is gated.
  //
  // The pair below is the one that failed as the prototype drew it: 3.28:1 at its third stop,
  // invisible to every gate this repo owns. See the token's comment in index.css.
  {
    fg: 'primary-foreground',
    bg: 'auth-aside-to',
    need: TEXT,
    where: "the auth aside's gradient end — the lightest pixel behind its text (Auth.tsx)",
  },
];

/**
 * Empty, and that is the point.
 *
 * It opened on 2026-09-07 with seven rows — `primary-foreground` on `primary` at 2.61:1 chief
 * among them, white on a cyan accent, below even the 3:1 large-text floor, on every button in
 * production. All seven were closed the same day when variant A's education-teal palette landed
 * (see src/index.css). The test made me delete them: a listed pair that starts passing FAILS the
 * assertion below and names the row to remove, so the ground cannot be given back.
 *
 * Adding a row here is legitimate only alongside a REVIEW-DEBT.md entry saying why.
 */
const KNOWN_FAILING: Record<string, string> = {};
describe('colour tokens clear WCAG AA', () => {
  for (const [theme, selector] of [
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const) {
    describe(theme, () => {
      const tokens = tokensIn(selector);

      for (const { fg, bg, need, where } of PAIRS) {
        const key = `${theme}:${fg}/${bg}`;
        const known = KNOWN_FAILING[key];

        it(`${fg} on ${bg} — ${where}`, () => {
          expect(tokens[fg], `--${fg} missing from ${selector}`).toBeDefined();
          expect(tokens[bg], `--${bg} missing from ${selector}`).toBeDefined();
          const r = ratio(tokens[fg], tokens[bg]);
          const actual = `${r.toFixed(2)}:1`;

          if (known) {
            // The ratchet: a known failure that now passes must be struck from the list.
            expect(
              r,
              `${key} now measures ${actual} and clears ${need}:1. Delete its KNOWN_FAILING row ` +
                `and close the REVIEW-DEBT entry — this is ground you cannot give back.`,
            ).toBeLessThan(need);
            return;
          }

          expect(r, `${key} measures ${actual}, needs ${need}:1 (${where})`).toBeGreaterThanOrEqual(
            need,
          );
        });
      }
    });
  }

  it('every KNOWN_FAILING row names a pair this app actually paints', () => {
    // A stale row would quietly excuse a pair that no longer exists.
    const declared = new Set(
      PAIRS.flatMap(({ fg, bg }) => [`light:${fg}/${bg}`, `dark:${fg}/${bg}`]),
    );
    for (const key of Object.keys(KNOWN_FAILING)) {
      expect(declared.has(key), `KNOWN_FAILING has ${key}, which is not in PAIRS`).toBe(true);
    }
  });
});
