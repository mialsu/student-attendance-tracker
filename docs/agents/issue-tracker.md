# Issue tracker: Local markdown (specs/)

Specs live as numbered markdown files in `specs/`, following the existing
`specs/NNNN-<slug>.md` convention (see `specs/0002`–`specs/0005`). This is a solo
utility — there is no external tracker, and GitHub Issues is deliberately unused.

## Conventions

- One spec per feature: `specs/NNNN-<slug>.md`, numbered sequentially (next free: `0006`).
- Tracer slices and open questions are sections *inside* the spec, not separate ticket
  files — devkit's METHOD folds slices into the local spec for solo work.
- If a feature ever genuinely needs per-ticket files, use
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order.
- Triage state, when it matters, is a `Status:` line near the top of the file (see
  `triage-labels.md` for the role strings).

## When a skill says "publish to the issue tracker"

Write a new `specs/NNNN-<slug>.md` at the next free number (creating nothing under
`.scratch/` unless per-ticket files were explicitly asked for).

## When a skill says "fetch the relevant ticket"

Read the referenced `specs/NNNN-*.md`. The user normally passes the number or path directly.
