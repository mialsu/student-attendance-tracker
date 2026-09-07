import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function AppLogo() {
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <BookOpen className="w-5 h-5 text-primary" />
      {/* sr-only rather than hidden: `hidden sm:inline` removed the link's only text below
          640px, so on a phone this was an icon with no accessible name at all — a `link-name`
          violation on every signed-in surface. eslint-plugin-jsx-a11y sees the span in the JSX
          and jsdom applies no media query, so only a real browser at 320px could catch it; the
          Playwright sweep did, on 2026-09-07. This keeps the text for assistive technology at
          every width and visible from 640px, which also keeps the accessible name equal to the
          visible label (WCAG 2.5.3). */}
      <span className="font-semibold text-base sr-only sm:not-sr-only sm:inline">Läsnäolot</span>
    </Link>
  );
}
