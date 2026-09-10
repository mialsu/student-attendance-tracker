# Context map

One bounded context (per `/crunch-domain`, 2026-09-01 — `User` means exactly one thing),
split across two deployment packages, each with its own glossary and ADRs:

- **api/** — FastAPI backend.
  Glossary `api/CONTEXT.md` · decisions `api/docs/adr/` · invariants `api/INVARIANTS.md`.
- **client/** — React frontend.
  Glossary `client/CONTEXT.md` · decisions `client/docs/adr/`.

There are no system-wide ADRs at the root; each package owns its decisions. The split is by
deployment unit (backend vs frontend), not by bounded context — every domain rule is enforced
server-side, which is why `client/` deliberately has no `INVARIANTS.md`.

See `docs/agents/domain.md` for how the engineering skills consume these files.
