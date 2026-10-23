import pandas as pd

from pulse_ml.synthetic import SCENARIOS, generate_dataset, generate_raw


def test_same_seed_is_identical():
    a = generate_raw(5, minutes=120, n_clients=5, n_incidents=2)
    b = generate_raw(5, minutes=120, n_clients=5, n_incidents=2)
    pd.testing.assert_frame_equal(a, b)


def test_different_seed_differs():
    a = generate_raw(5, minutes=120, n_clients=5, n_incidents=2)
    b = generate_raw(6, minutes=120, n_clients=5, n_incidents=2)
    assert len(a) != len(b) or not a.equals(b)


def test_labels_mark_only_injected_incidents():
    df = generate_raw(9, minutes=240, n_clients=6, n_incidents=3)
    assert set(df.loc[df.label == 1, "scenario"]).issubset(SCENARIOS)
    assert (df.loc[df.label == 0, "scenario"] == "normal").all()
    assert (df.loc[df.label == 1, "incident_id"] >= 0).all()
    assert df["ts_ms"].is_monotonic_increasing


def test_dataset_has_context_and_valid_values():
    df = generate_dataset(3, minutes=120, n_clients=4, n_incidents=1)
    assert (df["client_requests_5m"] >= df["client_requests_1m"]).all()
    assert (df["client_errors_5m"] <= df["client_requests_5m"]).all()
    assert df["status_code"].between(100, 599).all()
    assert (df["latency_ms"] >= 0).all()
