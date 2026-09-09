"""Per-request context: the id that joins a log line to nginx, the client IP, and the route.

Pure ASGI rather than `BaseHTTPMiddleware`, and the reason is context variables. Starlette runs a
`BaseHTTPMiddleware` dispatch and the app it wraps in DIFFERENT anyio tasks, so a variable set
downstream -- `teacher_id`, which `get_current_user` sets -- would not be visible to code reading
it from the middleware's side of that boundary. A pure ASGI middleware adds no task, so the whole
request, its dependencies, its endpoint and the exception handler all share one context.

`app.middleware` is covered by its own import-linter contract (AC-15): it may reach down into
`app.core` and nothing else. It was an empty stub before this slice, so it was in no contract at
all, which made it the one package where real code would have landed ungoverned.
"""

import uuid
from collections.abc import Awaitable, Callable

from app.core.logging import client_ip_var, request_id_var, route_var, teacher_id_var

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
        finally:
            # Reset rather than leave set. Under the ASGI server each request owns its task and
            # the values would die with it, but the test suite drives the app through
            # httpx's ASGITransport in the TEST's own task, where a leaked value would show up
            # as the previous request's id on the next one.
            request_id_var.reset(tokens[0])
            client_ip_var.reset(tokens[1])
            route_var.reset(tokens[2])
            teacher_id_var.reset(tokens[3])
