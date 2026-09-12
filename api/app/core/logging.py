"""One JSON line per event, to stdout, where the sink and its rotation already exist.

Spec 0005 and ADR-0007 hold the decisions; this docstring holds the ones a reader of this file
needs.

**A log line identifies people by opaque id. A Student's name never appears in one** (ADR-0007,
becoming INV-9 in slice 5). The reason is reversibility running the unusual way: adding a name
later is trivial, removing one is not, because the sink rotates by SIZE only and at this app's
volume a line written today effectively never ages out.

**JSON, not plain text**, and the reason is not tidiness. Denial lines carry attacker-supplied
text -- an attempted email -- and `json.dumps` escapes an embedded newline, so a forged second
line is impossible by construction rather than by remembering to escape at every call site. A
standard with no enforcer is a suggestion; this one is enforced by the serializer.

**`app.core` is a forbidden-source leaf** in the import-linter contracts, so this module imports
only the standard library and `opentelemetry.trace`. That is what lets the middleware, the
dependencies and every service call it without inverting a layer.

**The level comes from `os.environ`, not from `Settings`.** `app/config.py` is an import-time
singleton that every test and every alembic run constructs, so a new required field there breaks
`tests/conftest.py` at import. This is `telemetry.py`'s pattern, for the reason ADR-0006 gives.

**uvicorn is left alone.** `uvicorn` and `uvicorn.access` both carry `propagate = False` with
their own handlers, so this logger does not capture them and the container log carries two shapes
by design. Reformatting them would touch the traceback path that demonstrably works today.
"""

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from opentelemetry import trace

LOGGER_NAME = "app"

LEVEL_VAR = "LOG_LEVEL"
DEFAULT_LEVEL = logging.INFO

# The key on a LogRecord that carries event-specific fields. A dedicated key rather than
# `extra={...}` spread across the record: `extra` writes straight onto the LogRecord, where a
# field named `message`, `levelname` or `args` would silently collide with logging's own.
FIELDS_ATTR = "log_fields"

# Request context. Set by app.middleware.context per request and by get_current_user once
# authentication resolves, then read here -- which is what lets a service-layer call carry
# request context without threading a parameter through every signature.
#
# Context variables are per-process AND per-task, which is what makes them correct under
# `uvicorn --workers 4`. Each var defaults to None and the formatter OMITS a field that is None,
# so a line never carries an empty string pretending to be a value.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
client_ip_var: ContextVar[str | None] = ContextVar("client_ip", default=None)
route_var: ContextVar[str | None] = ContextVar("route", default=None)
teacher_id_var: ContextVar[str | None] = ContextVar("teacher_id", default=None)

# An all-zero trace id is what OpenTelemetry reports when no span is recording. It looks like a
# trace that can be opened in Jaeger and is not, so the field is omitted instead -- see
# `_trace_id`.
INVALID_TRACE_ID = 0


def resolve_level() -> int:
    """Read the level from `LOG_LEVEL`, falling back to the default.

    Case and surrounding whitespace do not decide whether logging works, and a typo falls back
    rather than silencing the log or raising at import.

    Returns:
        A `logging` level integer.
    """
    raw = os.environ.get(LEVEL_VAR, "").strip().upper()
    if not raw:
        return DEFAULT_LEVEL

    # getLevelName maps a known name to its int and returns the string "Level LOUD" for anything
    # it does not know -- so a non-int answer means the value was a typo.
    level = logging.getLevelName(raw)
    return level if isinstance(level, int) else DEFAULT_LEVEL


def _trace_id() -> str | None:
    """The current trace id as 32 hex characters, or None when tracing is off.

    `opentelemetry-api` is already installed and `telemetry.py` already imports it, so this needs
    no new package: `opentelemetry-instrumentation-logging` was investigated and rejected.
    `is_valid` is False whenever no endpoint is configured, which is what lets the field be
    omitted rather than zero-filled.
    """
    context = trace.get_current_span().get_span_context()
    if not context.is_valid or context.trace_id == INVALID_TRACE_ID:
        return None
    return format(context.trace_id, "032x")


class JsonLineFormatter(logging.Formatter):
    """Render a record as one JSON object on one line.

    Field order is deliberate rather than alphabetical: the four a human scans first come first,
    then the request context, then whatever the call site added. `json.dumps` is called with no
    `indent`, so the object cannot span lines whatever a value contains.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            # The message IS the event name. Call sites pass a short machine-readable token
            # ("denial"), never a sentence, so the log stays greppable by event.
            "event": record.getMessage(),
        }

        context = {
            "request_id": request_id_var.get(),
            "teacher_id": teacher_id_var.get(),
            "client_ip": client_ip_var.get(),
            "route": route_var.get(),
            "trace_id": _trace_id(),
        }
        payload.update({key: value for key, value in context.items() if value is not None})

        fields = getattr(record, FIELDS_ATTR, None)
        if fields:
            payload.update(fields)

        # default=str so an unexpected UUID or datetime in a field cannot raise inside logging
        # and lose the line. ensure_ascii keeps a name-free line ASCII-only for any reader.
        return json.dumps(payload, default=str)


class _AppJsonHandler(logging.StreamHandler):
    """The handler `configure_logging` installs, as a type rather than a flag.

    A marker subclass rather than an attribute stuck onto a StreamHandler instance: idempotency
    is then an `isinstance` check mypy can see, instead of a duck-typed attribute that needed a
    suppression comment to type-check at all. The drift gate refuses an escape hatch arriving
    without a confession, and it was right to -- the subclass is both shorter and honest.
    """


def get_logger() -> logging.Logger:
    """The application's one logger.

    Returns:
        The `app` logger. Every module shares it, so `LOG_LEVEL` governs the whole application
        and a reader greps one stream.
    """
    return logging.getLogger(LOGGER_NAME)


def log_event(level: int, event: str, **fields: Any) -> None:
    """Emit one event line.

    Args:
        level: A `logging` level integer.
        event: Short machine-readable event name, e.g. "denial". Not a sentence.
        **fields: Event-specific fields. **Ids and counts only -- never a Student's name**
            (ADR-0007). Request context is added by the formatter and must not be passed here.
    """
    get_logger().log(level, event, extra={FIELDS_ATTR: fields})


def configure_logging() -> logging.Logger:
    """Attach the JSON handler to the `app` logger, once.

    Idempotent, because `app.main` is imported by the test suite as well as by uvicorn and a
    second handler would double every line.

    `propagate = False`: the root logger may carry a handler of its own (pytest installs one),
    and a JSON line reprinted in another format is one event that reads as two.

    Returns:
        The configured logger.
    """
    logger = get_logger()
    logger.setLevel(resolve_level())
    logger.propagate = False

    if not any(isinstance(h, _AppJsonHandler) for h in logger.handlers):
        handler = _AppJsonHandler(sys.stdout)
        handler.setFormatter(JsonLineFormatter())
        logger.addHandler(handler)

    return logger
