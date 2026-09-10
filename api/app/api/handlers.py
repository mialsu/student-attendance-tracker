"""Exception handlers: the one place that turns a refusal into a log line.

Spec 0005 puts the denial logging here rather than at each raise site, because every denial in
this app raises an `HTTPException` -- the custom exceptions in `app/core/exceptions.py` all
subclass it -- so one handler sees them all and has the `Request` in hand.

**Two mechanisms here, and one deliberate exception elsewhere.** `ForbiddenException` is
identified by TYPE, which is exact because it is raised in exactly one place. Every other
refusal this file logs identifies ITSELF, carrying a `rule` and a `reason` set at the raise site
(slice 2).

The exception is `auth_service.authenticate_user`, which logs its own three branches and never
relies on this file. It has to: two of the three deliberately return a byte-identical response,
so by the time the exception arrives here the distinction has already been erased. That is the
one thing a handler cannot recover, which is why it is the one place spec 0005 puts an explicit
call. So a reader looking for every source of a `denial` line needs this file and that function,
and nothing else.

The asymmetry is not untidiness -- each is the only mechanism that works where it is used.
Type identification cannot be forgotten, so INV-1 keeps it and `scripts/drift-extra.sh` check 4
keeps the single raise site true. But `BadRequestException` is raised at fourteen sites and two
of them interpolate a Student's name into the message, so type alone would either miss the
denials or leak a name. There, opt-in labelling is what makes the silent refusals silent by
construction. `app/core/exceptions.py` carries the same reasoning at the other end.

`detail` is never logged, from any exception. It is the one field that carries free text a
Student's name can reach.

**The response is not this handler's business.** It logs, then delegates to FastAPI's own
`http_exception_handler`, so the bytes a client receives are byte-identical to what they were
before this file existed. That matters beyond tidiness: spec 0005's AC-2 requires all three
`authenticate_user` branches to keep returning the same response while becoming distinguishable
in the log, and a handler that rendered its own body would quietly break that.
"""

import logging

from fastapi import Request, Response
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import BadRequestException, ForbiddenException
from app.core.logging import log_event

# INV-1's rule id, carried on the line so a reader greps for the rule rather than for a status
# code. `ForbiddenException` is raised in exactly ONE place in `app/` --
# `class_service.verify_class_ownership` -- which is what makes this label exact rather than a
# guess from the status code. Spec 0003 consolidated it there, and `scripts/drift-extra.sh`
# check 4 fails a diff that adds a teacher_id comparison anywhere else.
INV_1 = "INV-1"


async def http_exception_log_handler(request: Request, exc: Exception) -> Response:
    """Log the denials slice 1 owns, then render the unchanged response.

    Args:
        request: The request that was refused. Its `url.path` is deliberately **not** read here --
            the route comes from the request-context variable the middleware set, which holds the
            path without the query string. The query string is where a Student's name arrives as
            free text, and ADR-0007 forbids it reaching a line.
        exc: The exception raised, typed as `Exception` because that is how Starlette types its
            handler registry, and narrowed below. Identity is by TYPE, not by status code: a
            plain 403 from somewhere else would not be an INV-1 denial and must not be labelled
            as one.

    Returns:
        FastAPI's own response for this exception, unmodified.

    Raises:
        Exception: Whatever it was given, if it is not an `HTTPException`. Only a wiring mistake
            can produce that, and re-raising sends it to the server's own error path rather than
            rendering it as an HTTP error with an invented status.
    """
    if isinstance(exc, ForbiddenException):
        # Ids and a status. No detail message: it is built from the caller's `action` phrase and
        # says nothing the route does not, and every field here has to justify itself against
        # a sink whose retention is size-based only.
        log_event(logging.WARNING, "denial", rule=INV_1, status=exc.status_code)
    elif isinstance(exc, BadRequestException) and exc.reason is not None:
        # A refusal that labelled itself. `isinstance` rather than `getattr` so mypy sees real
        # attributes and this needs no suppression comment to type-check.
        #
        # `rule` is omitted when the raise site set none, because the formatter drops only the
        # request-context fields it manages -- an event field passed as None would print as
        # `"rule": null`, and a reader grepping for INV-6 would have to know that a null rule
        # means "no invariant" rather than "nobody filled it in".
        fields = {"reason": exc.reason, "status": exc.status_code}
        if exc.rule is not None:
            fields["rule"] = exc.rule
        log_event(logging.WARNING, "denial", **fields)

    if not isinstance(exc, StarletteHTTPException):
        raise exc

    return await http_exception_handler(request, exc)
