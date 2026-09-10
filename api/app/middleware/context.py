"""Per-request context, and the one line an unhandled exception leaves behind.

Two jobs, and the second is here because of the first. The context variables -- request id,
client IP, route, teacher -- are set for the duration of one request; the `ERROR` line for an
unhandled exception is emitted from the `except` clause below, which is the last place in the
stack that can still read them.

Pure ASGI rather than `BaseHTTPMiddleware`, and the reason is context variables. Starlette runs a
`BaseHTTPMiddleware` dispatch and the app it wraps in DIFFERENT anyio tasks, so a variable set
downstream -- `teacher_id`, which `get_current_user` sets -- would not be visible to code reading
it from the middleware's side of that boundary. A pure ASGI middleware adds no task, so the whole
request, its dependencies, its endpoint and the exception handler all share one context.

**Why the error line is not an app-level `Exception` handler**, which is where a reader would
look for it first: Starlette builds `ServerErrorMiddleware` OUTSIDE every user middleware, so a
handler registered there runs after the `finally` below has reset all four variables. Measured
rather than argued -- planted as a change, the line still appears and carries `event`, `level`
and `exception` and **nothing else**: no request id, no teacher, no route. An error line with no
owner is the exact thing spec 0005 exists to fix, so
`test_an_unhandled_exception_emits_one_error_line_with_teacher_route_and_request_id` fails on it.

`app.middleware` is covered by its own import-linter contract (AC-15): it may reach down into
`app.core` and nothing else. It was an empty stub before slice 1, so it was in no contract at
all, which made it the one package where real code would have landed ungoverned.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable

from app.core.logging import (
    client_ip_var,
    log_event,
    request_id_var,
    route_var,
    teacher_id_var,
)

REQUEST_ID_HEADER = b"x-request-id"

# nginx SETS this one from $remote_addr, so a client cannot choose its value.
#
# X-Forwarded-For is deliberately NOT read: production sets it with
# `$proxy_add_x_forwarded_for`, which APPENDS to whatever the client sent, so its left-hand
# entries are attacker-chosen. A denial line whose client IP can be forged by the party being
# recorded is worse than one carrying the proxy's own address.
REAL_IP_HEADER = b"x-real-ip"

# An incoming request id is honoured verbatim (AC-9) because nginx's `$request_id` is what makes
# a log line joinable to an access line. It is also client-supplied text, so it is bounded: JSON
# encoding already makes a forged second line impossible, but nothing else stops an 8 KB header
# becoming an 8 KB log line on every request.
MAX_REQUEST_ID_LENGTH = 200

Scope = dict
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]


def _header(scope: Scope, name: bytes) -> str | None:
    """First value of a header, decoded, or None when it is absent or empty."""
    for key, value in scope.get("headers", []):
        if key == name:
            decoded = value.decode("latin-1").strip()
            return decoded or None
    return None


class RequestContextMiddleware:
    """Set the request-context variables for the duration of one HTTP request."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, REQUEST_ID_HEADER)
        request_id = incoming[:MAX_REQUEST_ID_LENGTH] if incoming else str(uuid.uuid4())

        client = scope.get("client")
        client_ip = _header(scope, REAL_IP_HEADER) or (client[0] if client else None)

        # `scope["path"]` carries no query string, which is what keeps a Student's name out of
        # the `route` field by construction rather than by remembering to strip it. The four
        # places a name arrives as free text are all query parameters or body fields
        # (ADR-0007); none of them is ever part of the path.
        # teacher_id is set to None here and filled in later by `get_current_user`, which is
        # where authentication actually resolves. It is claimed here so that this middleware owns
        # the reset of EVERY context variable: without that, a teacher id set during one request
        # would still be set during the next one that never authenticated, and an anonymous
        # denial line would name whoever was refused before it.
        tokens = (
            request_id_var.set(request_id),
            client_ip_var.set(client_ip),
            route_var.set(scope["path"]),
            teacher_id_var.set(None),
        )
        try:
            await self.app(scope, receive, send)
        except Exception as exc:
            # Inside the try, so the `finally` below has not reset the context yet -- the
            # module docstring has why this cannot be an app-level handler instead.
            #
            # **The exception's TYPE, never its message.** `str(exc)` is free text assembled by
            # whatever failed, and what a service function has in hand is very often a Student's
            # name -- the same hazard `app/api/handlers.py` refuses `detail` for. A class name
            # comes from source code and cannot carry data (ADR-0007).
            #
            # No `status`: this middleware does not render the response and cannot observe it.
            # `ServerErrorMiddleware` returns 500 only if the response has not already started,
            # so a line asserting 500 would be wrong for a failure part-way through a stream.
            #
            # The line precedes uvicorn's traceback for the same exception in the container
            # log, because it is written before the exception leaves the app. Measured against
            # real uvicorn rather than assumed, and the naive version of this sentence was
            # wrong: uvicorn's own ACCESS line for the request sits between the two. So the
            # join is by `request_id`, which the access line does not carry -- proximity is a
            # convenience, not the mechanism.
            #
            # `"error"` inline rather than behind a constant, matching `"denial"` in
            # `app/api/handlers.py`: slice 5's drift check reads logger CALL SITES, and a name
            # it has to resolve through an import is a name it cannot check.
            log_event(logging.ERROR, "error", exception=type(exc).__name__)
            raise
        finally:
            # Reset rather than leave set. Under the ASGI server each request owns its task and
            # the values would die with it, but the test suite drives the app through
            # httpx's ASGITransport in the TEST's own task, where a leaked value would show up
            # as the previous request's id on the next one.
            request_id_var.reset(tokens[0])
            client_ip_var.reset(tokens[1])
            route_var.reset(tokens[2])
            teacher_id_var.reset(tokens[3])
