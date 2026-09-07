# ADR-0005 — A modular monolith, not services

**Status:** accepted at the start of the project and **implemented throughout**. Recorded as an ADR
on 2026-09-07, when `docs/ARCHITECTURE.md` was deleted; the decision and its rationale are carried
across from that file's *Architecture Decision: Monolith vs Microservices* section rather than
re-argued here.

**Read the status line literally.** This is a retroactive record of a decision that was made before
this repository kept ADRs. The rationale below is the one that was actually written down at the
time. The *Considered options* section reconstructs the single alternative the original heading
names, and says where it is reconstructing — which is why it is shorter than every other ADR here.
An ADR that invented three carefully weighed alternatives for a decision nobody agonised over would
read like understanding and carry none.

## The decision

One FastAPI application, one deployable image, one server. Internally it is layered rather than
flat: `api/` for transport, `services/` for business logic, `models/` for persistence, with
`schemas/` and `core/` as leaves.

The six reasons recorded at the time:

1. **Simplicity** — a single codebase is easier to develop and debug.
2. **Team size** — a small team, in practice one person.
3. **Deployment** — a single server keeps operations simple.
4. **Performance** — no network hop between components.
5. **Evolution path** — services can be extracted later if they are ever needed.
6. **Cost** — one Hetzner VM.

## What makes it *modular* rather than just small

The layering is not a convention in a document. `pyproject.toml`'s `[tool.importlinter]` block
states it as four contracts over the `app` root package, and `lint-imports` fails the gate when any
of them is broken:

- `api -> services -> models` is layered.
- `schemas` is a leaf: Pydantic contracts import no application logic.
- `core` is a leaf: `security` and `exceptions` depend on nothing above `config`.
- `models` never reach into transport or business logic.

Those four are checked on every commit by the pre-commit hook (`just check-fast`) and again in
CI (`.github/workflows/backend.yml`, the *Boundaries (import-linter)* step). That is the whole
difference between this and a monolith that merely has folders — and it is the property the
"extract a service later" reason in the list above depends on, since an extraction is only cheap
while the seams hold.

## Considered options

**Microservices.** The alternative named in the original heading, and the only one recorded. It was
rejected on reasons 1–4 and 6 above: separate deployables, a network boundary and per-service
operations, bought for an application with one writer, one database and a few hundred rows. Nothing
in the domain wants an independent lifecycle — `/crunch-domain` later confirmed the project has
**one** bounded context (`CLAUDE.md`, *Domain model, crunched 2026-09-01*), and a service boundary
without a context boundary is cost with no return.

**No other alternative was recorded, and none is invented here.** A serverless or per-function
split, a separate read model, or splitting the frontend's API from an admin API would each have been
plausible to consider; there is no evidence anyone did, and pretending otherwise would make this
document a worse record than the honest gap.

## Consequences

The one-way door in this decision is the **shared database**, not the process count. Extracting a
service later is a matter of moving modules while the import contracts hold; giving that service its
own data is the expensive half, and nothing here has been designed to make it cheap. That is a
deliberate bet that it will never be needed rather than an oversight.

The four import contracts become load-bearing. They are the only mechanical thing standing between
"modular monolith" and "monolith", so weakening one to unblock a change is a decision about this
ADR, not a refactor.

## What this ADR does not decide

It says nothing about the frontend, which is a separate deployable on Vercel for reasons that have
nothing to do with this — see `deployment/VERCEL_DEPLOYMENT.md`.

It does not claim the six reasons above were weighed against measurements. They are a solo
developer's judgement at project start, recorded because the judgement is real and the code has
followed it for the whole life of the project, not because it was validated.
