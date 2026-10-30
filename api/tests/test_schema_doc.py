"""The committed ERD against the migrations that are supposed to have produced it.

`docs/schema.gen.md` is generated, and a generated document rots in a particular way: the
migration lands, the diagram keeps describing the schema from before it, and the next session
reads the diagram with exactly the confidence it would read a fresh one. This test is the
enforcer for that. It re-runs the generator and fails on any difference, so a migration without
a regenerated diagram turns the suite red rather than shipping a confident drawing of a schema
that no longer exists.

The other half of the gap belongs to drift check 12: regenerated, but left out of the commit —
which this test cannot see, because pytest reads the working tree.
"""

import os

from scripts.erd import DOC_PATH, render_from_migrations


async def test_the_committed_erd_is_what_the_migrations_produce():
    rendered = await render_from_migrations(os.environ["TEST_DATABASE_URL"])

    assert rendered == DOC_PATH.read_text(), (
        "docs/schema.gen.md is not what alembic/versions/ produces. If you changed the schema, "
        "regenerate it:\n"
        '  cd api && eval "$(just test-db-up)" && just erd\n'
        "Do not edit the file by hand — it is introspected, and the next run would overwrite it."
    )
