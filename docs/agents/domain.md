# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root: it points at one `CONTEXT.md` per package. Read each
  one relevant to the topic.
- The per-package **`CONTEXT.md`** it names (`api/CONTEXT.md`, `client/CONTEXT.md`).
- **`docs/adr/`** for the package you're working in — here that is `api/docs/adr/` and
  `client/docs/adr/`. There are no root-level ADRs.
- **`api/INVARIANTS.md`** before changing anything in the API service layer — every `INV-n`
  row names the test that fails when it's violated.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure (this repo — split by deployment package)

```
/
├── CONTEXT-MAP.md
├── api/
│   ├── CONTEXT.md
│   ├── INVARIANTS.md
│   └── docs/adr/
└── client/
    ├── CONTEXT.md
    └── docs/adr/
```

The domain crunch (CLAUDE.md, `/crunch-domain` 2026-09-01) recorded **one bounded context** —
`User` means exactly one thing. The split above is by deployment package (backend vs frontend),
not by bounded context; every enforcer is server-side, which is why `client/` has no
`INVARIANTS.md` by design.

## Use the glossary's vocabulary

When your output names a domain concept (in a spec title, a refactor proposal, a hypothesis, a
test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the
glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (what a log line may contain), but worth reopening because…_
