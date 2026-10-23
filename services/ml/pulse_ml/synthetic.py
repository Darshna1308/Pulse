"""Reproducible synthetic API traffic.

The generator simulates a small commerce-style API used by a mix of interactive
clients (diurnal activity in their own timezone) and machine integrations (flat,
higher-rate activity). Optionally it injects labelled incidents. Every output row is
fully determined by the ``seed`` argument.

Labels (``label`` = 1 for injected incident traffic) exist only so a *separate*
evaluation dataset can be scored. Training never reads the label column.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .context import add_context

SCENARIOS = (
    "credential_stuffing",
    "endpoint_probing",
    "scraping",
    "data_exfiltration",
    "payload_abuse",
    "error_storm",
)

SCENARIO_TITLES = {
    "credential_stuffing": "Credential stuffing",
    "endpoint_probing": "Endpoint probing",
    "scraping": "High-rate scraping",
    "data_exfiltration": "Bulk data export",
    "payload_abuse": "Oversized payloads",
    "error_storm": "Server error storm",
}


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    weight: float
    latency_ms: float
    latency_sigma: float
    request_bytes: float
    response_bytes: float
    p_4xx: float
    codes_4xx: tuple[int, ...]


ROUTES: tuple[Route, ...] = (
    Route("GET", "/v1/products", 18, 48, 0.35, 0, 9_000, 0.005, (400,)),
    Route("GET", "/v1/products/{id}", 22, 32, 0.30, 0, 2_400, 0.03, (404,)),
    Route("GET", "/v1/search", 10, 95, 0.45, 0, 6_500, 0.01, (400,)),
    Route("POST", "/v1/search", 3, 120, 0.45, 600, 6_500, 0.01, (400, 422)),
    Route("GET", "/v1/users/me", 12, 22, 0.25, 0, 900, 0.01, (401,)),
    Route("PATCH", "/v1/users/me", 1.5, 60, 0.30, 450, 900, 0.04, (400, 422)),
    Route("POST", "/v1/auth/login", 4, 180, 0.20, 260, 420, 0.06, (401,)),
    Route("POST", "/v1/auth/refresh", 6, 28, 0.25, 180, 380, 0.02, (401,)),
    Route("POST", "/v1/orders", 3, 140, 0.35, 1_200, 1_600, 0.03, (400, 409, 422)),
    Route("GET", "/v1/orders/{id}", 6, 40, 0.30, 0, 1_800, 0.02, (403, 404)),
    Route("POST", "/v1/payments", 2, 320, 0.30, 700, 800, 0.03, (402, 422)),
    Route("GET", "/v1/reports/export", 0.6, 900, 0.40, 0, 180_000, 0.01, (400,)),
    Route("DELETE", "/v1/sessions/{id}", 1, 25, 0.25, 0, 0, 0.02, (404,)),
)

PROBE_PATHS = (
    "/.env", "/admin", "/admin/login", "/wp-login.php", "/v1/internal/config",
    "/v1/debug", "/api/v2/users", "/v1/users/{id}/permissions", "/v1/admin/users",
    "/actuator/health", "/server-status", "/v1/graphql", "/.git/config", "/v1/backup",
    "/v1/export/all", "/phpmyadmin", "/v1/keys", "/v1/tokens", "/config.json", "/v1/swagger.json",
    "/v1/metrics", "/v1/console", "/cgi-bin/test", "/v1/users/export", "/v1/orders/all",
)

P_5XX = 0.002
DEFAULT_START = datetime(2026, 1, 5, tzinfo=timezone.utc)


def _route_arrays() -> dict[str, np.ndarray]:
    return {
        "method": np.array([r.method for r in ROUTES], dtype=object),
        "path": np.array([r.path for r in ROUTES], dtype=object),
        "weight": np.array([r.weight for r in ROUTES], dtype=np.float64),
        "latency": np.array([r.latency_ms for r in ROUTES], dtype=np.float64),
        "sigma": np.array([r.latency_sigma for r in ROUTES], dtype=np.float64),
        "req": np.array([r.request_bytes for r in ROUTES], dtype=np.float64),
        "resp": np.array([r.response_bytes for r in ROUTES], dtype=np.float64),
        "p4xx": np.array([r.p_4xx for r in ROUTES], dtype=np.float64),
    }


def _activity(hour_local: np.ndarray) -> np.ndarray:
    """Diurnal activity curve peaking mid-afternoon, never fully zero."""
    return 0.15 + 0.85 * np.exp(-0.5 * ((hour_local - 14.0) / 3.5) ** 2)


def _normal_traffic(rng: np.random.Generator, start_ms: int, minutes: int, n_clients: int) -> pd.DataFrame:
    ra = _route_arrays()
    n_routes = len(ROUTES)
    frames = []
    minute_idx = np.arange(minutes)
    start_hour = (start_ms / 3_600_000.0) % 24.0

    for c in range(n_clients):
        client_id = f"client_{c + 1:03d}"
        is_machine = rng.random() < 0.2
        if is_machine:
            base_rpm = float(np.clip(rng.lognormal(np.log(6.0), 0.4), 2.0, 15.0))
            activity = np.full(minutes, 1.0)
            mix = rng.dirichlet(ra["weight"] * 0.3 + 0.01)
        else:
            base_rpm = float(np.clip(rng.lognormal(np.log(1.6), 0.6), 0.2, 8.0))
            tz = rng.integers(-8, 6)
            hours = (start_hour + minute_idx / 60.0 + tz) % 24.0
            activity = _activity(hours)
            mix = rng.dirichlet(ra["weight"] * 0.8 + 0.05)

        day_jitter = rng.lognormal(0.0, 0.15, size=minutes // 1440 + 1)[minute_idx // 1440]
        counts = rng.poisson(base_rpm * activity * day_jitter)
        n = int(counts.sum())
        if n == 0:
            continue
        minute_of_event = np.repeat(minute_idx, counts)
        ts = start_ms + minute_of_event * 60_000 + rng.integers(0, 60_000, size=n)
        route = rng.choice(n_routes, size=n, p=mix)

        u = rng.random(n)
        is_5xx = u < P_5XX
        is_4xx = (~is_5xx) & (u < P_5XX + ra["p4xx"][route])
        status = np.full(n, 200, dtype=np.int64)
        status[ra["method"][route] == "POST"] = 201
        status[(ra["method"][route] == "DELETE")] = 204
        for i in np.where(is_4xx)[0]:
            codes = ROUTES[route[i]].codes_4xx
            status[i] = codes[rng.integers(0, len(codes))]
        status[is_5xx] = rng.choice([500, 502, 503], size=int(is_5xx.sum()))

        latency = rng.lognormal(np.log(ra["latency"][route]), ra["sigma"][route])
        latency[is_5xx] *= rng.uniform(1.0, 4.0, size=int(is_5xx.sum()))
        req_bytes = np.where(ra["req"][route] > 0, rng.lognormal(np.log(np.maximum(ra["req"][route], 1)), 0.35), 0)
        resp_bytes = np.where(ra["resp"][route] > 0, rng.lognormal(np.log(np.maximum(ra["resp"][route], 1)), 0.45), 0)
        err = status >= 400
        resp_bytes[err] = rng.lognormal(np.log(220), 0.2, size=int(err.sum()))

        frames.append(
            pd.DataFrame(
                {
                    "ts_ms": ts.astype(np.int64),
                    "client_id": client_id,
                    "method": ra["method"][route],
                    "route": ra["path"][route],
                    "status_code": status,
                    "latency_ms": np.round(latency, 1),
                    "request_bytes": np.round(req_bytes).astype(np.int64),
                    "response_bytes": np.round(resp_bytes).astype(np.int64),
                    "label": 0,
                    "scenario": "normal",
                    "incident_id": -1,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def _incident(rng: np.random.Generator, scenario: str, start_ms: int, minutes: int, n_clients: int, k: int) -> pd.DataFrame:
    """Generate one labelled incident starting somewhere inside the window."""
    duration = int(rng.integers(3, 13))
    begin = start_ms + int(rng.integers(10, max(11, minutes - duration - 1))) * 60_000
    attacker = f"actor_{k + 1:03d}"
    existing = f"client_{int(rng.integers(1, n_clients + 1)):03d}"

    if scenario == "credential_stuffing":
        rpm, client = rng.uniform(40, 150), attacker
    elif scenario == "endpoint_probing":
        rpm, client = rng.uniform(30, 90), attacker
    elif scenario == "scraping":
        rpm, client = rng.uniform(60, 220), attacker
    elif scenario == "data_exfiltration":
        rpm, client = rng.uniform(3, 15), existing
    elif scenario == "payload_abuse":
        rpm, client = rng.uniform(5, 30), attacker
    else:  # error_storm
        rpm, client = rng.uniform(6, 20), existing

    n = max(5, int(rng.poisson(rpm * duration)))
    ts = begin + np.sort(rng.integers(0, duration * 60_000, size=n))

    if scenario == "credential_stuffing":
        method, route = np.full(n, "POST", object), np.full(n, "/v1/auth/login", object)
        status = np.where(rng.random(n) < 0.9, 401, 200)
        status[rng.random(n) < 0.05] = 429
        latency = rng.lognormal(np.log(170), 0.25, n)
        req, resp = rng.lognormal(np.log(260), 0.2, n), rng.lognormal(np.log(200), 0.2, n)
    elif scenario == "endpoint_probing":
        method = np.where(rng.random(n) < 0.85, "GET", "POST").astype(object)
        route = np.array(PROBE_PATHS, dtype=object)[rng.integers(0, len(PROBE_PATHS), n)]
        u = rng.random(n)
        status = np.where(u < 0.8, 404, np.where(u < 0.95, 403, 200))
        latency = rng.lognormal(np.log(15), 0.4, n)
        req, resp = np.zeros(n), rng.lognormal(np.log(180), 0.2, n)
    elif scenario == "scraping":
        target = "/v1/products/{id}" if rng.random() < 0.5 else "/v1/orders/{id}"
        method, route = np.full(n, "GET", object), np.full(n, target, object)
        status = np.where(rng.random(n) < 0.55, 200, 404)
        latency = rng.lognormal(np.log(35), 0.3, n)
        req, resp = np.zeros(n), np.where(status == 200, rng.lognormal(np.log(2_200), 0.4, n), 210)
    elif scenario == "data_exfiltration":
        method, route = np.full(n, "GET", object), np.full(n, "/v1/reports/export", object)
        status = np.full(n, 200)
        latency = rng.lognormal(np.log(900), 0.4, n) * rng.uniform(3, 8, n)
        req, resp = np.zeros(n), rng.lognormal(np.log(180_000), 0.3, n) * rng.uniform(30, 150, n)
    elif scenario == "payload_abuse":
        method, route = np.full(n, "POST", object), np.full(n, "/v1/search", object)
        u = rng.random(n)
        status = np.where(u < 0.6, 200, np.where(u < 0.85, 413, 500))
        latency = rng.lognormal(np.log(120), 0.4, n) * rng.uniform(10, 40, n)
        req, resp = rng.uniform(200_000, 4_000_000, n), rng.lognormal(np.log(6_000), 0.4, n)
    else:
        method, route = np.full(n, "POST", object), np.full(n, "/v1/payments", object)
        status = np.where(rng.random(n) < 0.7, rng.choice([500, 502, 503], n), 201)
        latency = rng.lognormal(np.log(320), 0.3, n) * rng.uniform(5, 20, n)
        req, resp = rng.lognormal(np.log(700), 0.3, n), rng.lognormal(np.log(240), 0.2, n)

    return pd.DataFrame(
        {
            "ts_ms": ts.astype(np.int64),
            "client_id": client,
            "method": method,
            "route": route,
            "status_code": status.astype(np.int64),
            "latency_ms": np.round(latency, 1),
            "request_bytes": np.round(req).astype(np.int64),
            "response_bytes": np.round(resp).astype(np.int64),
            "label": 1,
            "scenario": scenario,
            "incident_id": k,
        }
    )


def generate_raw(
    seed: int,
    minutes: int = 3 * 1440,
    n_clients: int = 30,
    n_incidents: int = 6,
    start: datetime | None = None,
) -> pd.DataFrame:
    """Generate raw events (no context columns), sorted by timestamp."""
    if minutes < 30:
        raise ValueError("minutes must be >= 30")
    rng = np.random.default_rng(seed)
    start_ms = int((start or DEFAULT_START).timestamp() * 1000)
    parts = [_normal_traffic(rng, start_ms, minutes, n_clients)]
    for k in range(n_incidents):
        scenario = SCENARIOS[int(rng.integers(0, len(SCENARIOS)))]
        parts.append(_incident(rng, scenario, start_ms, minutes, n_clients, k))
    df = pd.concat(parts, ignore_index=True)
    return df.sort_values("ts_ms", kind="mergesort").reset_index(drop=True)


def generate_dataset(seed: int, **kwargs) -> pd.DataFrame:
    """Generate events with context columns, ready for feature engineering."""
    return add_context(generate_raw(seed, **kwargs))
