# ADR-0002 — deploy hardening: verified backup, explicit migrations, no database downtime

The previous `deploy` job did `compose down` → `build --no-cache` → `up -d` → `sleep 15` → one
`curl`. Four problems, all fixed here:

1. **`compose down` stopped the database too.** Postgres has nothing to do with a code change, so
   every deploy was also a database outage. Now only `backend` and `nginx` are recreated
   (`up -d --no-deps backend nginx`).
2. **`--no-cache` maximised the downtime window** for no benefit — the image is rebuilt from a
   pinned commit either way. Dropped.
3. **No pre-deploy backup, and migrations ran inside the container's start command.** A bad
   migration therefore put the new container into a restart loop behind `restart: always`, with no
   snapshot to return to. Now: back up first, **verify the artifact**, then run
   `alembic upgrade head` as an explicit step *while the old container is still serving*, so a bad
   migration fails the deploy instead of taking the service down.
4. **`sleep 15` then one `curl`** was a coin flip. Now a 30×4s retry loop, and on failure the code
   is rolled back to the previous SHA automatically and re-health-checked.

The backup is verified rather than trusted because `deployment/scripts/backup-db.sh` pipes
`pg_dump` into `gzip` without `set -o pipefail`: if the dump fails, gzip still exits 0 and a
truncated archive is written. The deploy checks `gzip -t` and a minimum size instead of the script's
exit code. **The one-line fix belongs in the `deployment` repo** (`set -o pipefail`), which the
Owner scoped out of this harness work; until then the check at point of use is the safety net.

## What the rollback does NOT do
It restores **code**, not **schema**. By the time a health check fails, alembic has already run.
Rolling the schema back means restoring the pre-deploy dump, which discards every write since it was
taken — so the workflow prints the backup path and the exact `restore-db.sh` command and stops. It
never restores automatically. Claiming otherwise would be the kind of overclaim
`PRINCIPLES #10` exists to prevent.

## Rejected alternatives
- **Blue/green or a rolling swap with two backend containers** — the correct answer for zero
  downtime, and rejected as disproportionate: one CX21 (2 vCPU, 4 GB) hosting a hobby project, where
  the swap window is now a few seconds rather than a full rebuild.
- **Down-migrations as the rollback path** — rejected because alembic `downgrade` is only as good as
  the hand-written `downgrade()` in each revision, and none of the six migrations here has been
  exercised in that direction. An unexercised downgrade is a worse rollback than a verified dump.
- **SHA-tagged images as the rollback artifact** — partially adopted: the image *is* tagged
  `attendance-backend:<sha>` for audit, but rollback rebuilds from the git SHA instead of running the
  tagged image, because making compose consume a specific tag needs an `image:` key in the
  `deployment` repo's compose file, which is out of scope. Rebuild-from-cache is fast enough.
- **Keeping `--no-cache` for build reproducibility** — rejected: the commit SHA pins the source, and
  `requirements.txt` pins the dependencies. `--no-cache` bought downtime, not determinism.
