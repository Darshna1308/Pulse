"""Train the Isolation Forest on reproducible synthetic traffic.

Usage: python -m pulse_ml.train [--seed 42] [--model-dir models]
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from . import config
from .model import PulseModel, TrainConfig, train
from .synthetic import generate_dataset


def train_default(cfg: TrainConfig | None = None, out_dir: Path | None = None) -> PulseModel:
    cfg = cfg or TrainConfig()
    # Training data carries a handful of unlabelled incidents, as real traffic would.
    # The label column is dropped before fitting so it cannot leak into the model.
    df = generate_dataset(cfg.seed, minutes=cfg.minutes, n_clients=cfg.n_clients, n_incidents=cfg.n_incidents)
    df = df.drop(columns=["label", "scenario", "incident_id"])
    model = train(df, cfg)
    if out_dir is not None:
        model.save(out_dir)
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--minutes", type=int, default=3 * 1440)
    parser.add_argument("--alert-quantile", type=float, default=0.995)
    parser.add_argument("--model-dir", type=Path, default=config.model_dir())
    args = parser.parse_args()

    started = time.perf_counter()
    cfg = TrainConfig(seed=args.seed, minutes=args.minutes, alert_quantile=args.alert_quantile)
    model = train_default(cfg, args.model_dir)
    print(f"Trained {model.version} on {model.meta['training']['rows']:,} events in {time.perf_counter() - started:.1f}s")
    print(f"Alert threshold (q={cfg.alert_quantile}): {model.threshold:.4f}")
    print(f"Saved to {args.model_dir}")


if __name__ == "__main__":
    main()
