from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
else:
    project_root = Path(__file__).resolve().parent.parent

from snake_nn.trainer import TrainingConfig, train


if __name__ == '__main__':
    output = train(TrainingConfig())
    print(output)
