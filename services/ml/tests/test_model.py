import numpy as np

from conftest import SMALL
from helpers import credential_stuffing_event, event, frame
from pulse_ml.model import train
from pulse_ml.synthetic import generate_dataset


def test_training_is_reproducible():
    df = generate_dataset(SMALL.seed, minutes=240, n_clients=6, n_incidents=1).drop(columns=["label", "scenario", "incident_id"])
    a, b = train(df, SMALL), train(df, SMALL)
    probe = frame(event(), credential_stuffing_event())
    assert np.allclose(a.score(probe), b.score(probe))
    assert a.threshold == b.threshold


def test_threshold_matches_alert_quantile_on_training_data(small_model):
    df = generate_dataset(SMALL.seed, minutes=SMALL.minutes, n_clients=SMALL.n_clients, n_incidents=SMALL.n_incidents)
    scores = small_model.score(df)
    rate = (scores >= small_model.threshold).mean()
    assert abs(rate - (1 - SMALL.alert_quantile)) < 0.002


def test_scores_rank_attack_above_normal_and_lie_in_unit_interval(small_model):
    scores = small_model.score(frame(event(), credential_stuffing_event()))
    assert 0 < scores[0] < scores[1] <= 1


def test_prediction_contains_explanations(small_model):
    normal, attack = small_model.predict(frame(event(), credential_stuffing_event()))
    assert attack["is_anomaly"] and "model" in attack["detected_by"]
    assert attack["severity"] in {"medium", "high", "critical"}
    assert attack["pattern"]["code"] == "auth_failures"
    metrics = {e["metric"] for e in attack["evidence"]}
    assert {"client_requests_1m", "client_auth_failure_rate_5m"} <= metrics
    assert attack["attributions"] and all(a["contribution"] > 0 for a in attack["attributions"])
    assert not normal["is_anomaly"] and normal["severity"] is None
    assert 0 <= normal["percentile"] <= 100


def test_guardrail_flags_extreme_magnitude_only_under_hybrid_policy(small_model):
    exfil = event(route="/v1/reports/export", response_bytes=40_000_000, route_response_bytes_baseline=180_000.0, latency_ms=900.0, route_latency_baseline_ms=900.0)
    hybrid = small_model.predict(frame(exfil), policy="hybrid")[0]
    model_only = small_model.predict(frame(exfil), policy="model")[0]
    assert "guardrail" in hybrid["detected_by"] and hybrid["is_anomaly"]
    assert "guardrail" not in model_only["detected_by"]
    assert hybrid["anomaly_score"] == model_only["anomaly_score"]
