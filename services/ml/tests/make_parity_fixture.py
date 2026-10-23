"""Regenerate tests/fixtures/context_parity.json (run from services/ml)."""

import json
from pathlib import Path

import numpy as np
import pandas as pd

from pulse_ml.context import CONTEXT_COLUMNS, add_context

rng = np.random.default_rng(3)
t0 = 1_767_621_600_000
rows = []
for i in range(40):
    rows.append(
        {
            "ts_ms": int(t0 + i * 9_000 + (0 if i % 7 else 1_000)),
            "client_id": f"c{i % 3}",
            "method": ["GET", "POST"][i % 2],
            "route": ["/a", "/b", "/c/{id}"][i % 3 if i % 5 else 0],
            "status_code": int([200, 200, 404, 401, 500, 403][i % 6]),
            "latency_ms": float(10 + (i * 37) % 90),
            "request_bytes": int(0 if i % 2 == 0 else 100 + i),
            "response_bytes": int(200 + (i * 53) % 400),
        }
    )
out = add_context(pd.DataFrame(rows))
expected = []
for r in out.to_dict("records"):
    expected.append({c: (None if isinstance(r[c], float) and np.isnan(r[c]) else (int(r[c]) if c.startswith("client_") else float(r[c]))) for c in CONTEXT_COLUMNS})
events = out[["ts_ms", "client_id", "method", "route", "status_code", "latency_ms", "request_bytes", "response_bytes"]].to_dict("records")
path = Path(__file__).parent / "fixtures" / "context_parity.json"
path.write_text(json.dumps({"description": "Context-feature contract shared by pulse_ml.context and the Node context service.", "events": events, "expected": expected}, indent=1, default=int))
print(f"wrote {path}")
