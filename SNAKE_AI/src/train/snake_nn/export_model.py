from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parents[3]
    src_root = Path(__file__).resolve().parents[2]
    for entry in (src_root, project_root):
        if str(entry) not in sys.path:
            sys.path.insert(0, str(entry))
else:
    project_root = Path(__file__).resolve().parents[3]

from train.snake_nn.trainer import TrainingConfig, train


if __name__ == '__main__':
    output = train(TrainingConfig())
    print(output)
