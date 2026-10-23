from __future__ import annotations

from pathlib import Path

import pytest

from pulse_ml.model import TrainConfig
from pulse_ml.train import train_default

SMALL = TrainConfig(seed=11, minutes=720, n_clients=10, n_incidents=2, n_estimators=60, max_samples=512)


@pytest.fixture(scope="session")
def model_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    directory = tmp_path_factory.mktemp("model")
    train_default(SMALL, directory)
    return directory


@pytest.fixture(scope="session")
def small_model(model_dir: Path):
    from pulse_ml.model import load

    return load(model_dir)
