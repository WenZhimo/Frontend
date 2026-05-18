from __future__ import annotations

from snake_nn.trainer import TrainingConfig, train


if __name__ == '__main__':
    output = train(TrainingConfig())
    print(output)
