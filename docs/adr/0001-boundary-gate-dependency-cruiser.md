# ADR-0001 — dependency-cruiser configured directly, not via /setup-ts-deep-modules

The boundary gate this repo needed (`/harness` step 3) had two candidate installs: delegate to the
installed `/setup-ts-deep-modules` skill, which ships a proven `dependency-cruiser` config, or write
the config by hand. Its precondition does not hold here, so the config is written directly against
the real module surface — same tool, same proving step, no delegation.

The precondition, checked before deciding: that skill enforces **depth** by treating a package's
root files as its public surface and every subfolder as private. That is only correct when packages
put their entry points at the root. This repo is a single private app — no `packages/`, no `exports`
field in `package.json`, no barrel files, one `src/` tree addressed through the `@/*` → `./src/*`
alias. Its rule would have flagged every legitimate `@/components/ui/button` import in the repo.

The layering rules were read off the actual import graph rather than invented, and each of the five
rule classes was proven by breaking it on purpose (`/harness` step 5).

## Rejected alternatives
- **`/setup-ts-deep-modules` as-is** — rejected because its public-surface convention assumes
  package roots this repo does not have; every intra-`src` import would violate it. Re-delegate if
  the app is ever split into real packages.
- **`eslint-plugin-boundaries`** — rejected because it would put the architecture rules inside an
  ESLint config that is currently failing (19 errors on a clean tree), coupling a working gate to a
  broken one. `dependency-cruiser` runs and fails independently, and also gives orphan and cycle
  detection that the ESLint plugin does not.
- **No boundary gate, layering in prose in `CODING_STANDARDS.md`** — rejected because a rule in
  prose is a suggestion (ANTI-PATTERNS: *a standard with no enforcer*). The two dead modules the
  orphan rule found on its first run are what prose had already failed to catch.

## Consequences
The layering rules encode today's graph. If the app grows a legitimate new layer, the rule must be
edited deliberately — that edit is the point, not friction to route around.
