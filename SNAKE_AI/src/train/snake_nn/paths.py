from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = PROJECT_ROOT / 'data'
MODELS_ROOT = DATA_ROOT / 'models'
PROFILES_DIR = MODELS_ROOT / 'profiles'
ARTIFACTS_ROOT = PROJECT_ROOT / 'artifacts'
MODEL_ARTIFACTS_ROOT = ARTIFACTS_ROOT / 'models'
EXPORTS_ROOT = MODEL_ARTIFACTS_ROOT / 'exports'
CHECKPOINTS_ROOT = MODEL_ARTIFACTS_ROOT / 'checkpoints'
LONG_RUN_ROOT = MODEL_ARTIFACTS_ROOT / 'long-run'


def resolve_project_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def relative_to_project(path_like: str | Path) -> str:
    return resolve_project_path(path_like).resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
