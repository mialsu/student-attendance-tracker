#!/usr/bin/env python3
"""Draw the schema from the migrations, into docs/schema.gen.md.

The direction of generation is the whole point (devkit METHOD.md, *Diagrams*): a hand-drawn ERD
is a second home for facts the migrations already own, and it rots silently. So this script
never reads a model or a diagram. It creates an empty database, runs `alembic upgrade head`
against it the way the deploy job does, introspects what the migrations actually produced, and
writes that. What the ORM believes is not consulted — `app/models/` and `alembic/versions/` can
disagree, and when they do, production has the migrations.

    cd api && eval "$(just test-db-up)" && just erd

TEST_DATABASE_URL names the *server*; the throwaway database this creates and drops is its own,
named `attendance_erd_<random>`, so nothing here touches the suite's tables. The drop is the
only destructive statement and it refuses any name without that prefix.

tests/test_schema_doc.py calls render_from_migrations() and fails when its output and the
committed file disagree, so a migration that lands without a regenerated diagram turns the suite
red. drift check 12 catches the other half: regenerated, but left out of the commit.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Connection, inspect, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

API_DIR = Path(__file__).resolve().parent.parent
DOC_PATH = API_DIR / "docs" / "schema.gen.md"

# alembic's own bookkeeping row. It is in every migrated database and describes the runner, not
# the domain, so it is named in the caption and left out of the drawing.
RUNNER_TABLE = "alembic_version"

# Every throwaway database this script creates carries this prefix, and it will drop nothing else.
ERD_DB_PREFIX = "attendance_erd_"



@dataclass(frozen=True)
class Column:
    name: str
    type: str
    nullable: bool
    key: str  # "PK", "FK", "UK" or ""


@dataclass(frozen=True)
class ForeignKey:
    columns: tuple[str, ...]
    parent: str
    on_delete: str
    optional: bool  # the child may have no parent — every local column is nullable
    at_most_one: bool  # the parent has at most one child — the local columns are unique


@dataclass(frozen=True)
class Index:
    name: str
    columns: tuple[str, ...]
    unique: bool


@dataclass(frozen=True)
class Table:
    name: str
    columns: tuple[Column, ...]
    foreign_keys: tuple[ForeignKey, ...]
    indexes: tuple[Index, ...]


def _type_name(column_type: object) -> str:
    """The short name `\\d` uses, with length and precision cut.

    Length and precision are the migration's to state: a diagram that repeats `varchar(255)` is a
    second place to update when one changes.
    """
    spelled = str(column_type).upper().split("(")[0].strip()
    if spelled == "TIMESTAMP":
        # str() spells `TIMESTAMP` for both, and only the reflected object knows which. In this
        # schema that difference is the whole local-day story: every column here is
        # `timestamptz`, an instant, which is why a date filter has to name a zone before it can
        # mean a day at all (spec 0009).
        return "timestamptz" if getattr(column_type, "timezone", False) else "timestamp"
    return spelled.lower().replace(" ", "_")


def _read_schema(connection: Connection) -> tuple[Table, ...]:
    """Everything the drawing and the tables below it need, from the live database."""
    inspector = inspect(connection)
    tables = []

    for name in sorted(inspector.get_table_names()):
        if name == RUNNER_TABLE:
            continue

        primary_key = set(inspector.get_pk_constraint(name).get("constrained_columns") or [])
        raw_fks = inspector.get_foreign_keys(name)
        fk_columns = {c for fk in raw_fks for c in fk["constrained_columns"]}

        # A single-column unique constraint or unique index is what a reader of the drawing cares
        # about ("this column identifies the row"); a composite one is a table-level rule and is
        # listed under Indexes instead.
        unique_columns = {
            tuple(uc["column_names"])[0]
            for uc in inspector.get_unique_constraints(name)
            if len(uc["column_names"]) == 1
        } | {
            tuple(ix["column_names"])[0]
            for ix in inspector.get_indexes(name)
            if ix.get("unique") and len(ix["column_names"]) == 1 and ix["column_names"][0]
        }

        columns = []
        nullable = {}
        for column in inspector.get_columns(name):
            if column["name"] in primary_key:
                key = "PK"
            elif column["name"] in fk_columns:
                key = "FK"
            elif column["name"] in unique_columns:
                key = "UK"
            else:
                key = ""
            nullable[column["name"]] = bool(column["nullable"])
            columns.append(
                Column(
                    name=column["name"],
                    type=_type_name(column["type"]),
                    nullable=bool(column["nullable"]),
                    key=key,
                )
            )

        foreign_keys = []
        for fk in sorted(raw_fks, key=lambda f: tuple(f["constrained_columns"])):
            local = tuple(fk["constrained_columns"])
            foreign_keys.append(
                ForeignKey(
                    columns=local,
                    parent=fk["referred_table"],
                    # No ON DELETE clause means PostgreSQL's default, and the default is the one
                    # worth spelling out: a delete that would orphan a row is refused.
                    on_delete=(fk.get("options") or {}).get("ondelete", "NO ACTION").upper(),
                    optional=all(nullable.get(c, False) for c in local),
                    at_most_one=local[0] in unique_columns and len(local) == 1,
                )
            )

        indexes = []
        for ix in sorted(inspector.get_indexes(name), key=lambda i: str(i["name"])):
            # An index over an expression reflects with None in column_names; `expressions`
            # carries what it is actually over. The students one is the whole reason this
            # column exists in the table below.
            listed = ix["column_names"]
            if any(c is None for c in listed):
                listed = ix.get("expressions") or listed
            indexes.append(
                Index(
                    name=str(ix["name"]),
                    columns=tuple(str(c) for c in listed),
                    unique=bool(ix.get("unique")),
                )
            )

        tables.append(
            Table(
                name=name,
                columns=tuple(columns),
                foreign_keys=tuple(foreign_keys),
                indexes=tuple(indexes),
            )
        )

    return tuple(tables)


HEADER = """<!-- GENERATED, by `just erd` (api/scripts/erd.py). Do not edit this file by hand:
     it is introspected from the migrations, and tests/test_schema_doc.py fails when it and
     they disagree. Change alembic/versions/, then regenerate. -->

# Database schema — Student Attendance Tracker

> **Scope:** current implementation. Introspected from an empty database with `alembic upgrade
> head` run against it, which is the command the deploy job runs, so this is what
> `alembic/versions` produces rather than what `app/models` believes it produces. Those two can
> drift, and when they do, production has the migrations.
> **Code:** `alembic/versions`, `scripts/erd.py`, `tests/test_schema_doc.py`
> **Arrows:** one foreign key each, drawn parent to child. `||` means the child always has a
> parent — its key is NOT NULL — and `|o` that it may have none; `o{` means zero or more
> children. The label names the child's columns.
> **Attributes:** at most one key marker (PK, else FK, else UK), and `nullable` where the column
> accepts null. Types carry no length or precision: the migration is the authority on those, and
> a second copy here is a second place to update.
> **Not drawn:** defaults, check constraints, and `alembic_version` — the migration runner's
> bookkeeping, not a table of this domain. Indexes and delete behaviour are below the diagram,
> because a line cannot carry either.
> **Authorization is not in this picture.** There is no row-level security. A foreign key to
> `users` records which teacher owns a row and refuses nothing: INV-1 is enforced in
> `app/services/class_service.py`, the one site `tests/test_authorization.py` proves from the
> denied side, and a query written without it reads every teacher's rows (`INVARIANTS.md`).
> **Every `timestamptz` holds an instant, and every date filter means a local day** in
> APP_TIMEZONE (default Europe/Helsinki). `attendance_records.timestamp` is compared against
> local-midnight boundaries rather than UTC ones, so the column's type says less than the
> queries do — spec 0009, spec 0011 and
> `docs/adr/0011-list-attendance-dates-are-local-days.md`.

```mermaid
erDiagram
"""

DELETE_SECTION = """
## What a delete destroys

`CASCADE` here is a decision rather than a default: deleting a Class destroys its students and
every attendance record in it, and deleting a Student destroys that student's whole history. The
school holds the course credit and this app is a tally sheet, so the Owner declined to make that
an invariant — `INVARIANTS.md`, *Deliberately not invariants*. `SET NULL` keeps the row and
forgets who it pointed at; `NO ACTION` is PostgreSQL's default, and refuses the delete instead.

| child | column | parent | on delete |
| --- | --- | --- | --- |
"""

INDEX_SECTION = """
## Indexes

A unique index is a rule, not a speed-up. `ix_students_name_class_unique` is the one to know: it
is over `lower(name)` rather than `name`, which is what makes a class's student names
case-insensitively unique, and it is the reason two spellings of one student cannot both exist
(`GLOSSARY.md`, *Student*).

| table | index | over | unique |
| --- | --- | --- | --- |
"""


def render(tables: tuple[Table, ...]) -> str:
    lines = [HEADER.rstrip("\n")]

    for table in tables:
        lines.append(f"  {table.name} {{")
        for column in table.columns:
            marker = f" {column.key}" if column.key else ""
            comment = ' "nullable"' if column.nullable else ""
            lines.append(f"    {column.type} {column.name}{marker}{comment}")
        lines.append("  }")

    relationships = []
    for table in tables:
        for fk in table.foreign_keys:
            parent_side = "|o" if fk.optional else "||"
            child_side = "o|" if fk.at_most_one else "o{"
            label = ", ".join(fk.columns)
            relationships.append(
                f"  {fk.parent} {parent_side}--{child_side} {table.name} : \"{label}\""
            )
    if relationships:
        lines.append("")
        lines.extend(sorted(relationships))

    lines.append("```")
    lines.append(DELETE_SECTION.rstrip("\n"))
    for table in tables:
        for fk in table.foreign_keys:
            columns = ", ".join(f"`{c}`" for c in fk.columns)
            lines.append(
                f"| `{table.name}` | {columns} | `{fk.parent}` | `{fk.on_delete}` |"
            )

    lines.append(INDEX_SECTION.rstrip("\n"))
    for table in tables:
        for index in table.indexes:
            over = ", ".join(f"`{c}`" for c in index.columns)
            lines.append(
                f"| `{table.name}` | `{index.name}` | {over} | {'yes' if index.unique else 'no'} |"
            )

    return "\n".join(lines) + "\n"


def _migrate(url: URL) -> None:
    """`alembic upgrade head`, the deploy job's command, against the database `url` names.

    env.py reads the target from `settings.database_url` and overrides alembic.ini's, so the URL
    is handed over as DATABASE_URL in the environment rather than through the config. The rest of
    the environment comes along because app/config.py is an import-time singleton that also
    requires SECRET_KEY, DOCS_USERNAME and DOCS_PASSWORD — the same set tests/conftest.py needs.
    """
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR,
        env={**os.environ, "DATABASE_URL": url.render_as_string(hide_password=False)},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"alembic upgrade head failed ({result.returncode}):\n"
            f"{result.stdout}\n{result.stderr}"
        )


async def _statement(url: URL, statement: str) -> None:
    """One statement outside a transaction — CREATE/DROP DATABASE cannot run inside one."""
    engine = create_async_engine(url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            await connection.execute(text(statement))
    finally:
        await engine.dispose()


async def _introspect(url: URL) -> tuple[Table, ...]:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(_read_schema)
    finally:
        await engine.dispose()


async def render_from_migrations(server_url: str) -> str:
    """The document, from a throwaway database this creates, migrates, reads and drops.

    `server_url` names the server and supplies the credentials; its own database is only
    connected to in order to issue CREATE/DROP DATABASE, and is never written to.
    """
    base = make_url(server_url)
    name = f"{ERD_DB_PREFIX}{uuid.uuid4().hex[:12]}"
    if not name.startswith(ERD_DB_PREFIX):  # pragma: no cover — the guard on the only DROP
        raise RuntimeError(f"refusing to manage a database named {name!r}")

    await _statement(base, f'CREATE DATABASE "{name}"')
    try:
        target = base.set(database=name)
        _migrate(target)
        return render(await _introspect(target))
    finally:
        # WITH (FORCE) because a lingering connection would otherwise leave the database behind,
        # and the next run would create another one beside it.
        await _statement(base, f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def main() -> int:
    server_url = os.getenv("TEST_DATABASE_URL")
    if not server_url:
        print(
            "TEST_DATABASE_URL is not set. This creates a throwaway database on that server,\n"
            "migrates it, reads it and drops it again — it never touches the database in the URL.\n"
            '  eval "$(just test-db-up)"   # disposable PostgreSQL on port 5439\n'
            "  just erd\n"
            "Do NOT point this at port 5433: that is another project's container.",
            file=sys.stderr,
        )
        return 1

    document = asyncio.run(render_from_migrations(server_url))
    existing = DOC_PATH.read_text() if DOC_PATH.exists() else None
    DOC_PATH.write_text(document)
    where = DOC_PATH.relative_to(API_DIR)
    print(f"{'unchanged' if document == existing else 'rewrote'} {where}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
