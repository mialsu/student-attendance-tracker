"""Tests for the command-line tool's `target()` helper.

The spec deliberately gave the script no tests: "with all behaviour in the service, the script is
argument parsing and printing... proven by a live exercise instead of a test." That was right
about the *behaviour* and wrong about this one function, and AC-17 found out on the production
server: `target()` used `urllib.parse.urlparse(...).port`, which raises `ValueError` when the
password contains a `/` — ordinary in a generated password. The tool worked on every machine with
a simple password and was unusable in production, and the uncaught error quoted a fragment of the
production password into a traceback.

So this file covers exactly the part a live exercise could not cover cheaply: URL shapes. It is a
pure function of a string, which is the one thing in that script worth a test.
"""

import pytest

from app.config import settings
from scripts.registration_code import target


@pytest.fixture
def database_url(monkeypatch):
    """Point `settings.database_url` at a URL for the duration of one test."""

    def _set(url: str):
        monkeypatch.setattr(settings, "database_url", url, raising=True)

    return _set


class TestTargetNamesTheDatabase:
    def test_a_plain_url(self, database_url):
        database_url("postgresql+asyncpg://attendance_user:simple@localhost:5436/attendance_tracker")
        assert target() == "attendance_user@localhost:5436/attendance_tracker"

    @pytest.mark.parametrize(
        "password",
        [
            "AbcDef+123/xyz",   # THE production shape: a '/' truncated urlparse's netloc
            "sl/ash/es",
            "plus+signs",
            "at%40sign",     # a literal '@' MUST be percent-encoded; unencoded is ambiguous
            "colon:inside",
            "SJZ+/iNrQ==",      # base64 output, which is what a generated password looks like
            "%percent%",
            "trailing/",
        ],
    )
    def test_a_generated_password_does_not_break_it(self, database_url, password):
        database_url(f"postgresql+asyncpg://attendance_user:{password}@db:5432/attendance_tracker")
        assert target() == "attendance_user@db:5432/attendance_tracker"

    @pytest.mark.parametrize(
        "password",
        ["AbcDef+123/xyz", "sl/ash/es", "SJZ+/iNrQ==", "colon:inside"],
    )
    def test_the_password_never_appears_in_the_output(self, database_url, password):
        """The whole purpose of this function: name the database, not the credential."""
        database_url(f"postgresql+asyncpg://attendance_user:{password}@db:5432/attendance_tracker")
        out = target()
        assert password not in out
        # Nor any run of it long enough to matter — the old bug leaked a leading fragment.
        assert password[:6] not in out

    def test_an_unencoded_at_sign_is_ambiguous_and_that_is_the_url_format_s_rule(
        self, database_url
    ):
        """Documented, not fixed: `pa@ss` is not a valid password in a URL — encode it `pa%40ss`.

        SQLAlchemy splits the credential at the FIRST `@`, so an unencoded one silently moves
        part of the password into the host. Asserted here so nobody later reads this as our bug
        and "fixes" it by hand-rolling a parser again, which is what caused the outage.
        """
        database_url("postgresql+asyncpg://attendance_user:at@sign@db:5432/attendance_tracker")
        assert target() == "attendance_user@sign@db:5432/attendance_tracker"

    def test_a_url_with_no_port(self, database_url):
        database_url("postgresql+asyncpg://attendance_user:pw@db/attendance_tracker")
        assert target() == "attendance_user@db:None/attendance_tracker"

    def test_an_unparseable_url_says_so_and_nothing_else(self, database_url):
        """`target()` is called from the failure path, so it must not fail, and must not leak."""
        database_url("this is not a url at all")
        assert target() == "<unparseable DATABASE_URL>"

    def test_it_never_raises_whatever_it_is_given(self, database_url):
        for url in ("", "://", "postgresql+asyncpg://", "@@@", "postgres://u:p/@:/"):
            database_url(url)
            target()  # the assertion is that this line does not raise
