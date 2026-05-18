from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from snake_nn.headless_train import HeadlessTrainer, TrainerConfig


@dataclass
class TrainingConfig:
    seed: int = 7
    generations: int = 40
    num_parents: int = 200
    num_offspring: int = 400
    board_size_pool: list[tuple[int, int]] = field(default_factory=lambda: [(8, 8), (10, 10), (12, 12), (14, 14), (16, 16)])
    boards_per_individual: int = 3
    episodes_per_board: int = 2
    starvation_scale: float = 1.0
    export_name: str = 'snakeai-default'
    export_dir: str = 'snake_models/exports'
    promote_to_default: bool = True


def train(config: TrainingConfig) -> Path:
    trainer = HeadlessTrainer(
        TrainerConfig(
            seed=config.seed,
            generations=config.generations,
            num_parents=config.num_parents,
            num_offspring=config.num_offspring,
            board_size_pool=config.board_size_pool,
            boards_per_individual=config.boards_per_individual,
            episodes_per_board=config.episodes_per_board,
            starvation_scale=config.starvation_scale,
            export_name=config.export_name,
            export_dir=config.export_dir,
            promote_to_default=config.promote_to_default,
        )
    )
    return trainer.train()


if __name__ == '__main__':
    output = train(TrainingConfig())
    print(f'exported={output}')
