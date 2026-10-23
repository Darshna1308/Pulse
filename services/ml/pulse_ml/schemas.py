"""Request and response schemas for the ML service."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


class EventContext(BaseModel):
    """Windowed aggregates computed by the caller (see pulse_ml.context)."""

    model_config = ConfigDict(extra="forbid")

    client_requests_1m: int = Field(ge=1, le=10_000_000)
    client_requests_5m: int = Field(ge=1, le=50_000_000)
    client_errors_5m: int = Field(ge=0, le=50_000_000)
    client_auth_failures_5m: int = Field(ge=0, le=50_000_000)
    client_distinct_routes_5m: int = Field(ge=1, le=1_000_000)
    route_latency_baseline_ms: float | None = Field(default=None, ge=0)
    route_request_bytes_baseline: float | None = Field(default=None, ge=0)
    route_response_bytes_baseline: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _consistent(self) -> "EventContext":
        if self.client_requests_1m > self.client_requests_5m:
            raise ValueError("client_requests_1m cannot exceed client_requests_5m")
        if self.client_errors_5m > self.client_requests_5m:
            raise ValueError("client_errors_5m cannot exceed client_requests_5m")
        if self.client_auth_failures_5m > self.client_errors_5m:
            raise ValueError("client_auth_failures_5m cannot exceed client_errors_5m")
        return self


class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: HttpMethod
    route: str = Field(min_length=1, max_length=512)
    status_code: int = Field(ge=100, le=599)
    latency_ms: float = Field(ge=0, le=3_600_000)
    request_bytes: int = Field(default=0, ge=0, le=10_000_000_000)
    response_bytes: int = Field(default=0, ge=0, le=10_000_000_000)
    timestamp: datetime
    client_id: str = Field(min_length=1, max_length=128)
    context: EventContext


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[EventIn] = Field(min_length=1, max_length=500)
    explain: bool = True
    policy: Literal["model", "hybrid"] = "hybrid"


class Evidence(BaseModel):
    metric: str
    label: str
    unit: str
    value: float | None
    baseline_median: float | None
    baseline_p99: float | None
    ratio_to_median: float | None
    summary: str


class Attribution(BaseModel):
    feature: str
    label: str
    contribution: float


class Pattern(BaseModel):
    code: str
    title: str


class Prediction(BaseModel):
    index: int
    anomaly_score: float = Field(description="-IsolationForest.score_samples; higher is more unusual. Not a probability.")
    is_anomaly: bool
    detected_by: list[Literal["model", "guardrail"]]
    severity: Literal["medium", "high", "critical"] | None
    percentile: float = Field(description="Rank of the score among training events, 0-100.")
    pattern: Pattern | None
    evidence: list[Evidence] = Field(description="Observed facts computed from the event vs. the training baseline.")
    attributions: list[Attribution] = Field(description="Model sensitivity per feature (perturbation-based).")


class PredictResponse(BaseModel):
    model_version: str
    threshold: float
    policy: str
    predictions: list[Prediction]


class SyntheticRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seed: int = Field(default=2026, ge=0, le=2**31 - 1)
    minutes: int = Field(default=360, ge=30, le=1440)
    clients: int = Field(default=12, ge=1, le=50)
    incidents: int = Field(default=4, ge=0, le=12)
    end_time: datetime | None = None


class SyntheticEvent(BaseModel):
    timestamp: datetime
    client_id: str
    method: str
    route: str
    status_code: int
    latency_ms: float
    request_bytes: int
    response_bytes: int
    scenario: str


class SyntheticResponse(BaseModel):
    seed: int
    events: list[SyntheticEvent]
