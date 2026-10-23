from __future__ import annotations

import pandas as pd


def event(**overrides) -> dict:
    """A typical, unremarkable request with realistic context."""
    base = {
        "method": "GET",
        "route": "/v1/products/{id}",
        "status_code": 200,
        "latency_ms": 32.0,
        "request_bytes": 0,
        "response_bytes": 2400,
        "ts_ms": 1_767_621_600_000,  # 2026-01-05T14:00:00Z
        "client_id": "client_001",
        "client_requests_1m": 2,
        "client_requests_5m": 8,
        "client_errors_5m": 0,
        "client_auth_failures_5m": 0,
        "client_distinct_routes_5m": 4,
        "route_latency_baseline_ms": 32.0,
        "route_request_bytes_baseline": 0.0,
        "route_response_bytes_baseline": 2400.0,
    }
    base.update(overrides)
    return base


def credential_stuffing_event() -> dict:
    return event(
        method="POST",
        route="/v1/auth/login",
        status_code=401,
        latency_ms=170.0,
        request_bytes=260,
        response_bytes=200,
        client_requests_1m=140,
        client_requests_5m=600,
        client_errors_5m=560,
        client_auth_failures_5m=550,
        client_distinct_routes_5m=1,
        route_latency_baseline_ms=180.0,
        route_request_bytes_baseline=260.0,
        route_response_bytes_baseline=420.0,
    )


def frame(*rows: dict) -> pd.DataFrame:
    return pd.DataFrame(list(rows))
