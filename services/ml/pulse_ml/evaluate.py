"""Evaluate the trained model on a separate, labelled synthetic dataset.

Leakage controls
* The evaluation set uses a different seed, a different date range and its own
  injected incidents. No rows are shared with training.
* Labels are only read here, after scoring; neither model sees them.

Baseline
* "Univariate percentile rules": each interpretable metric (request rate, error
  rates, distinct routes, latency ratio, sizes) is converted to its percentile rank
  among *training* events, and an event's baseline score is the maximum of those
  ranks. Its threshold uses the same alert quantile as the model, so both detectors
  get the same alert budget on training traffic.

Usage: python -m pulse_ml.evaluate [--seed 1337]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, confusion_matrix, roc_auc_score

from . import config
from .model import EVIDENCE_METRICS, PulseModel, load, raw_metrics
from .synthetic import DEFAULT_START, SCENARIO_TITLES, generate_dataset

EVAL_FILE = "evaluation.json"


class PercentileRuleBaseline:
    def __init__(self, train_df: pd.DataFrame, alert_quantile: float):
        metrics = raw_metrics(train_df)
        self.sorted = {k: np.sort(metrics[k].to_numpy(np.float64)[np.isfinite(metrics[k])]) for k in EVIDENCE_METRICS}
        train_scores = self.score(train_df)
        self.threshold = float(np.quantile(train_scores, alert_quantile))

    def score(self, df: pd.DataFrame) -> np.ndarray:
        metrics = raw_metrics(df)
        ranks = []
        for key, ref in self.sorted.items():
            v = np.nan_to_num(metrics[key].to_numpy(np.float64), nan=-np.inf)
            # Mid-rank so ties (common for discrete counts) are not pushed to the top.
            lo = np.searchsorted(ref, v, side="left")
            hi = np.searchsorted(ref, v, side="right")
            ranks.append((lo + hi) / (2.0 * len(ref)))
        return np.max(np.vstack(ranks), axis=0)

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return self.score(df) > self.threshold


def _metrics(y: np.ndarray, flagged: np.ndarray, scores: np.ndarray) -> dict[str, Any]:
    tn, fp, fn, tp = confusion_matrix(y, flagged, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "false_positive_rate": round(float(fp / (fp + tn)) if fp + tn else 0.0, 5),
        "roc_auc": round(float(roc_auc_score(y, scores)), 4),
        "average_precision": round(float(average_precision_score(y, scores)), 4),
        "confusion": {"tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn)},
        "flagged": int(flagged.sum()),
    }


def _per_scenario(df: pd.DataFrame, flagged: np.ndarray) -> dict[str, dict[str, Any]]:
    out = {}
    incidents = df[df["incident_id"] >= 0].assign(flagged=flagged[df["incident_id"].to_numpy() >= 0])
    detected = incidents.groupby("incident_id").agg(scenario=("scenario", "first"), hit=("flagged", "any"))
    for scenario, idx in df.groupby("scenario").indices.items():
        if scenario == "normal":
            continue
        per_incident = detected[detected["scenario"] == scenario]["hit"]
        out[scenario] = {
            "title": SCENARIO_TITLES[scenario],
            "events": int(len(idx)),
            "recall": round(float(flagged[idx].mean()), 4),
            "incidents": int(len(per_incident)),
            "incidents_detected": int(per_incident.sum()),
        }
    return out


def _incident_recall(df: pd.DataFrame, flagged: np.ndarray) -> dict[str, Any]:
    """An incident counts as detected when at least one of its events is flagged."""
    mask = df["incident_id"].to_numpy() >= 0
    hits = pd.Series(flagged[mask]).groupby(df["incident_id"].to_numpy()[mask]).any()
    return {"incidents": int(len(hits)), "detected": int(hits.sum()), "recall": round(float(hits.mean()), 4)}


def evaluate(model: PulseModel, seed: int = 1337, minutes: int = 1440, n_incidents: int = 24) -> dict[str, Any]:
    training = model.meta["training"]
    train_df = generate_dataset(
        training["seed"], minutes=training["minutes"], n_clients=training["clients"], n_incidents=training["incidents_unlabelled"]
    ).drop(columns=["label", "scenario", "incident_id"])

    eval_start = DEFAULT_START + timedelta(days=21)
    eval_df = generate_dataset(seed, minutes=minutes, n_clients=30, n_incidents=n_incidents, start=eval_start)
    y = eval_df["label"].to_numpy(np.int64)

    model_scores, model_flags, guard_flags = model.detect(eval_df, policy="hybrid")
    hybrid_flags = model_flags | guard_flags
    # For ranking metrics, guardrail hits rank above every model-only score.
    hybrid_scores = np.where(guard_flags, 1.0 + model_scores, model_scores)

    baseline = PercentileRuleBaseline(train_df, model.alert_quantile)
    base_scores = baseline.score(eval_df)
    base_flags = base_scores > baseline.threshold

    return {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": model.version,
        "dataset": {
            "kind": "synthetic, labelled",
            "seed": seed,
            "start": eval_start.isoformat(),
            "minutes": minutes,
            "events": int(len(eval_df)),
            "anomalous_events": int(y.sum()),
            "anomaly_rate": round(float(y.mean()), 4),
            "incidents": n_incidents,
            "training_seed": training["seed"],
            "overlap_with_training": "none (different seed and date range)",
        },
        "alert_quantile": model.alert_quantile,
        "isolation_forest": {
            "threshold": round(model.threshold, 5),
            **_metrics(y, model_flags, model_scores),
            "per_scenario": _per_scenario(eval_df, model_flags),
            "incident_level": _incident_recall(eval_df, model_flags),
            "score_median": {
                "normal": round(float(np.median(model_scores[y == 0])), 4),
                "anomalous": round(float(np.median(model_scores[y == 1])), 4),
            },
        },
        "hybrid_policy": {
            "name": "Isolation Forest + magnitude guardrail",
            "guardrail_factor": model.guardrail_factor,
            "guardrail_only_flags": int((guard_flags & ~model_flags).sum()),
            **_metrics(y, hybrid_flags, hybrid_scores),
            "per_scenario": _per_scenario(eval_df, hybrid_flags),
            "incident_level": _incident_recall(eval_df, hybrid_flags),
        },
        "baseline": {
            "name": "Univariate percentile rules",
            "threshold": round(baseline.threshold, 5),
            **_metrics(y, base_flags, base_scores),
            "per_scenario": _per_scenario(eval_df, base_flags),
            "incident_level": _incident_recall(eval_df, base_flags),
        },
        "notes": [
            "Metrics are computed per event on simulated traffic and will differ on real APIs.",
            "Early events in an incident often look normal because their window counts are still small, "
            "which lowers per-event recall.",
            "Anomaly scores are rankings, not probabilities of attack.",
        ],
    }


def run_and_save(model_directory: Path | None = None, **kwargs) -> dict[str, Any]:
    directory = model_directory or config.model_dir()
    report = evaluate(load(directory), **kwargs)
    (directory / EVAL_FILE).write_text(json.dumps(report, indent=2))
    return report


def load_report(model_directory: Path | None = None) -> dict[str, Any] | None:
    path = (model_directory or config.model_dir()) / EVAL_FILE
    return json.loads(path.read_text()) if path.exists() else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--model-dir", type=Path, default=config.model_dir())
    args = parser.parse_args()
    report = run_and_save(args.model_dir, seed=args.seed)
    for name in ("isolation_forest", "hybrid_policy", "baseline"):
        m = report[name]
        print(
            f"{name:>17}: precision={m['precision']:.3f} recall={m['recall']:.3f} f1={m['f1']:.3f} "
            f"fpr={m['false_positive_rate']:.4f} roc_auc={m['roc_auc']:.3f} ap={m['average_precision']:.3f} "
            f"incidents={m['incident_level']['detected']}/{m['incident_level']['incidents']}"
        )
    print(json.dumps({k: v["recall"] for k, v in report["isolation_forest"]["per_scenario"].items()}, indent=1))


if __name__ == "__main__":
    main()
