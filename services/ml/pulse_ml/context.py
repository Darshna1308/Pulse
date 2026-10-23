"""Windowed context features.

These are the per-event aggregates the Node API computes from MongoDB at ingestion
time (see apps/api/src/services/context.service.ts). This module computes the same
values for offline datasets so training data and live inference share one definition.

Definitions (timestamps in milliseconds, all windows scoped to one project):

* client_requests_1m       events from the same client with ts in [t - 60s, t]
* client_requests_5m       events from the same client with ts in [t - 300s, t]
* client_errors_5m         of those, status_code >= 400
* client_auth_failures_5m  of those, status_code in (401, 403)
* client_distinct_routes_5m  distinct endpoints (method + route template) among those
* route_latency_baseline_ms     median latency, request size and response size of the
  route_request_bytes_baseline  most recent <= 500 events on the same endpoint (method +
                                route template, any client)
  route_response_bytes_baseline with ts in [t - 24h, t); null when fewer than 5 exist

Medians (not means) keep a burst of extreme events from dragging the baseline toward
itself. The lower median is used because MongoDB's $median accumulator returns an
actual sample value; for large windows MongoDB's result is approximate, so live values
can differ slightly from the exact values computed here.

Client windows include the current event, so every count is >= 1.
"""

from __future__ import annotations

from bisect import bisect_left, insort

import numpy as np
import pandas as pd

ONE_MINUTE_MS = 60_000
FIVE_MINUTES_MS = 300_000
BASELINE_WINDOW_MS = 24 * 60 * 60_000
BASELINE_MAX_SAMPLES = 500
BASELINE_MIN_SAMPLES = 5

CONTEXT_COLUMNS = [
    "client_requests_1m",
    "client_requests_5m",
    "client_errors_5m",
    "client_auth_failures_5m",
    "client_distinct_routes_5m",
    "route_latency_baseline_ms",
    "route_request_bytes_baseline",
    "route_response_bytes_baseline",
]
BASELINE_COLUMNS = {
    "route_latency_baseline_ms": "latency_ms",
    "route_request_bytes_baseline": "request_bytes",
    "route_response_bytes_baseline": "response_bytes",
}


def _client_windows(ts: np.ndarray, status: np.ndarray, routes: np.ndarray) -> dict[str, np.ndarray]:
    """Window counts for one client's events, which must be sorted by ts."""
    right = np.searchsorted(ts, ts, side="right")
    left_1m = np.searchsorted(ts, ts - ONE_MINUTE_MS, side="left")
    left_5m = np.searchsorted(ts, ts - FIVE_MINUTES_MS, side="left")

    is_error = (status >= 400).astype(np.int64)
    is_auth = np.isin(status, (401, 403)).astype(np.int64)
    err_cum = np.concatenate([[0], np.cumsum(is_error)])
    auth_cum = np.concatenate([[0], np.cumsum(is_auth)])

    # Two-pointer sliding window for distinct routes: both bounds are monotonic.
    distinct = np.empty(len(ts), dtype=np.int64)
    counts: dict[str, int] = {}
    lo = hi = 0
    for i in range(len(ts)):
        while hi < right[i]:
            counts[routes[hi]] = counts.get(routes[hi], 0) + 1
            hi += 1
        while lo < left_5m[i]:
            r = routes[lo]
            counts[r] -= 1
            if counts[r] == 0:
                del counts[r]
            lo += 1
        distinct[i] = len(counts)

    return {
        "client_requests_1m": right - left_1m,
        "client_requests_5m": right - left_5m,
        "client_errors_5m": err_cum[right] - err_cum[left_5m],
        "client_auth_failures_5m": auth_cum[right] - auth_cum[left_5m],
        "client_distinct_routes_5m": distinct,
    }


def _median(sorted_values: list[float]) -> float:
    """Lower median (the ceil(n/2)-th smallest value), matching MongoDB's $median on small sets."""
    return sorted_values[(len(sorted_values) + 1) // 2 - 1]


def _route_baselines(ts: np.ndarray, values: list[np.ndarray]) -> list[np.ndarray]:
    """Trailing medians for one route's events (sorted by ts), one array per value column."""
    n = len(ts)
    end = np.searchsorted(ts, ts, side="left")  # strictly earlier events
    start = np.searchsorted(ts, ts - BASELINE_WINDOW_MS, side="left")
    start = np.maximum(start, end - BASELINE_MAX_SAMPLES)

    windows: list[list[float]] = [[] for _ in values]
    out = [np.full(n, np.nan) for _ in values]
    lo = hi = 0
    for i in range(n):
        while hi < end[i]:
            for w, col in zip(windows, values):
                insort(w, float(col[hi]))
            hi += 1
        while lo < start[i]:
            for w, col in zip(windows, values):
                del w[bisect_left(w, float(col[lo]))]
            lo += 1
        if hi - lo >= BASELINE_MIN_SAMPLES:
            for k, w in enumerate(windows):
                out[k][i] = _median(w)
    return out


def add_context(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of ``df`` sorted by time with the context columns added.

    Required columns: ts_ms, client_id, method, route, status_code, latency_ms, request_bytes,
    response_bytes.
    """
    out = df.sort_values("ts_ms", kind="mergesort").reset_index(drop=True)
    out["endpoint"] = out["method"].astype(str).str.upper() + " " + out["route"].astype(str)
    for col in CONTEXT_COLUMNS:
        out[col] = np.nan

    for _, idx in out.groupby("client_id", sort=False).indices.items():
        sub = out.iloc[idx]
        windows = _client_windows(
            sub["ts_ms"].to_numpy(np.int64),
            sub["status_code"].to_numpy(np.int64),
            sub["endpoint"].to_numpy(object),
        )
        for col, values in windows.items():
            out.loc[out.index[idx], col] = values

    baseline_cols = list(BASELINE_COLUMNS)
    for _, idx in out.groupby("endpoint", sort=False).indices.items():
        sub = out.iloc[idx]
        medians = _route_baselines(
            sub["ts_ms"].to_numpy(np.int64),
            [sub[BASELINE_COLUMNS[c]].to_numpy(np.float64) for c in baseline_cols],
        )
        for col, values in zip(baseline_cols, medians):
            out.loc[out.index[idx], col] = values

    for col in CONTEXT_COLUMNS[:5]:
        out[col] = out[col].astype(np.int64)
    return out.drop(columns=["endpoint"])
