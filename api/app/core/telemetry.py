"""OpenTelemetry tracing: the wiring, and the switch that keeps it off by default.

Tracing is configured through the SDK's own `OTEL_*` environment variables rather than through
`app.config.Settings`. Two reasons: the SDK already reads them (`OTEL_SERVICE_NAME`,
`OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER`), so a parallel set of settings fields would be
a second name for one thing; and `Settings` is an import-time singleton that every test and every
alembic run constructs, which is the last place to add a new required value.

The rule worth knowing: **no endpoint means no tracing.** `setup_telemetry` returns False and
touches nothing when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset. That is what keeps the test suite and
a bare `just run` unaffected -- `tests/conftest.py` imports `app.main`, so this function runs at
test-collection time whether the suite wants it to or not.

What lands in a span, checked against the installed packages rather than assumed (ADR-0006):
bound parameters are never recorded, so student names do not arrive through SQL. `http.url` does
carry the full query string, which on the autocomplete route is a partial student name. That is
why the trace store is bound to localhost and reachable only over an SSH tunnel.
"""

import os

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from sqlalchemy.ext.asyncio import AsyncEngine

ENDPOINT_VAR = "OTEL_EXPORTER_OTLP_ENDPOINT"

# Routes whose spans would outnumber the interesting ones without ever answering a question.
# /health alone takes 30 hits from the deploy job's readiness loop on every single deploy.
EXCLUDED_URLS = "health,docs,redoc,openapi.json"


def setup_telemetry(app: FastAPI, engine: AsyncEngine) -> bool:
    """
    Wire OTLP tracing for the FastAPI app and the SQLAlchemy engine.

    Args:
        app: The FastAPI application to instrument.
        engine: The application's async engine. Its `.sync_engine` is what gets instrumented --
            SQLAlchemy's instrumentation registers core event listeners, which the AsyncEngine
            wrapper does not carry, so passing the async object yields no SQL spans and no error.

    Returns:
        True when tracing was configured; False when no endpoint is set and nothing was touched.
    """
    if not os.environ.get(ENDPOINT_VAR, "").strip():
        return False

    # service.name and friends come from OTEL_SERVICE_NAME / OTEL_RESOURCE_ATTRIBUTES via the
    # SDK's own resource detector, and the sampler defaults to parentbased_always_on -- the 100%
    # sampling this traffic volume wants. Neither needs stating here.
    provider = TracerProvider()

    # Batch, never Simple: export runs on a background thread, so a Jaeger that is down or slow
    # costs log noise rather than request latency. The exporter retries with backoff inside its
    # 10s timeout and then drops the batch; it never raises into the request path.
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls=EXCLUDED_URLS,
        tracer_provider=provider,
    )
    SQLAlchemyInstrumentor().instrument(
        engine=engine.sync_engine,
        tracer_provider=provider,
    )
    return True
