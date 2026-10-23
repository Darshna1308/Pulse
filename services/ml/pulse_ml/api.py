"""FastAPI application exposing inference and model operations.

Run: uvicorn pulse_ml.api:app --port 8000
"""

from __future__ import annotations

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from . import config, evaluate as evaluation
from .model import PulseModel, load
from .schemas import PredictRequest, PredictResponse, SyntheticRequest, SyntheticResponse
from .synthetic import generate_raw

log = logging.getLogger("pulse_ml")


class ModelStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.model: PulseModel | None = None
        self.error: str | None = None
        self.eval_lock = threading.Lock()

    def load(self) -> None:
        try:
            self.model = load(self.directory)
            self.error = None
        except FileNotFoundError:
            self.model, self.error = None, "Model artifact not found. Run `python -m pulse_ml.train`."
        except Exception:  # noqa: BLE001 - surface a safe message, log the detail
            log.exception("Failed to load model")
            self.model, self.error = None, "Model artifact could not be loaded."

    def require(self) -> PulseModel:
        if self.model is None:
            raise HTTPException(status_code=503, detail=self.error or "Model not loaded")
        return self.model


def create_app(model_dir: Path | None = None) -> FastAPI:
    store = ModelStore(model_dir or config.model_dir())

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        store.load()
        yield

    app = FastAPI(title="Pulse ML service", version="0.1.0", lifespan=lifespan)
    app.state.store = store

    def require_token(x_internal_token: str | None = Header(default=None)) -> None:
        expected = config.internal_token()
        if expected is None:
            return
        if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
            raise HTTPException(status_code=401, detail="Invalid internal token")

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Internal error"})

    @app.get("/health")
    def health() -> dict:
        model = store.model
        return {
            "status": "ok" if model else "degraded",
            "model_loaded": model is not None,
            "model_version": model.version if model else None,
            "detail": store.error,
        }

    @app.get("/model/info", dependencies=[Depends(require_token)])
    def model_info() -> dict:
        return store.require().info()

    @app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_token)])
    def predict(body: PredictRequest) -> PredictResponse:
        model = store.require()
        rows = []
        for e in body.events:
            ts = e.timestamp if e.timestamp.tzinfo else e.timestamp.replace(tzinfo=timezone.utc)
            rows.append(
                {
                    "method": e.method,
                    "route": e.route,
                    "status_code": e.status_code,
                    "latency_ms": e.latency_ms,
                    "request_bytes": e.request_bytes,
                    "response_bytes": e.response_bytes,
                    "ts_ms": int(ts.timestamp() * 1000),
                    "client_id": e.client_id,
                    **e.context.model_dump(),
                }
            )
        results = model.predict(pd.DataFrame(rows), explain=body.explain, policy=body.policy)
        return PredictResponse(
            model_version=model.version,
            threshold=round(model.threshold, 5),
            policy=body.policy,
            predictions=[{"index": i, **r} for i, r in enumerate(results)],
        )

    @app.get("/model/evaluation", dependencies=[Depends(require_token)])
    def latest_evaluation() -> dict:
        model = store.require()
        report = evaluation.load_report(store.directory)
        if report is None or report.get("model_version") != model.version:
            raise HTTPException(status_code=404, detail="No evaluation has been run for the current model")
        return report

    @app.post("/model/evaluate", dependencies=[Depends(require_token)])
    def run_evaluation() -> dict:
        store.require()
        if not store.eval_lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="An evaluation is already running")
        try:
            return evaluation.run_and_save(store.directory)
        finally:
            store.eval_lock.release()

    @app.post("/synthetic/events", response_model=SyntheticResponse, dependencies=[Depends(require_token)])
    def synthetic_events(body: SyntheticRequest) -> SyntheticResponse:
        end = body.end_time or datetime.now(timezone.utc)
        end = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
        start = end - timedelta(minutes=body.minutes)
        df = generate_raw(body.seed, minutes=body.minutes, n_clients=body.clients, n_incidents=body.incidents, start=start)
        df = df[df["ts_ms"] < int(end.timestamp() * 1000)]
        events = [
            {
                "timestamp": datetime.fromtimestamp(r.ts_ms / 1000, tz=timezone.utc),
                "client_id": r.client_id,
                "method": r.method,
                "route": r.route,
                "status_code": int(r.status_code),
                "latency_ms": float(r.latency_ms),
                "request_bytes": int(r.request_bytes),
                "response_bytes": int(r.response_bytes),
                "scenario": r.scenario,
            }
            for r in df.itertuples(index=False)
        ]
        return SyntheticResponse(seed=body.seed, events=events)

    return app


app = create_app()
