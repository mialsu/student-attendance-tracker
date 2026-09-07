/**
 * PROTOTYPE — throwaway. Three token sets, applied by scoping the CSS custom properties onto each
 * variant's wrapper element. Tailwind resolves `bg-primary` to `hsl(var(--primary))`, and custom
 * properties inherit, so overriding them on a wrapper re-skins everything inside it without
 * touching src/index.css. That is the point: production tokens stay exactly as they are until a
 * variant wins.
 *
 * Every value came from ui-ux-pro-max's colors.csv (education/school query) with two changes I
 * made deliberately:
 *
 *   1. `--input` is darker than the corpus's `border`. The corpus ships one border colour, and
 *      WCAG 1.4.11 only demands 3:1 of a boundary that *identifies a control* — so the soft
 *      corpus border stays for dividers and the field boundary is darkened to clear 3:1. All three
 *      corpus palettes failed that check as shipped.
 *   2. A couple of "on" colours were darkened to clear 4.5:1 against their own surface.
 *
 * All three were then run through the same WCAG maths as src/__tests__/tokens-contrast.test.ts:
 * ten pairs each, thirty checks, all clear. Whichever wins can therefore land in index.css
 * without the contrast gate going red.
 */

export type PaletteTokens = Record<`--${string}`, string>;

export interface VariantMeta {
  key: string;
  name: string;
  /** The ui-ux-pro-max style id this direction came from. */
  styleId: string;
  /** Google Fonts family names, injected only while a variant is on screen. */
  fonts: string[];
  fontStack: string;
  palette: PaletteTokens;
}

const LEDGER_TEAL: PaletteTokens = {
  '--background': '166 76% 97%',
  '--foreground': '176 61% 19%',
  '--card': '0 0% 100%',
  '--card-foreground': '176 61% 19%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '176 61% 19%',
  '--primary': '175 84% 32%',
  '--primary-foreground': '170 100% 4%',
  '--secondary': '172 66% 50%',
  '--secondary-foreground': '222 47% 11%',
  '--accent': '32 95% 44%',
  '--accent-foreground': '32 100% 5%',
  '--muted': '195 35% 93%',
  '--muted-foreground': '215 19% 35%',
  '--border': '171 77% 64%',
  '--input': '173 22% 45%',
  '--destructive': '0 72% 51%',
  '--destructive-foreground': '0 0% 100%',
  '--ring': '175 84% 32%',
  '--radius': '0.25rem',
};

const PAPER_INK: PaletteTokens = {
  '--background': '40 60% 98%',
  '--foreground': '0 0% 10%',
  '--card': '40 100% 99%',
  '--card-foreground': '0 0% 10%',
  '--popover': '40 100% 99%',
  '--popover-foreground': '0 0% 10%',
  '--primary': '0 0% 10%',
  '--primary-foreground': '40 60% 98%',
  '--secondary': '40 25% 91%',
  '--secondary-foreground': '0 0% 10%',
  '--accent': '0 0% 29%',
  '--accent-foreground': '40 60% 98%',
  '--muted': '42 25% 92%',
  '--muted-foreground': '0 0% 29%',
  '--border': '40 19% 81%',
  '--input': '34 7% 45%',
  '--destructive': '3 71% 32%',
  '--destructive-foreground': '40 60% 98%',
  '--ring': '0 0% 10%',
  '--radius': '0rem',
};

const CARDS_INDIGO: PaletteTokens = {
  '--background': '226 100% 97%',
  '--foreground': '242 47% 34%',
  '--card': '0 0% 100%',
  '--card-foreground': '242 47% 34%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '242 47% 34%',
  '--primary': '243 75% 59%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '234 89% 74%',
  '--secondary-foreground': '222 47% 11%',
  '--accent': '142 76% 36%',
  '--accent-foreground': '141 80% 8%',
  '--muted': '226 48% 95%',
  '--muted-foreground': '215 19% 35%',
  '--border': '228 96% 89%',
  '--input': '231 26% 54%',
  '--destructive': '0 72% 51%',
  '--destructive-foreground': '0 0% 100%',
  '--ring': '243 75% 59%',
  '--radius': '0.75rem',
};

export const VARIANTS: VariantMeta[] = [
  {
    key: 'A',
    name: 'Tilikirja — dense table',
    styleId: 'data-dense-dashboard',
    fonts: ['Fira+Sans:wght@400;500;600'],
    fontStack: "'Fira Sans', system-ui, sans-serif",
    palette: LEDGER_TEAL,
  },
  {
    key: 'B',
    name: 'Paperi — the register as paper',
    styleId: 'e-ink-paper',
    fonts: ['EB+Garamond:wght@400;500;600', 'Lato:wght@400;700'],
    fontStack: "'Lato', system-ui, sans-serif",
    palette: PAPER_INK,
  },
  {
    key: 'C',
    name: 'Kortit — touch-first, one layout',
    styleId: 'minimalism-and-swiss-style',
    fonts: ['Lexend:wght@400;500;600', 'Source+Sans+3:wght@400;600'],
    fontStack: "'Source Sans 3', system-ui, sans-serif",
    palette: CARDS_INDIGO,
  },
];

/** What every variant receives. Read-only by /prototype's rule: the question is what this should
 *  look like, not whether the backend works, so the credit toggle is local state and persists
 *  nothing. */
export interface VariantProps {
  items: import('@/api/types').AttendanceSummary[];
  legacyHidden: number;
  fontStack: string;
}
