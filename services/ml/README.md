# Pulse ML service

Unsupervised anomaly detection for API request metadata, served with FastAPI.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pulse_ml.train        # ~20 s; writes models/model.joblib + model_meta.json
python -m pulse_ml.evaluate     # writes models/evaluation.json
pytest -q
PULSE_ML_INTERNAL_TOKEN=<shared secret> uvicorn pulse_ml.api:app --port 8000
```

Model artifacts are git-ignored: they are deterministic outputs of the code and seeds, so anyone can rebuild the same version (`iforest-<hash>`, which covers the configuration, feature list, library versions and a fingerprint of the training data).

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness and whether a model is loaded |
| GET | `/model/info` | token | Version, parameters, threshold, severity bands, feature list, training baselines |
| POST | `/predict` | token | Score 1 to 500 events with context; returns score, percentile, severity, `detected_by`, pattern, evidence and attributions |
| GET | `/model/evaluation` | token | Latest evaluation report for the loaded model (404 if none) |
| POST | `/model/evaluate` | token | Run the evaluation now (one at a time) |
| POST | `/synthetic/events` | token | Generate simulated traffic; used only by the API's demo project generator |

"token" means the `X-Internal-Token` header must equal `PULSE_ML_INTERNAL_TOKEN` (constant-time comparison). If the variable is unset the check is disabled, which is meant for local development only. Request bodies are validated with Pydantic and unknown fields are rejected.

## Data

`pulse_ml/synthetic.py` generates traffic for 13 routes of a fictional commerce API. Each route has its own latency distribution, payload sizes and error mix; load follows a diurnal curve; each client has its own activity level and route preferences. Six incident types can be injected:

| Scenario | What changes |
| --- | --- |
| Credential stuffing | Bursts of `POST /v1/auth/login` returning 401 |
| Endpoint probing | Many distinct, often non-existent routes with 404/403 |
| High-rate scraping | One client enumerating `/v1/products/{id}` or `/v1/orders/{id}` at a high rate, with many 404s |
| Bulk data export | Very large, slow responses from `/v1/reports/export` |
| Oversized payloads | 0.2 to 4 MB request bodies on `POST /v1/search`, with 413 and 500 responses |
| Server error storm | Mostly 500/502/503 on `POST /v1/payments` with high latency |

**Training set:** seed 42, 3 days starting 2026-01-05, 30 clients, 3 injected incidents (a little contamination, as real traffic would have), about 285k events. Labels exist but are dropped before training.

**Evaluation set:** seed 1337, 24 hours starting 21 days after the training start, 24 incidents. Different seed and date range, generated independently, so no event or incident overlaps the training data. Hyperparameters (`max_samples`) were chosen on a third validation seed (7), not on the evaluation set.

## Context and features

`pulse_ml/context.py` computes, for each event, using only events at or before it:

- per client over the last 1 and 5 minutes: request count, errors, auth failures (401/403), distinct method+route pairs;
- per method+route: the lower median of latency, request bytes and response bytes over the previous 24 hours (at most the last 500 events; null when fewer than 5).

The Node API computes the same values from MongoDB at ingestion time. `tests/fixtures/context_parity.json` pins both implementations to identical outputs.

`pulse_ml/features.py` turns an event plus context into 17 numeric features: log latency, log request and response size, log ratios of each against the route median, 4xx/5xx/auth-failure flags, cyclic hour of day, log client rates over 1 and 5 minutes, client error and auth-failure rates, log distinct routes, and a write-method flag. Route and client identities are not features, so the model applies to APIs it has never seen. No headers, bodies, cookies, tokens or IP addresses are used.

## Model and decision policy

- `IsolationForest(n_estimators=300, max_samples=4096, contamination="auto", random_state=42)` from scikit-learn 1.6.
- `anomaly_score = -score_samples(x)`, in (0, 1]. Higher means the event was isolated with fewer random splits. It is a ranking signal, not a probability of attack.
- Threshold: the 99.5th percentile of training scores (an explicit alert budget of about 0.5% of normal traffic). Severity: medium above the threshold, high above the 99.9th percentile, critical above the 99.99th.
- Guardrail (`policy="hybrid"`, the default): also flag events whose latency, request size or response size exceeds 10× its training p99. Trees cannot extrapolate, so without this a 1 GB response scores no higher than a 10 MB one. Predictions report `detected_by: ["model"]`, `["guardrail"]` or both.

## Explanations

Each prediction returns two separate lists:

- **evidence**: observed facts, for example "Client request rate (1 min) is 142, 47× the training median". Computed from raw values against training medians and p99s, plus status-code facts for 5xx and 401/403.
- **attributions**: model sensitivity, the drop in anomaly score when one feature is reset to its training median while the others stay fixed (hour sin and cos are reset together). This shows what the model reacted to; it is not a causal explanation.

A descriptive pattern (`auth_failures`, `route_probing`, `burst_with_errors`, `rate_burst`, `large_responses`, `oversized_payloads`, `server_errors`, `latency_spike`, `unusual_combination`) is derived from the evidence for grouping and titles. It describes what was observed and does not claim intent.

## Evaluation

`pulse_ml/evaluate.py` reports, for the Isolation Forest alone, the hybrid policy, and a baseline: precision, recall, F1, false-positive rate, ROC AUC, average precision, confusion matrix, per-scenario recall and incident-level recall (an incident counts as detected if any of its events is flagged). The baseline flags an event when any single raw metric's percentile rank against training data exceeds a threshold set so it uses the same alert budget on training data.

Results for `iforest-0309c7b4` (reproduced from scratch with identical output):

| | Precision | Recall | F1 | FPR | ROC AUC | Incidents |
| --- | --- | --- | --- | --- | --- | --- |
| Isolation Forest | 0.960 | 0.660 | 0.782 | 0.44% | 0.996 | 23/24 |
| IF + guardrail | 0.946 | 0.698 | 0.803 | 0.65% | 0.995 | 24/24 |
| Percentile rules | 0.957 | 0.896 | 0.926 | 0.65% | 0.998 | 24/24 |

The rule baseline wins on per-event recall and F1 on this benchmark, driven by high-rate scraping (47% IF vs 94% rules), a single-feature anomaly. The forest is stronger on multi-signal attacks (credential stuffing 100% vs 77%, probing 99% vs 80%) and has the lowest false-positive rate. Per-event recall is also limited because the first requests of an incident look normal until the client's window counts build up. These are synthetic results and are not a claim about performance on real traffic.
