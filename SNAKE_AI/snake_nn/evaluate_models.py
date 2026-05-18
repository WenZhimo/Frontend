from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean, pstdev

from snake_nn.vendor.chrispresso.neural_network import FeedForwardNetwork
from snake_nn.vendor.chrispresso.snake import Snake


def load_model(model_path: Path):
    data = json.loads(model_path.read_text(encoding='utf-8'))
    return data


def build_vendor_params(model):
    import numpy as np
    params = {}
    for layer in (1, 2, 3):
        params[f'W{layer}'] = np.array(model['weights'][f'W{layer}'], dtype=float).T
        params[f'b{layer}'] = np.array(model['weights'][f'b{layer}'], dtype=float).reshape((-1, 1))
    return params


def evaluate_model(model_path: Path, board_sizes, episodes_per_board: int, starvation_scale: float):
    model = load_model(model_path)
    params = build_vendor_params(model)
    results = []

    for board_size in board_sizes:
        for episode in range(episodes_per_board):
            starvation_limit = max(100, int(board_size[0] * board_size[1] * starvation_scale))
            snake = Snake(
                board_size,
                chromosome=params,
                hidden_layer_architecture=model['hiddenSizes'],
                hidden_activation=model['hiddenActivation'],
                output_activation=model['outputActivation'],
                apple_and_self_vision=model['metadata'].get('appleAndSelfVision', 'binary'),
                starvation_limit=starvation_limit,
                apple_seed=episode,
            )
            while snake.is_alive:
                snake.update()
                snake.move()
            snake.calculate_fitness()
            results.append({
                'boardSize': list(board_size),
                'episode': episode,
                'fitness': float(snake.fitness),
                'score': float(snake.score),
                'frames': float(snake._frames),
            })

    return {
        'model': str(model_path),
        'avgFitness': mean(item['fitness'] for item in results),
        'avgScore': mean(item['score'] for item in results),
        'avgFrames': mean(item['frames'] for item in results),
        'fitnessStd': pstdev(item['fitness'] for item in results) if len(results) > 1 else 0.0,
        'results': results,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('target', help='Model file or directory containing model json files')
    parser.add_argument('--episodes-per-board', type=int, default=2)
    parser.add_argument('--starvation-scale', type=float, default=1.0)
    args = parser.parse_args()

    target = Path(args.target)
    if target.is_dir():
        model_paths = sorted(target.glob('*.json'))
    else:
        model_paths = [target]

    board_sizes = [(8, 8), (10, 10), (12, 12), (14, 14), (16, 16)]
    reports = [evaluate_model(path, board_sizes, args.episodes_per_board, args.starvation_scale) for path in model_paths]
    print(json.dumps(reports, indent=2))


if __name__ == '__main__':
    main()
