"""Isolation Forest training, persistence, scoring and explanation.

Score direction
---------------
scikit-learn's ``IsolationForest.score_samples`` returns the *negated* anomaly score
from Liu et al. (2008). Pulse reports ``anomaly_score = -score_samples(x)``, which lies
in (0, 1]: values near 0.5 are typical, values approaching 1 are isolated quickly and
therefore unusual. It is a ranking signal, **not** a probability of attack.

Detection policy
----------------
``model``   flag when anomaly_score >= threshold.
``hybrid``  (default) additionally flag when an observed size/latency metric is more than
            ``guardrail_factor`` (default 10) times its training p99. Isolation Forest
            cannot extrapolate beyond the value range it saw in training, so a single
            extreme magnitude (e.g. a 30 MB export) can score as only mildly unusual.
            The guardrail covers that blind spot and is reported separately
            (``detected_by``) so model and rule signals are never conflated.

Threshold
---------
The alert threshold is the ``alert_quantile`` (default 0.995) of anomaly scores on the
training data, so roughly 0.5% of traffic resembling the training distribution would
be flagged. Severity bands use higher training quantiles (0.999, 0.9999). The
``percentile`` returned with each prediction is the event's rank among training scores.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest

from .features import FEATURE_LABELS, FEATURE_NAMES, build_features

MODEL_FILE = "model.joblib"
META_FILE = "model_meta.json"

# Raw, human-interpretable quantities used for observed evidence.
EVIDENCE_METRICS: dict[str, dict[str, str]] = {
    "client_requests_1m": {"label": "Client request rate", "unit": "req/min"},
    "client_distinct_routes_5m": {"label": "Distinct routes in 5 min", "unit": "routes"},
    "client_error_rate_5m": {"label": "Client error rate (5 min)", "unit": "ratio"},
    "client_auth_failure_rate_5m": {"label": "Auth-failure rate (5 min)", "unit": "ratio"},
    "latency_ratio": {"label": "Latency vs. route baseline", "unit": "x"},
    "latency_ms": {"label": "Response latency", "unit": "ms"},
    "request_bytes": {"label": "Request size", "unit": "bytes"},
    "request_size_ratio": {"label": "Request size vs. route baseline", "unit": "x"},
    "response_bytes": {"label": "Response size", "unit": "bytes"},
    "response_size_ratio": {"label": "Response size vs. route baseline", "unit": "x"},
}

HOUR_GROUP = ("hour_sin", "hour_cos")
GUARDRAIL_METRICS = ("latency_ratio", "request_size_ratio", "response_size_ratio", "request_bytes", "response_bytes")
POLICIES = ("model", "hybrid")


def _ratio(value: np.ndarray, baseline: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(np.isfinite(baseline) & (baseline > 0), value / baseline, np.nan)


def _col(df: pd.DataFrame, name: str) -> np.ndarray:
    if name not in df:
        return np.full(len(df), np.nan)
    return pd.to_numeric(df[name], errors="coerce").to_numpy(np.float64)


def raw_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Interpretable per-event quantities derived directly from the event data."""
    req_5m = np.maximum(_col(df, "client_requests_5m"), 1)
    latency = _col(df, "latency_ms")
    request_bytes = np.nan_to_num(_col(df, "request_bytes"), nan=0.0)
    response_bytes = np.nan_to_num(_col(df, "response_bytes"), nan=0.0)
    return pd.DataFrame(
        {
            "client_requests_1m": _col(df, "client_requests_1m"),
            "client_distinct_routes_5m": _col(df, "client_distinct_routes_5m"),
            "client_error_rate_5m": _col(df, "client_errors_5m") / req_5m,
            "client_auth_failure_rate_5m": _col(df, "client_auth_failures_5m") / req_5m,
            "latency_ratio": _ratio(latency, _col(df, "route_latency_baseline_ms")),
            "latency_ms": latency,
            "request_bytes": request_bytes,
            "request_size_ratio": _ratio(request_bytes, _col(df, "route_request_bytes_baseline")),
            "response_bytes": response_bytes,
            "response_size_ratio": _ratio(response_bytes, _col(df, "route_response_bytes_baseline")),
        }
    )


@dataclass
class TrainConfig:
    seed: int = 42
    minutes: int = 3 * 1440
    n_clients: int = 30
    n_incidents: int = 3
    # Chosen on a validation dataset (seed 7), never on the evaluation dataset.
    n_estimators: int = 300
    max_samples: int | str = 4096
    alert_quantile: float = 0.995
    guardrail_factor: float = 10.0


@dataclass
class PulseModel:
    model: IsolationForest
    feature_names: list[str]
    threshold: float
    alert_quantile: float
    severity_thresholds: dict[str, float]
    score_grid: np.ndarray  # sorted quantiles of training scores, for percentiles
    feature_medians: np.ndarray
    evidence_baseline: dict[str, dict[str, float]]
    status_rates: dict[str, float]
    guardrail_factor: float = 10.0
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def version(self) -> str:
        return str(self.meta["version"])

    # ------------------------------------------------------------------ scoring
    def _score_matrix(self, x: np.ndarray) -> np.ndarray:
        return -self.model.score_samples(pd.DataFrame(x, columns=self.feature_names))

    def score(self, df: pd.DataFrame) -> np.ndarray:
        return self._score_matrix(build_features(df).to_numpy(np.float64))

    def percentile(self, scores: np.ndarray) -> np.ndarray:
        idx = np.searchsorted(self.score_grid, scores, side="right")
        return np.round(100.0 * idx / len(self.score_grid), 2)

    def severity(self, score: float) -> str | None:
        if score >= self.severity_thresholds["critical"]:
            return "critical"
        if score >= self.severity_thresholds["high"]:
            return "high"
        if score >= self.threshold:
            return "medium"
        return None

    def attributions(self, x: np.ndarray, base_scores: np.ndarray, top_k: int = 5) -> list[list[dict[str, Any]]]:
        """Model sensitivity: score drop when a feature is reset to its training median.

        This is a local, perturbation-based attribution of the *model's* signal. It is
        not a causal statement about the request.
        """
        groups: list[tuple[str, list[int]]] = []
        seen: set[str] = set()
        for i, name in enumerate(self.feature_names):
            if name in seen:
                continue
            if name in HOUR_GROUP:
                idxs = [self.feature_names.index(h) for h in HOUR_GROUP]
                seen.update(HOUR_GROUP)
                groups.append(("time_of_day", idxs))
            else:
                seen.add(name)
                groups.append((name, [i]))

        n, g = len(x), len(groups)
        stacked = np.repeat(x, g, axis=0).reshape(n, g, x.shape[1])
        for j, (_, idxs) in enumerate(groups):
            stacked[:, j, idxs] = self.feature_medians[idxs]
        perturbed = self._score_matrix(stacked.reshape(n * g, -1)).reshape(n, g)
        deltas = base_scores[:, None] - perturbed

        out = []
        for row in deltas:
            order = np.argsort(-row)[:top_k]
            items = []
            for j in order:
                if row[j] <= 0.001:
                    continue
                name = groups[j][0]
                label = "Time of day (UTC)" if name == "time_of_day" else FEATURE_LABELS[name]
                items.append({"feature": name, "label": label, "contribution": round(float(row[j]), 4)})
            out.append(items)
        return out

    # --------------------------------------------------------------- evidence
    def evidence(self, df: pd.DataFrame) -> list[list[dict[str, Any]]]:
        """Observed evidence: raw quantities compared with the training baseline."""
        metrics = raw_metrics(df)
        status = df["status_code"].to_numpy(np.int64)
        results = []
        for i in range(len(df)):
            items: list[dict[str, Any]] = []
            for key, spec in EVIDENCE_METRICS.items():
                value = metrics[key].iat[i]
                base = self.evidence_baseline[key]
                if not np.isfinite(value) or value <= base["p99"]:
                    continue
                median = base["median"]
                ratio = value / median if median > 0 else None
                items.append(
                    {
                        "metric": key,
                        "label": spec["label"],
                        "unit": spec["unit"],
                        "value": _round(value),
                        "baseline_median": _round(median),
                        "baseline_p99": _round(base["p99"]),
                        "ratio_to_median": _round(ratio) if ratio is not None else None,
                        "summary": _evidence_summary(key, spec, value, median),
                    }
                )
            code = int(status[i])
            if code >= 500:
                items.append(_status_evidence(code, "5xx", self.status_rates["5xx"]))
            elif code in (401, 403):
                items.append(_status_evidence(code, "auth_failure", self.status_rates["auth_failure"]))
            items.sort(key=_evidence_rank)
            results.append(items)
        return results

    def guardrail(self, df: pd.DataFrame) -> np.ndarray:
        """True where an observed magnitude exceeds guardrail_factor x its training p99."""
        metrics = raw_metrics(df)
        hit = np.zeros(len(df), dtype=bool)
        for key in GUARDRAIL_METRICS:
            limit = self.guardrail_factor * max(self.evidence_baseline[key]["p99"], 1e-9)
            hit |= np.nan_to_num(metrics[key].to_numpy(np.float64), nan=0.0) > limit
        return hit

    def detect(self, df: pd.DataFrame, policy: str = "hybrid") -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return (scores, model_flags, guardrail_flags) for a frame of events."""
        if policy not in POLICIES:
            raise ValueError(f"policy must be one of {POLICIES}")
        scores = self.score(df)
        model_flags = scores >= self.threshold
        guard = self.guardrail(df) if policy == "hybrid" else np.zeros(len(df), dtype=bool)
        return scores, model_flags, guard

    # ----------------------------------------------------------------- predict
    def predict(self, df: pd.DataFrame, explain: bool = True, policy: str = "hybrid") -> list[dict[str, Any]]:
        if policy not in POLICIES:
            raise ValueError(f"policy must be one of {POLICIES}")
        x = build_features(df).to_numpy(np.float64)
        scores = self._score_matrix(x)
        guard = self.guardrail(df) if policy == "hybrid" else np.zeros(len(df), dtype=bool)
        pct = self.percentile(scores)
        attributions = self.attributions(x, scores) if explain else [[] for _ in scores]
        evidence = self.evidence(df) if explain else [[] for _ in scores]
        out = []
        for i, s in enumerate(scores):
            severity = self.severity(float(s))
            detected_by = (["model"] if severity else []) + (["guardrail"] if guard[i] else [])
            if severity is None and guard[i]:
                severity = "medium"
            out.append(
                {
                    "anomaly_score": round(float(s), 5),
                    "is_anomaly": bool(detected_by),
                    "detected_by": detected_by,
                    "severity": severity,
                    "percentile": float(pct[i]),
                    "pattern": detect_pattern(evidence[i]) if explain else None,
                    "evidence": evidence[i],
                    "attributions": attributions[i],
                }
            )
        return out

    # ------------------------------------------------------------- persistence
    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, directory / MODEL_FILE)
        (directory / META_FILE).write_text(json.dumps(self.info(), indent=2))

    def info(self) -> dict[str, Any]:
        return {
            **self.meta,
            "threshold": round(self.threshold, 5),
            "alert_quantile": self.alert_quantile,
            "guardrail": {
                "factor": self.guardrail_factor,
                "metrics": list(GUARDRAIL_METRICS),
                "description": "Flags events whose observed size/latency metric exceeds factor x training p99.",
            },
            "severity_thresholds": {k: round(v, 5) for k, v in self.severity_thresholds.items()},
            "features": [{"name": n, "label": FEATURE_LABELS[n]} for n in self.feature_names],
            "evidence_baseline": self.evidence_baseline,
            "score_interpretation": (
                "anomaly_score = -IsolationForest.score_samples(x), in (0, 1]. Higher means the event was "
                "isolated with fewer random splits, i.e. it is more unusual relative to training traffic. "
                "It is a ranking signal, not a calibrated probability of malicious activity."
            ),
        }


def _evidence_rank(e: dict[str, Any]) -> float:
    """Sort key: largest exceedance of the baseline p99 first, status notes last."""
    if e["metric"] == "status":
        return 0.0
    return -float(e["value"]) / max(float(e["baseline_p99"] or 0.0), 1e-9)


def _round(v: float | None) -> float | None:
    if v is None or not np.isfinite(v):
        return None
    return float(round(v, 4 if abs(v) < 10 else 1))


def _fmt(value: float, unit: str) -> str:
    if unit == "ratio":
        return f"{value * 100:.0f}%"
    if unit == "bytes":
        for size, suffix in ((1 << 20, "MB"), (1 << 10, "KB")):
            if value >= size:
                return f"{value / size:.1f} {suffix}"
        return f"{value:.0f} B"
    if unit == "x":
        return f"{value:.1f}x"
    if unit == "ms":
        return f"{value:,.0f} ms"
    return f"{value:,.0f} {unit}"


def _evidence_summary(key: str, spec: dict[str, str], value: float, median: float) -> str:
    unit = spec["unit"]
    if unit == "ratio":
        return f"{spec['label']} is {_fmt(value, unit)} (baseline median {_fmt(median, unit)})."
    if key == "latency_ratio":
        return f"Latency is {value:.1f}x the route's trailing 24h median."
    if key.endswith("_size_ratio"):
        noun = "Request" if key.startswith("request") else "Response"
        return f"{noun} size is {value:.1f}x the route's trailing 24h median."
    times = f", {value / median:.0f}x the baseline median" if median > 0 and value / median >= 2 else ""
    return f"{spec['label']} of {_fmt(value, unit)}{times} (median {_fmt(median, unit)})."


def _status_evidence(code: int, kind: str, rate: float) -> dict[str, Any]:
    what = "Server error" if kind == "5xx" else "Authentication failure"
    return {
        "metric": "status",
        "label": f"{what} ({code})",
        "unit": "status",
        "value": code,
        "baseline_median": None,
        "baseline_p99": None,
        "ratio_to_median": None,
        "summary": f"{what} response {code}; {kind.replace('_', ' ')} responses are {rate * 100:.2f}% of baseline traffic.",
    }


PATTERNS = {
    "auth_failures": "Repeated authentication failures from one client",
    "route_probing": "Client probing many distinct routes",
    "burst_with_errors": "High-rate requests with elevated error rate",
    "rate_burst": "Request rate far above baseline",
    "large_responses": "Unusually large responses",
    "oversized_payloads": "Oversized request payloads",
    "server_errors": "Server error spike",
    "latency_spike": "Latency spike against route baseline",
    "unusual_combination": "Unusual combination of request attributes",
}


def detect_pattern(evidence: list[dict[str, Any]]) -> dict[str, str]:
    """Map observed evidence to a descriptive pattern. Describes, does not prove intent."""
    flagged = {e["metric"] for e in evidence}
    status_labels = " ".join(e["label"] for e in evidence if e["metric"] == "status")

    if "client_auth_failure_rate_5m" in flagged:
        code = "auth_failures"
    elif "client_distinct_routes_5m" in flagged:
        code = "route_probing"
    elif "client_requests_1m" in flagged and "client_error_rate_5m" in flagged:
        code = "burst_with_errors"
    elif flagged & {"response_bytes", "response_size_ratio"}:
        code = "large_responses"
    elif flagged & {"request_bytes", "request_size_ratio"}:
        code = "oversized_payloads"
    elif "Server error" in status_labels:
        code = "server_errors"
    elif "client_requests_1m" in flagged:
        code = "rate_burst"
    elif "latency_ratio" in flagged or "latency_ms" in flagged:
        code = "latency_spike"
    else:
        code = "unusual_combination"
    return {"code": code, "title": PATTERNS[code]}


def train(train_df: pd.DataFrame, config: TrainConfig) -> PulseModel:
    """Fit Isolation Forest on an (unlabelled) training frame with context columns."""
    features = build_features(train_df)
    x = features.to_numpy(np.float64)
    model = IsolationForest(
        n_estimators=config.n_estimators,
        max_samples=min(config.max_samples, len(features)) if isinstance(config.max_samples, int) else config.max_samples,
        contamination="auto",
        random_state=config.seed,
        n_jobs=1,
    )
    model.fit(features)
    scores = -model.score_samples(features)

    metrics = raw_metrics(train_df)
    evidence_baseline = {}
    for key in EVIDENCE_METRICS:
        col = metrics[key].to_numpy(np.float64)
        col = col[np.isfinite(col)]
        evidence_baseline[key] = {
            "median": float(np.median(col)),
            "p95": float(np.quantile(col, 0.95)),
            "p99": float(np.quantile(col, 0.99)),
        }
    status = train_df["status_code"].to_numpy(np.int64)

    digest = hashlib.sha256(
        json.dumps(
            {"cfg": config.__dict__, "n": len(train_df), "sk": sklearn.__version__}, sort_keys=True, default=str
        ).encode()
    ).hexdigest()[:8]
    trained_at = datetime.now(timezone.utc)

    return PulseModel(
        model=model,
        feature_names=list(FEATURE_NAMES),
        threshold=float(np.quantile(scores, config.alert_quantile)),
        alert_quantile=config.alert_quantile,
        severity_thresholds={
            "high": float(np.quantile(scores, 0.999)),
            "critical": float(np.quantile(scores, 0.9999)),
        },
        score_grid=np.quantile(scores, np.linspace(0, 1, 2001)),
        feature_medians=np.median(x, axis=0),
        evidence_baseline=evidence_baseline,
        status_rates={
            "5xx": float(np.mean(status >= 500)),
            "auth_failure": float(np.mean(np.isin(status, (401, 403)))),
        },
        guardrail_factor=config.guardrail_factor,
        meta={
            "version": f"iforest-{digest}",
            "algorithm": "IsolationForest",
            "trained_at": trained_at.isoformat(),
            "sklearn_version": sklearn.__version__,
            "training": {
                "dataset": "synthetic",
                "seed": config.seed,
                "minutes": config.minutes,
                "clients": config.n_clients,
                "incidents_unlabelled": config.n_incidents,
                "rows": int(len(train_df)),
            },
            "hyperparameters": {
                "n_estimators": config.n_estimators,
                "max_samples": config.max_samples,
                "contamination": "auto",
                "random_state": config.seed,
            },
        },
    )


def load(directory: Path) -> PulseModel:
    return joblib.load(directory / MODEL_FILE)
