from __future__ import annotations

import random
from dataclasses import dataclass, field
from math import inf, sqrt
from pathlib import Path
from shutil import copyfile
from statistics import mean
from typing import Iterable

import numpy as np

from snake_nn.browser_export_adapter import write_browser_model
from snake_nn.vendor.chrispresso.crossover import simulated_binary_crossover as SBX, single_point_binary_crossover
from snake_nn.vendor.chrispresso.mutation import gaussian_mutation, random_uniform_mutation
from snake_nn.vendor.chrispresso.population import Population
from snake_nn.vendor.chrispresso.selection import elitism_selection, roulette_wheel_selection
from snake_nn.vendor.chrispresso.settings import settings as default_settings
from snake_nn.vendor.chrispresso.snake import Snake


@dataclass
class TrainerConfig:
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


class HeadlessTrainer:
    def __init__(self, config: TrainerConfig, settings_override=None):
        self.config = config
        self.settings = dict(default_settings)
        self.settings.update({
            'num_parents': config.num_parents,
            'num_offspring': config.num_offspring,
        })
        if settings_override:
            self.settings.update(settings_override)

        self.seed = config.seed
        random.seed(config.seed)
        np.random.seed(config.seed)
        self.current_generation = 0
        self._SBX_eta = self.settings['SBX_eta']
        self._mutation_bins = np.cumsum([
            self.settings['probability_gaussian'],
            self.settings['probability_random_uniform'],
        ])
        self._crossover_bins = np.cumsum([
            self.settings['probability_SBX'],
            self.settings['probability_SPBX'],
        ])
        self._SPBX_type = self.settings['SPBX_type'].lower()
        self._mutation_rate = self.settings['mutation_rate']
        self._rng = random.Random(config.seed)
        self._np_rng = np.random.default_rng(config.seed)

        initial_board = self.settings['board_size']
        individuals = [self._create_snake(board_size=initial_board) for _ in range(self.settings['num_parents'])]
        self.population = Population(individuals)

    def _compute_starvation_limit(self, board_size: tuple[int, int]) -> int:
        columns, rows = board_size
        return max(100, int(columns * rows * self.config.starvation_scale))

    def _create_snake(self, board_size: tuple[int, int], chromosome=None, lifespan=None, apple_seed=None):
        starvation_limit = self._compute_starvation_limit(board_size)
        return Snake(
            board_size,
            chromosome=chromosome,
            hidden_layer_architecture=self.settings['hidden_network_architecture'],
            hidden_activation=self.settings['hidden_layer_activation'],
            output_activation=self.settings['output_layer_activation'],
            lifespan=self.settings['lifespan'] if lifespan is None else lifespan,
            apple_and_self_vision=self.settings['apple_and_self_vision'],
            starvation_limit=starvation_limit,
            apple_seed=apple_seed,
        )

    def _sample_board_sizes_for_individual(self) -> list[tuple[int, int]]:
        if self.config.boards_per_individual >= len(self.config.board_size_pool):
            return list(self.config.board_size_pool)
        return self._rng.sample(self.config.board_size_pool, self.config.boards_per_individual)

    def _clone_individual_for_board(self, individual, board_size: tuple[int, int], lifespan=None, reseed_offset=0):
        return self._create_snake(
            board_size=board_size,
            chromosome=individual.network.params,
            lifespan=individual.lifespan if lifespan is None else lifespan,
            apple_seed=(individual.apple_seed + reseed_offset) if getattr(individual, 'apple_seed', None) is not None else None,
        )

    def _evaluate_single_snake(self, snake):
        while snake.is_alive:
            snake.update()
            snake.move()
        snake.calculate_fitness()
        return {
            'fitness': float(snake.fitness),
            'score': float(snake.score),
            'frames': float(snake._frames),
            'boardSize': list(snake.board_size),
            'starvationLimit': snake.starvation_limit,
        }

    def evaluate_individual_across_boards(self, individual):
        board_sizes = self._sample_board_sizes_for_individual()
        episodes = []
        for board_size in board_sizes:
            for episode_index in range(self.config.episodes_per_board):
                trial = self._clone_individual_for_board(individual, board_size, reseed_offset=episode_index)
                episodes.append(self._evaluate_single_snake(trial))

        avg_fitness = mean(item['fitness'] for item in episodes)
        avg_score = mean(item['score'] for item in episodes)
        avg_frames = mean(item['frames'] for item in episodes)
        individual._fitness = avg_fitness
        individual.evaluation_summary = {
            'fitness': avg_fitness,
            'score': avg_score,
            'frames': avg_frames,
            'episodes': episodes,
            'boardSizePool': [list(size) for size in board_sizes],
        }
        return individual.evaluation_summary

    def _crossover(self, parent1_weights, parent2_weights, parent1_bias, parent2_bias):
        rand_crossover = self._rng.random()
        crossover_bucket = np.digitize(rand_crossover, self._crossover_bins)
        if crossover_bucket == 0:
            child1_weights, child2_weights = SBX(parent1_weights, parent2_weights, self._SBX_eta)
            child1_bias, child2_bias = SBX(parent1_bias, parent2_bias, self._SBX_eta)
        elif crossover_bucket == 1:
            child1_weights, child2_weights = single_point_binary_crossover(parent1_weights, parent2_weights, major=self._SPBX_type)
            child1_bias, child2_bias = single_point_binary_crossover(parent1_bias, parent2_bias, major=self._SPBX_type)
        else:
            raise Exception('Unable to determine valid crossover based off probabilities')
        return child1_weights, child2_weights, child1_bias, child2_bias

    def _mutation(self, child1_weights, child2_weights, child1_bias, child2_bias):
        scale = 0.2
        rand_mutation = self._rng.random()
        mutation_bucket = np.digitize(rand_mutation, self._mutation_bins)
        mutation_rate = self._mutation_rate
        if self.settings['mutation_rate_type'].lower() == 'decaying':
            mutation_rate = mutation_rate / sqrt(self.current_generation + 1)

        if mutation_bucket == 0:
            gaussian_mutation(child1_weights, mutation_rate, scale=scale)
            gaussian_mutation(child2_weights, mutation_rate, scale=scale)
            gaussian_mutation(child1_bias, mutation_rate, scale=scale)
            gaussian_mutation(child2_bias, mutation_rate, scale=scale)
        elif mutation_bucket == 1:
            random_uniform_mutation(child1_weights, mutation_rate, -1, 1)
            random_uniform_mutation(child2_weights, mutation_rate, -1, 1)
            random_uniform_mutation(child1_bias, mutation_rate, -1, 1)
            random_uniform_mutation(child2_bias, mutation_rate, -1, 1)
        else:
            raise Exception('Unable to determine valid mutation based off probabilities.')

    def evaluate_population(self):
        for individual in self.population.individuals:
            self.evaluate_individual_across_boards(individual)

    def next_generation(self):
        self.current_generation += 1
        selected_parents = elitism_selection(self.population, self.settings['num_parents'])
        parent_population = Population(selected_parents)
        surviving_parents = []

        if self.settings['selection_type'].lower() == 'plus':
            for individual in selected_parents:
                individual.lifespan -= 1
                if individual.lifespan > 0:
                    survivor = self._clone_individual_for_board(individual, individual.board_size, lifespan=individual.lifespan)
                    surviving_parents.append(survivor)

        offspring = []
        while len(offspring) < self.settings['num_offspring']:
            p1, p2 = roulette_wheel_selection(parent_population, 2)
            c1_params = {}
            c2_params = {}
            for layer in range(1, len(p1.network.layer_nodes)):
                w_name = f'W{layer}'
                b_name = f'b{layer}'
                child1_weights, child2_weights, child1_bias, child2_bias = self._crossover(
                    p1.network.params[w_name],
                    p2.network.params[w_name],
                    p1.network.params[b_name],
                    p2.network.params[b_name],
                )
                self._mutation(child1_weights, child2_weights, child1_bias, child2_bias)
                c1_params[w_name] = np.clip(child1_weights, -1, 1)
                c1_params[b_name] = np.clip(child1_bias, -1, 1)
                c2_params[w_name] = np.clip(child2_weights, -1, 1)
                c2_params[b_name] = np.clip(child2_bias, -1, 1)

            base_board = self._rng.choice(self.config.board_size_pool)
            offspring.append(self._create_snake(base_board, chromosome=c1_params))
            if len(offspring) < self.settings['num_offspring']:
                offspring.append(self._create_snake(base_board, chromosome=c2_params))

        if self.settings['selection_type'].lower() == 'plus':
            next_population = surviving_parents + offspring
        else:
            next_population = offspring

        self._rng.shuffle(next_population)
        self.population = Population(next_population)

    def _build_metadata(self, best_individual):
        summary = getattr(best_individual, 'evaluation_summary', None) or {}
        return {
            'fitness': best_individual.fitness,
            'score': summary.get('score', float(best_individual.score)),
            'frames': summary.get('frames', float(best_individual._frames)),
            'generation': self.current_generation,
            'selectionType': self.settings['selection_type'],
            'crossoverSelectionType': self.settings['crossover_selection_type'],
            'mutationRate': self.settings['mutation_rate'],
            'appleAndSelfVision': self.settings['apple_and_self_vision'],
            'boardSizePool': [list(size) for size in self.config.board_size_pool],
            'boardsPerIndividual': self.config.boards_per_individual,
            'episodesPerBoard': self.config.episodes_per_board,
            'starvationScale': self.config.starvation_scale,
            'seed': self.config.seed,
            'episodes': summary.get('episodes', []),
        }

    def train(self):
        best = None
        for generation in range(self.config.generations):
            self.evaluate_population()
            current_best = max(self.population.individuals, key=lambda individual: individual.fitness)
            if best is None or current_best.fitness > best.fitness:
                best = current_best
            population_size = len(self.population.individuals)
            print(
                f'generation={generation} population={population_size} best_fitness={current_best.fitness:.2f} '
                f'avg_score={current_best.evaluation_summary["score"]:.2f} avg_frames={current_best.evaluation_summary["frames"]:.2f}'
            )
            self.next_generation()

        export_dir = Path(self.config.export_dir)
        export_dir.mkdir(parents=True, exist_ok=True)
        export_path = export_dir / f'{self.config.export_name}.json'
        default_path = Path('snake_models/snakeai-default.json')
        metadata = self._build_metadata(best)
        exported = write_browser_model(best, self.settings, metadata, export_path)
        if self.config.promote_to_default:
            default_path.parent.mkdir(parents=True, exist_ok=True)
            copyfile(exported, default_path)
        return exported


def train_default():
    trainer = HeadlessTrainer(TrainerConfig())
    return trainer.train()


if __name__ == '__main__':
    output = train_default()
    print(output)
