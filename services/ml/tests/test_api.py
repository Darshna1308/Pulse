import pytest
from fastapi.testclient import TestClient

from pulse_ml.api import create_app


def payload(**overrides):
    e = {
        "method": "GET",
        "route": "/v1/products/{id}",
        "status_code": 200,
        "latency_ms": 31.5,
        "request_bytes": 0,
        "response_bytes": 2400,
        "timestamp": "2026-01-05T14:00:00Z",
        "client_id": "client_001",
        "context": {
            "client_requests_1m": 2,
            "client_requests_5m": 8,
            "client_errors_5m": 0,
            "client_auth_failures_5m": 0,
            "client_distinct_routes_5m": 3,
            "route_latency_baseline_ms": 30.0,
            "route_request_bytes_baseline": 0,
            "route_response_bytes_baseline": 2300,
        },
    }
    e.update(overrides)
    return {"events": [e]}


@pytest.fixture()
def client(model_dir, monkeypatch):
    monkeypatch.delenv("PULSE_ML_INTERNAL_TOKEN", raising=False)
    with TestClient(create_app(model_dir)) as c:
        yield c


def test_health_reports_loaded_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["model_loaded"] and body["model_version"].startswith("iforest-")


def test_predict_response_schema(client):
    res = client.post("/predict", json=payload())
    assert res.status_code == 200
    body = res.json()
    assert body["policy"] == "hybrid" and body["threshold"] > 0
    p = body["predictions"][0]
    assert set(p) == {"index", "anomaly_score", "is_anomaly", "detected_by", "severity", "percentile", "pattern", "evidence", "attributions"}
    assert isinstance(p["anomaly_score"], float)


def test_predict_flags_credential_stuffing(client):
    body = payload(
        method="POST", route="/v1/auth/login", status_code=401, latency_ms=170,
        context={"client_requests_1m": 140, "client_requests_5m": 600, "client_errors_5m": 560, "client_auth_failures_5m": 550,
                 "client_distinct_routes_5m": 1, "route_latency_baseline_ms": 180, "route_request_bytes_baseline": 260, "route_response_bytes_baseline": 420},
    )
    p = client.post("/predict", json=body).json()["predictions"][0]
    assert p["is_anomaly"] and p["pattern"]["code"] == "auth_failures"


@pytest.mark.parametrize(
    "override",
    [
        {"status_code": 700},
        {"latency_ms": -1},
        {"method": "BREW"},
        {"context": {"client_requests_1m": 9, "client_requests_5m": 3, "client_errors_5m": 0, "client_auth_failures_5m": 0, "client_distinct_routes_5m": 1}},
        {"password": "hunter2"},
    ],
)
def test_predict_rejects_invalid_input(client, override):
    assert client.post("/predict", json=payload(**override)).status_code == 422


def test_predict_rejects_empty_and_oversized_batches(client):
    assert client.post("/predict", json={"events": []}).status_code == 422
    big = {"events": payload()["events"] * 501}
    assert client.post("/predict", json=big).status_code == 422


def test_internal_token_is_enforced(model_dir, monkeypatch):
    monkeypatch.setenv("PULSE_ML_INTERNAL_TOKEN", "s3cret-token")
    with TestClient(create_app(model_dir)) as c:
        assert c.get("/health").status_code == 200  # health stays open for orchestration
        assert c.post("/predict", json=payload()).status_code == 401
        assert c.post("/predict", json=payload(), headers={"X-Internal-Token": "wrong"}).status_code == 401
        assert c.post("/predict", json=payload(), headers={"X-Internal-Token": "s3cret-token"}).status_code == 200


def test_missing_model_returns_503(tmp_path, monkeypatch):
    monkeypatch.delenv("PULSE_ML_INTERNAL_TOKEN", raising=False)
    with TestClient(create_app(tmp_path)) as c:
        assert c.get("/health").json()["model_loaded"] is False
        assert c.post("/predict", json=payload()).status_code == 503


def test_model_info_documents_score_semantics(client):
    info = client.get("/model/info").json()
    assert "not a calibrated probability" in info["score_interpretation"]
    assert len(info["features"]) == 17


def test_synthetic_events_are_reproducible(client):
    req = {"seed": 4, "minutes": 60, "clients": 3, "incidents": 1, "end_time": "2026-02-01T12:00:00Z"}
    a = client.post("/synthetic/events", json=req).json()
    b = client.post("/synthetic/events", json=req).json()
    assert a == b and len(a["events"]) > 0
    assert all(e["timestamp"] < "2026-02-01T12:00:00" for e in a["events"])
