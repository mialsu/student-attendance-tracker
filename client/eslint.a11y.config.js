// The accessibility rule set, in ONE file on purpose.
//
// `npm run lint` spreads this in (see eslint.config.js) so an a11y error is a lint error like any
// other, and `npm run gate:a11y` runs it ALONE as its own ratchet at baseline 0. Both matter:
// baseline-guard.sh counts problems and cannot identify them, so folding a11y into the `lint`
// number would let a new a11y error be netted out against an unrelated lint fix. On its own
// ratchet at 0, any a11y error at all fails the gate.
//
// Installed 2026-09-07 with `/design-brief`. It is the enforcer named by A11Y-3 in DESIGN.md;
// before it existed every accessibility rule in this repo was `[review-only]`.
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist"] },
  {
    files: ["**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  {
    // The shadcn/ui primitives forward their children through `{...props}`, so these two rules
    // ask a question they structurally cannot answer here: they see `<h3 {...props} />` and not
    // the children the CALLER passes. Switching them off for the primitives keeps them live
    // where the content actually is — every CardTitle, AlertTitle and PaginationLink written in
    // src/pages and src/components is still linted by the block above.
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
    },
  },
];
