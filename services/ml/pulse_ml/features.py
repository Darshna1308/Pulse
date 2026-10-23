"""Feature engineering shared by training, evaluation and live inference.

Input is a DataFrame with one row per API request: the request metadata plus the
windowed context columns described in :mod:`pulse_ml.context`. Output is a purely
numeric matrix with the columns in :data:`FEATURE_NAMES`.

Design notes

* Route identity is deliberately *not* a feature. Pulse scores traffic from APIs it
  was never trained on, so features are relative (latency vs. the route's own
  baseline, error rates within the client's window) rather than tied to route names.
* Heavy-tailed quantities (latency, sizes, counts) are log1p transformed.
* Hour of day is encoded cyclically (sin/cos) from the UTC timestamp.
* Missing or invalid values are imputed conservatively: a missing route baseline
  yields a neutral ratio of 0 (log scale), missing sizes become 0, and any
  non-finite value is replaced with 0 after transformation.
* No credentials, headers, cookies, payloads or IP addresses are used. The client
  identifier is a pseudonymous label used only to group window counts.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

FEATURE_NAMES: list[str] = [
    "log_latency_ms",
    "latency_ratio_log",
    "log_request_bytes",
    "request_size_ratio_log",
    "log_response_bytes",
    "response_size_ratio_log",
    "is_4xx",
    "is_5xx",
    "is_auth_failure",
    "hour_sin",
    "hour_cos",
    "log_client_requests_1m",
    "log_client_requests_5m",
    "client_error_rate_5m",
    "client_auth_failure_rate_5m",
    "log_client_distinct_routes_5m",
    "is_write_method",
]

# Human-readable labels used in explanations and the model-info endpoint.
FEATURE_LABELS: dict[str, str] = {
    "log_latency_ms": "Response latency",
    "latency_ratio_log": "Latency vs. route baseline",
    "log_request_bytes": "Request size",
    "request_size_ratio_log": "Request size vs. route baseline",
    "log_response_bytes": "Response size",
    "response_size_ratio_log": "Response size vs. route baseline",
    "is_4xx": "Client error status (4xx)",
    "is_5xx": "Server error status (5xx)",
    "is_auth_failure": "Authentication failure (401/403)",
    "hour_sin": "Time of day",
    "hour_cos": "Time of day",
    "log_client_requests_1m": "Client request rate (1 min)",
    "log_client_requests_5m": "Client request volume (5 min)",
    "client_error_rate_5m": "Client error rate (5 min)",
    "client_auth_failure_rate_5m": "Client auth-failure rate (5 min)",
    "log_client_distinct_routes_5m": "Distinct routes touched (5 min)",
    "is_write_method": "Write method (POST/PUT/PATCH/DELETE)",
}

RAW_COLUMNS = [
    "method",
    "status_code",
    "latency_ms",
    "request_bytes",
    "response_bytes",
    "ts_ms",
    "client_requests_1m",
    "client_requests_5m",
    "client_errors_5m",
    "client_auth_failures_5m",
    "client_distinct_routes_5m",
    "route_latency_baseline_ms",
    "route_request_bytes_baseline",
    "route_response_bytes_baseline",
]


def _num(df: pd.DataFrame, col: str, default: float = 0.0) -> np.ndarray:
    if col not in df:
        return np.full(len(df), default, dtype=np.float64)
    values = pd.to_numeric(df[col], errors="coerce").to_numpy(np.float64)
    return values


def _log_ratio(value: np.ndarray, baseline: np.ndarray) -> np.ndarray:
    """log((value + 1) / (baseline + 1)); 0 (neutral) where the baseline is missing."""
    valid = np.isfinite(baseline) & (baseline >= 0)
    safe = np.where(valid, baseline, 0.0)
    return np.where(valid, np.log((value + 1.0) / (safe + 1.0)), 0.0)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw event rows into the model's feature matrix."""
    latency = np.clip(np.nan_to_num(_num(df, "latency_ms"), nan=0.0), 0, None)
    baseline = _num(df, "route_latency_baseline_ms", np.nan)
    req_bytes = np.clip(np.nan_to_num(_num(df, "request_bytes"), nan=0.0), 0, None)
    resp_bytes = np.clip(np.nan_to_num(_num(df, "response_bytes"), nan=0.0), 0, None)
    status = np.nan_to_num(_num(df, "status_code"), nan=200.0)

    req_1m = np.clip(np.nan_to_num(_num(df, "client_requests_1m"), nan=1.0), 1, None)
    req_5m = np.clip(np.nan_to_num(_num(df, "client_requests_5m"), nan=1.0), 1, None)
    req_5m = np.maximum(req_5m, req_1m)
    err_5m = np.clip(np.nan_to_num(_num(df, "client_errors_5m"), nan=0.0), 0, None)
    auth_5m = np.clip(np.nan_to_num(_num(df, "client_auth_failures_5m"), nan=0.0), 0, None)
    routes_5m = np.clip(np.nan_to_num(_num(df, "client_distinct_routes_5m"), nan=1.0), 1, None)

    ts = _num(df, "ts_ms", np.nan)
    hours = ((np.nan_to_num(ts, nan=0.0) / 3_600_000.0) % 24.0)
    angle = 2 * np.pi * hours / 24.0

    req_base = _num(df, "route_request_bytes_baseline", np.nan)
    resp_base = _num(df, "route_response_bytes_baseline", np.nan)

    methods = df["method"].astype(str).str.upper() if "method" in df else pd.Series([""] * len(df))

    features = pd.DataFrame(
        {
            "log_latency_ms": np.log1p(latency),
            "latency_ratio_log": _log_ratio(latency, baseline),
            "log_request_bytes": np.log1p(req_bytes),
            "request_size_ratio_log": _log_ratio(req_bytes, req_base),
            "log_response_bytes": np.log1p(resp_bytes),
            "response_size_ratio_log": _log_ratio(resp_bytes, resp_base),
            "is_4xx": ((status >= 400) & (status < 500)).astype(np.float64),
            "is_5xx": (status >= 500).astype(np.float64),
            "is_auth_failure": np.isin(status, (401, 403)).astype(np.float64),
            "hour_sin": np.sin(angle),
            "hour_cos": np.cos(angle),
            "log_client_requests_1m": np.log1p(req_1m),
            "log_client_requests_5m": np.log1p(req_5m),
            "client_error_rate_5m": np.clip(err_5m / req_5m, 0, 1),
            "client_auth_failure_rate_5m": np.clip(auth_5m / req_5m, 0, 1),
            "log_client_distinct_routes_5m": np.log1p(routes_5m),
            "is_write_method": methods.isin(WRITE_METHODS).to_numpy(np.float64),
        },
        columns=FEATURE_NAMES,
    )
    return features.replace([np.inf, -np.inf], np.nan).fillna(0.0)
