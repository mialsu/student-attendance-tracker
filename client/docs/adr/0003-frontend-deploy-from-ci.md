# ADR-0003 — the frontend deploys from CI, not from Vercel's git integration

Vercel's git integration deploys on push, **independently of GitHub Actions**. A red CI run could
not stop it, so before this change the frontend had deployment automation but no gate: a commit with
26 type errors and 25 failing tests would reach production unchallenged, which is how those numbers
grew. `vite build` does not typecheck — measured directly, the build exits 0 while `tsc --noEmit`
exits 2.

So the deploy moved into `.github/workflows/ci.yml`: gates and security run first, and only on green
does the `deploy` job run `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.

**This required one manual step outside the repo:** turning OFF the Vercel project's git
auto-deploy. Done by the Owner on 2026-09-01 (Connected Git Repository → Disconnect). Until that
happened **both** paths deployed and raced — CI's gate was advisory, and whichever finished last
won. If the integration is ever reconnected the race returns, and nothing in the repo can detect
it.

Two things about that setting are genuinely confusing and cost time to establish, so they are
recorded here:

- **"Deploy Hooks" is not auto-deploy.** Deploy Hooks are URLs you POST to in order to *trigger* a
  deployment; an empty Deploy Hooks list says nothing about auto-deploy. The behaviour comes from
  **Connected Git Repository** at the top of Project → Settings → Git. If a repository is connected
  there, pushes deploy. Disconnect it, or set an Ignored Build Step that exits 0.
- **The Vercel connection may show a stale repository name.** This project's Vercel connection reads
  `mialsu/student-attendance-tracker-client-app` while the git remote is
  `student-attendance-tracker/client-app`. Verified 2026-09-01 that these are the **same
  repository** — identical ref lists over SSH — reached through GitHub's post-rename/transfer
  redirect. So the connection is live and does watch the branch we push. A name mismatch here is not
  evidence that auto-deploy is inert; check the ref lists, not the label.

Secrets required: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. The org and project ids are
in `.vercel/project.json`, which is gitignored, so they must be copied into GitHub secrets by hand.

## Rejected alternatives
- **Branch protection on `main` + keep Vercel auto-deploy** — the least machinery and no token, and
  rejected only because it does not work with this project's actual workflow: history is 19 commits
  straight to `main` with no branches, and required checks are enforced on pull requests. The Owner
  confirmed direct-to-main stays. If that ever changes, this is the better answer and this ADR
  should be revisited.
- **Keep auto-deploy, run CI in parallel as advisory** — rejected because it is a warning light, not
  a gate, and the current state already proves warning lights do not hold a line.
- **Vercel's "Ignored Build Step" polling the commit status** — rejected as the primary mechanism: it
  inverts control (Vercel deciding whether CI passed) and adds a race on status timing. It is,
  however, the fallback if the CLI deploy proves troublesome.

## Consequences
Deploys are now serialized by the `fe-deploy-production` concurrency group and gated on the same
checks the pre-commit hook runs. The trade is that `VERCEL_TOKEN` is now a credential in GitHub
secrets with production deploy rights, and Vercel's own preview-deploy-per-PR behaviour is lost
unless a preview step is added later.
