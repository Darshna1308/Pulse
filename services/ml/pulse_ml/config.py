"""Runtime configuration from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"


def model_dir() -> Path:
    return Path(os.environ.get("PULSE_ML_MODEL_DIR", DEFAULT_MODEL_DIR))


def internal_token() -> str | None:
    """Shared secret the Node API sends in X-Internal-Token. Unset disables the check (dev only)."""
    token = os.environ.get("PULSE_ML_INTERNAL_TOKEN", "").strip()
    return token or None
