"""Tracing is off unless an endpoint is configured, and wires both instrumentations when it is.

Why this file exists at all: `tests/conftest.py` does `from app.main import app`, so
`setup_telemetry` runs at test-collection time in every single pytest session. If it ever stopped
returning early without an endpoint, the whole suite would start building a TracerProvider and a
background export thread aimed at nothing. That is the regression these tests catch.

Every test here instruments a THROWAWAY FastAPI app and a throwaway engine. Instrumenting the
real `app.main:app` would leave middleware on the object every other test shares.
"""

import pytest
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.telemetry import ENDPOINT_VAR, setup_telemetry

OTEL_MIDDLEWARE = "OpenTelemetryMiddleware"

# The real stack is 8 deep; the bound stops a malformed chain becoming an infinite walk.
_MAX_STACK_DEPTH = 20


def _throwaway_engine() -> AsyncEngine:
    """An engine that never connects — create_async_engine opens nothing until first use."""
    return create_async_engine("sqlite+aiosqlite:///:memory:")


def _otel_middleware_on(app: FastAPI) -> bool:
    """Walk the BUILT middleware stack looking for OpenTelemetryMiddleware.

    Not `app.user_middleware`: `instrument_app` does not call `add_middleware`. It replaces
    `app.build_middleware_stack` and injects itself when Starlette assembles the stack, so an
    instrumented app has an empty `user_middleware` and the middleware still runs. Checking the
    built stack is the difference between asserting a flag and asserting the request path.
    """
    node = app.build_middleware_stack()
    for _ in range(_MAX_STACK_DEPTH):
        if type(node).__name__ == OTEL_MIDDLEWARE:
            return True
        node = getattr(node, "app", None)
        if node is None:
            return False
    return False


@pytest.mark.parametrize("value", [None, "", "   "])
def test_setup_telemetry_does_nothing_without_a_usable_endpoint(monkeypatch, value):
    """No endpoint, a blank one, or whitespace: return False and leave the app untouched.

    The blank cases matter more than they look. `OTEL_EXPORTER_OTLP_ENDPOINT: ""` in a compose
    file is how someone turns tracing off, and an empty string is truthy enough to get past a
    naive `in os.environ` check and hand the exporter an unusable endpoint.
    """
    if value is None:
        monkeypatch.delenv(ENDPOINT_VAR, raising=False)
    else:
        monkeypatch.setenv(ENDPOINT_VAR, value)

    app = FastAPI()

    assert setup_telemetry(app, _throwaway_engine()) is False
    assert not _otel_middleware_on(app)


def test_setup_telemetry_wires_both_instrumentations_when_an_endpoint_is_set(monkeypatch):
    """With an endpoint, the app gets the OTel middleware and SQLAlchemy gets instrumented.

    Note what is NOT asserted: that spans reach a collector. Nothing is listening on this
    endpoint, and the exporter's whole design is to fail quietly on a background thread. Proving
    spans arrive is the live exercise against a real Jaeger, not a unit test.
    """
    monkeypatch.setenv(ENDPOINT_VAR, "http://localhost:4318")
    app = FastAPI()

    try:
        assert setup_telemetry(app, _throwaway_engine()) is True
        assert _otel_middleware_on(app)
        assert SQLAlchemyInstrumentor().is_instrumented_by_opentelemetry
    finally:
        # Both instrumentors are singletons carrying process-wide state, so leaving them on
        # would leak into whatever test runs next.
        SQLAlchemyInstrumentor().uninstrument()
        FastAPIInstrumentor.uninstrument_app(app)
