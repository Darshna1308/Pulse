import json
from pathlib import Path

import numpy as np
import pandas as pd

from pulse_ml.context import CONTEXT_COLUMNS, add_context

FIXTURE = Path(__file__).parent / "fixtures" / "context_parity.json"


def test_window_counts_include_current_event_and_respect_bounds():
    t0 = 1_700_000_000_000
    df = pd.DataFrame(
        {
            "ts_ms": [t0, t0 + 30_000, t0 + 61_000, t0 + 301_000],
            "client_id": ["a", "a", "a", "a"],
            "method": ["GET", "POST", "GET", "GET"],
            "route": ["/x", "/login", "/x", "/y"],
            "status_code": [200, 401, 500, 200],
            "latency_ms": [10.0, 20.0, 30.0, 40.0],
            "request_bytes": [0, 100, 0, 0],
            "response_bytes": [10, 20, 30, 40],
        }
    )
    out = add_context(df)
    assert out["client_requests_1m"].tolist() == [1, 2, 2, 1]
    assert out["client_requests_5m"].tolist() == [1, 2, 3, 3]  # t0 drops out of the last window
    assert out["client_errors_5m"].tolist() == [0, 1, 2, 2]
    assert out["client_auth_failures_5m"].tolist() == [0, 1, 1, 1]
    assert out["client_distinct_routes_5m"].tolist() == [1, 2, 2, 3]
    # Fewer than 5 earlier events on each endpoint: no baseline yet.
    assert out["route_latency_baseline_ms"].isna().all()


def test_route_baseline_is_trailing_median_of_earlier_events_on_same_endpoint():
    t0 = 1_700_000_000_000
    lat = [10.0, 20.0, 30.0, 40.0, 1000.0, 50.0]
    df = pd.DataFrame(
        {
            "ts_ms": [t0 + i * 1000 for i in range(6)],
            "client_id": [f"c{i}" for i in range(6)],
            "method": ["GET"] * 6,
            "route": ["/x"] * 6,
            "status_code": [200] * 6,
            "latency_ms": lat,
            "request_bytes": [0] * 6,
            "response_bytes": [100] * 6,
        }
    )
    out = add_context(df)
    assert np.isnan(out["route_latency_baseline_ms"].iloc[4])
    assert out["route_latency_baseline_ms"].iloc[5] == 30.0  # median of the 5 earlier, robust to 1000


def test_parity_fixture_matches():
    """Shared contract with the Node API's context service (apps/api tests read the same file)."""
    fixture = json.loads(FIXTURE.read_text())
    df = pd.DataFrame(fixture["events"])
    out = add_context(df)
    for row, expected in zip(out.to_dict("records"), fixture["expected"]):
        for col in CONTEXT_COLUMNS:
            want, got = expected[col], row[col]
            if want is None:
                assert got is None or np.isnan(got), (col, row)
            else:
                assert got == want, (col, row, expected)
