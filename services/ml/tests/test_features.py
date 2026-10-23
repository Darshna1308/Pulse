import numpy as np
import pandas as pd

from helpers import event, frame
from pulse_ml.features import FEATURE_LABELS, FEATURE_NAMES, build_features


def test_columns_and_order_are_stable():
    feats = build_features(frame(event()))
    assert list(feats.columns) == FEATURE_NAMES
    assert set(FEATURE_LABELS) == set(FEATURE_NAMES)


def test_no_sensitive_or_identity_inputs_are_features():
    banned = ("client", "route", "password", "token", "cookie", "authorization", "ip", "label", "scenario")
    for name in FEATURE_NAMES:
        assert not any(name == b or name.startswith(b + "_id") for b in banned)
    assert "label" not in FEATURE_NAMES and "scenario" not in FEATURE_NAMES


def test_missing_and_invalid_values_are_imputed_safely():
    row = event(
        latency_ms=None,
        request_bytes="not-a-number",
        route_latency_baseline_ms=None,
        route_request_bytes_baseline=float("nan"),
        route_response_bytes_baseline=None,
        client_requests_1m=None,
    )
    feats = build_features(frame(row))
    assert np.isfinite(feats.to_numpy()).all()
    assert feats["latency_ratio_log"].iat[0] == 0.0
    assert feats["log_client_requests_1m"].iat[0] == np.log1p(1)


def test_status_flags_and_rates():
    feats = build_features(frame(event(status_code=401, client_requests_5m=10, client_errors_5m=5, client_auth_failures_5m=4)))
    assert feats["is_4xx"].iat[0] == 1 and feats["is_auth_failure"].iat[0] == 1 and feats["is_5xx"].iat[0] == 0
    assert feats["client_error_rate_5m"].iat[0] == 0.5
    assert feats["client_auth_failure_rate_5m"].iat[0] == 0.4


def test_hour_encoding_is_cyclic():
    midnight = event(ts_ms=1_767_571_200_000)  # 2026-01-05T00:00Z
    almost = event(ts_ms=1_767_571_200_000 - 60_000)  # 23:59 the day before
    f = build_features(pd.DataFrame([midnight, almost]))
    assert abs(f["hour_sin"].iat[0] - f["hour_sin"].iat[1]) < 0.01
    assert abs(f["hour_cos"].iat[0] - f["hour_cos"].iat[1]) < 0.01


def test_ratios_are_relative_to_route_baseline():
    f = build_features(frame(event(latency_ms=319.0, route_latency_baseline_ms=31.0)))
    assert np.isclose(f["latency_ratio_log"].iat[0], np.log(10.0))
