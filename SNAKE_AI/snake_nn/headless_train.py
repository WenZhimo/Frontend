from __future__ import annotations

import base64
import json
import pickle
import random
import sys
from dataclasses import asdict, dataclass, field
from math import sqrt
from pathlib import Path
from shutil import copyfile, rmtree

import numpy as np

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
else:
    project_root = Path(__file__).resolve().parent.parent

from snake_nn.browser_export_adapter import write_browser_model
from snake_nn.scoring import (
    DEFAULT_APPROACH_APPLE_WEIGHT,
    DEFAULT_RAW_FITNESS_CAP,
    DEFAULT_RAW_FITNESS_WEIGHT,
    DEFAULT_REPEAT_CELL_PENALTY,
    DEFAULT_SCORE_WEIGHT,
    DEFAULT_STALL_PENALTY,
    DEFAULT_SURVIVAL_WEIGHT,
    DEFAULT_ZERO_SCORE_PENALTY,
    compute_selection_score,
    compute_survival_ratio,
    summarize_episodes,
)
from snake_nn.vendor.chrispresso.crossover import simulated_binary_crossover as SBX, single_point_binary_crossover
from snake_nn.vendor.chrispresso.mutation import gaussian_mutation, random_uniform_mutation
from snake_nn.vendor.chrispresso.population import Population
from snake_nn.vendor.chrispresso.selection import elitism_selection, roulette_wheel_selection
from snake_nn.vendor.chrispresso.settings import settings as default_settings
from snake_nn.vendor.chrispresso.snake import Snake, load_snake, save_snake


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
    score_weight: float = DEFAULT_SCORE_WEIGHT
    survival_weight: float = DEFAULT_SURVIVAL_WEIGHT
    raw_fitness_weight: float = DEFAULT_RAW_FITNESS_WEIGHT
    raw_fitness_cap: float = DEFAULT_RAW_FITNESS_CAP
    zero_score_penalty: float = DEFAULT_ZERO_SCORE_PENALTY
    approach_apple_weight: float = DEFAULT_APPROACH_APPLE_WEIGHT
    repeat_cell_penalty: float = DEFAULT_REPEAT_CELL_PENALTY
    stall_penalty: float = DEFAULT_STALL_PENALTY
    export_name: str = 'snakeai-default'
    export_dir: str = 'snake_models/exports'
    profile_id: str = 'generic'
    profile_label: str = '通用棋盘'
    checkpoint_dir: str = 'snake_models/exports/checkpoints'
    promote_to_default: bool = True
    population_checkpoint_enabled: bool = True
    population_checkpoint_interval: int = 5
    resume_from_checkpoint: str | None = None
    resume_strict: bool = True


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

        self.best_so_far = None
        self._initialize_rng(config.seed)

        if config.resume_from_checkpoint:
            self._load_population_checkpoint(config.resume_from_checkpoint)
        else:
            self.current_generation = 0
            initial_board = self.settings['board_size']
            individuals = [self._create_snake(board_size=initial_board) for _ in range(self.settings['num_parents'])]
            self.population = Population(individuals)

        self._refresh_operator_settings()

    def _initialize_rng(self, seed: int):
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)
        self._rng = random.Random(seed)

    def _refresh_operator_settings(self):
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

    def _resolve_project_path(self, path_str: str) -> Path:
        path = Path(path_str)
        if not path.is_absolute():
            path = project_root / path
        return path

    @staticmethod
    def _encode_state(value) -> str:
        return base64.b64encode(pickle.dumps(value)).decode('ascii')

    @staticmethod
    def _decode_state(value: str):
        return pickle.loads(base64.b64decode(value.encode('ascii')))

    @staticmethod
    def _normalize_value_for_compare(value):
        if isinstance(value, tuple):
            return [HeadlessTrainer._normalize_value_for_compare(item) for item in value]
        if isinstance(value, list):
            return [HeadlessTrainer._normalize_value_for_compare(item) for item in value]
        if isinstance(value, dict):
            return {key: HeadlessTrainer._normalize_value_for_compare(item) for key, item in value.items()}
        return value

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
        visited_head_cells = set()
        repeat_cell_count = 0
        approach_apple_events = 0
        stall_steps = 0
        previous_distance = None

        while snake.is_alive:
            head = snake.snake_array[0]
            head_key = (head.x, head.y)
            if head_key in visited_head_cells:
                repeat_cell_count += 1
            else:
                visited_head_cells.add(head_key)

            current_distance = abs(head.x - snake.apple_location.x) + abs(head.y - snake.apple_location.y)
            if previous_distance is not None:
                if current_distance < previous_distance:
                    approach_apple_events += 1
                else:
                    stall_steps += 1
            previous_distance = current_distance

            snake.update()
            snake.move()

        snake.calculate_fitness()
        survival_ratio = compute_survival_ratio(float(snake._frames), snake.starvation_limit)
        selection_score = compute_selection_score(
            score=float(snake.score),
            frames=float(snake._frames),
            raw_fitness=float(snake.fitness),
            starvation_limit=snake.starvation_limit,
            approach_apple_events=float(approach_apple_events),
            repeat_cell_count=float(repeat_cell_count),
            stall_steps=float(stall_steps),
            score_weight=self.config.score_weight,
            survival_weight=self.config.survival_weight,
            raw_fitness_weight=self.config.raw_fitness_weight,
            raw_fitness_cap=self.config.raw_fitness_cap,
            zero_score_penalty=self.config.zero_score_penalty,
            approach_apple_weight=self.config.approach_apple_weight,
            repeat_cell_penalty=self.config.repeat_cell_penalty,
            stall_penalty=self.config.stall_penalty,
        )
        return {
            'fitness': float(snake.fitness),
            'selectionScore': float(selection_score),
            'score': float(snake.score),
            'frames': float(snake._frames),
            'survivalRatio': float(survival_ratio),
            'approachAppleEvents': float(approach_apple_events),
            'repeatCellCount': float(repeat_cell_count),
            'stallSteps': float(stall_steps),
            'uniqueHeadCells': float(len(visited_head_cells)),
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

        summary = summarize_episodes(
            episodes,
            score_weight=self.config.score_weight,
            survival_weight=self.config.survival_weight,
            raw_fitness_weight=self.config.raw_fitness_weight,
            raw_fitness_cap=self.config.raw_fitness_cap,
            zero_score_penalty=self.config.zero_score_penalty,
            approach_apple_weight=self.config.approach_apple_weight,
            repeat_cell_penalty=self.config.repeat_cell_penalty,
            stall_penalty=self.config.stall_penalty,
        )
        individual._fitness = summary['avgSelectionScore']
        individual.evaluation_summary = {
            **summary,
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
            'fitness': summary.get('avgFitness', float(best_individual.fitness)),
            'selectionScore': float(best_individual.fitness),
            'score': summary.get('avgScore', float(best_individual.score)),
            'frames': summary.get('avgFrames', float(best_individual._frames)),
            'avgSurvivalRatio': summary.get('avgSurvivalRatio', 0.0),
            'generation': self.current_generation,
            'selectionType': self.settings['selection_type'],
            'crossoverSelectionType': self.settings['crossover_selection_type'],
            'mutationRate': self.settings['mutation_rate'],
            'appleAndSelfVision': self.settings['apple_and_self_vision'],
            'boardSizePool': [list(size) for size in self.config.board_size_pool],
            'boardsPerIndividual': self.config.boards_per_individual,
            'episodesPerBoard': self.config.episodes_per_board,
            'starvationScale': self.config.starvation_scale,
            'scoreWeight': self.config.score_weight,
            'survivalWeight': self.config.survival_weight,
            'rawFitnessWeight': self.config.raw_fitness_weight,
            'rawFitnessCap': self.config.raw_fitness_cap,
            'zeroScorePenalty': self.config.zero_score_penalty,
            'approachAppleWeight': self.config.approach_apple_weight,
            'repeatCellPenalty': self.config.repeat_cell_penalty,
            'stallPenalty': self.config.stall_penalty,
            'seed': self.config.seed,
            'profileId': self.config.profile_id,
            'profileLabel': self.config.profile_label,
            'episodes': summary.get('episodes', []),
        }

    def _write_checkpoint(self, snake, metadata, filename):
        checkpoint_dir = self._resolve_project_path(self.config.checkpoint_dir)
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_path = checkpoint_dir / filename
        write_browser_model(snake, self.settings, metadata, checkpoint_path)
        return checkpoint_path

    def _should_save_population_checkpoint(self) -> bool:
        interval = self.config.population_checkpoint_interval
        return (
            self.config.population_checkpoint_enabled
            and interval > 0
            and self.current_generation > 0
            and self.current_generation % interval == 0
        )

    def _population_checkpoint_path(self, checkpoint_root: Path) -> Path:
        return checkpoint_root / f'{self.config.seed}-latest'

    def _build_population_checkpoint_meta(self, checkpoint_name: str, population_manifest: list[str]):
        best_state = None
        if self.best_so_far is not None:
            best_state = {
                'fitness': float(self.best_so_far.fitness),
                'evaluationSummary': getattr(self.best_so_far, 'evaluation_summary', None),
            }

        return {
            'checkpointFormatVersion': 1,
            'seed': self.config.seed,
            'generation': self.current_generation,
            'checkpointName': checkpoint_name,
            'checkpointMode': 'overwrite',
            'checkpointInterval': self.config.population_checkpoint_interval,
            'trainerConfigSnapshot': asdict(self.config),
            'settingsSnapshot': self.settings,
            'populationManifest': population_manifest,
            'populationSize': len(population_manifest),
            'bestSoFarPath': 'best_so_far/ind-best' if self.best_so_far is not None else None,
            'bestSoFarState': best_state,
            'pythonRandomState': self._encode_state(random.getstate()),
            'numpyRandomState': self._encode_state(np.random.get_state()),
            'trainerRandomState': self._encode_state(self._rng.getstate()),
        }

    def _save_population_checkpoint(self):
        checkpoint_root = self._resolve_project_path(self.config.checkpoint_dir)
        checkpoint_root.mkdir(parents=True, exist_ok=True)
        checkpoint_path = self._population_checkpoint_path(checkpoint_root)
        if checkpoint_path.exists():
            rmtree(checkpoint_path)
        checkpoint_path.mkdir(parents=True, exist_ok=False)

        population_dir = checkpoint_path / 'population'
        best_so_far_dir = checkpoint_path / 'best_so_far'
        population_manifest = []

        for index, individual in enumerate(self.population.individuals):
            individual_name = f'ind-{index:05d}'
            population_manifest.append(individual_name)
            save_snake(str(population_dir), individual_name, individual, self.settings)

        if self.best_so_far is not None:
            save_snake(str(best_so_far_dir), 'ind-best', self.best_so_far, self.settings)

        meta = self._build_population_checkpoint_meta(checkpoint_path.name, population_manifest)
        meta_path = checkpoint_path / 'checkpoint_meta.json'
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'[snake_nn.headless_train] 已覆写整群 checkpoint：{checkpoint_path}')
        return checkpoint_path

    def _validate_resume_compatibility(self, meta):
        if not self.config.resume_strict:
            return

        checkpoint_config = meta.get('trainerConfigSnapshot', {})
        checkpoint_settings = meta.get('settingsSnapshot', {})
        config_fields = [
            'seed',
            'num_parents',
            'num_offspring',
            'board_size_pool',
            'boards_per_individual',
            'episodes_per_board',
            'starvation_scale',
            'score_weight',
            'survival_weight',
            'raw_fitness_weight',
            'raw_fitness_cap',
            'zero_score_penalty',
            'approach_apple_weight',
            'repeat_cell_penalty',
            'stall_penalty',
            'profile_id',
        ]
        settings_fields = [
            'board_size',
            'hidden_layer_activation',
            'output_layer_activation',
            'hidden_network_architecture',
            'mutation_rate',
            'mutation_rate_type',
            'probability_gaussian',
            'probability_random_uniform',
            'SBX_eta',
            'probability_SBX',
            'SPBX_type',
            'probability_SPBX',
            'crossover_selection_type',
            'num_parents',
            'num_offspring',
            'selection_type',
            'lifespan',
            'apple_and_self_vision',
        ]
        mismatches = []

        for field_name in config_fields:
            current_value = self._normalize_value_for_compare(getattr(self.config, field_name))
            checkpoint_value = self._normalize_value_for_compare(checkpoint_config.get(field_name))
            if current_value != checkpoint_value:
                mismatches.append(f'config.{field_name}: current={current_value!r}, checkpoint={checkpoint_value!r}')

        for field_name in settings_fields:
            current_value = self._normalize_value_for_compare(self.settings.get(field_name))
            checkpoint_value = self._normalize_value_for_compare(checkpoint_settings.get(field_name))
            if current_value != checkpoint_value:
                mismatches.append(f'settings.{field_name}: current={current_value!r}, checkpoint={checkpoint_value!r}')

        if mismatches:
            raise ValueError('Checkpoint is incompatible with current trainer configuration:\n' + '\n'.join(mismatches))

    def _load_population_checkpoint(self, checkpoint_path_str: str):
        checkpoint_path = self._resolve_project_path(checkpoint_path_str)
        meta_path = checkpoint_path / 'checkpoint_meta.json'
        if not meta_path.exists():
            raise FileNotFoundError(f'Checkpoint metadata not found: {meta_path}')

        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        self._validate_resume_compatibility(meta)

        self.seed = int(meta['seed'])
        self.settings = meta.get('settingsSnapshot', dict(default_settings))
        population_dir = checkpoint_path / 'population'
        population_manifest = meta.get('populationManifest', [])
        if not population_manifest:
            raise ValueError(f'Checkpoint population manifest is empty: {meta_path}')

        individuals = [load_snake(str(population_dir), individual_name, settings=self.settings) for individual_name in population_manifest]
        self.population = Population(individuals)
        self.current_generation = int(meta['generation'])
        self.best_so_far = None

        best_so_far_path = meta.get('bestSoFarPath')
        best_so_far_state = meta.get('bestSoFarState')
        if best_so_far_path:
            best_path_parts = Path(best_so_far_path).parts
            if len(best_path_parts) < 2:
                raise ValueError(f'Invalid bestSoFarPath in checkpoint metadata: {best_so_far_path}')
            best_root = checkpoint_path / best_path_parts[0]
            best_individual_name = best_path_parts[1]
            self.best_so_far = load_snake(str(best_root), best_individual_name, settings=self.settings)
            if best_so_far_state:
                self.best_so_far._fitness = float(best_so_far_state.get('fitness', 0.0))
                if best_so_far_state.get('evaluationSummary') is not None:
                    self.best_so_far.evaluation_summary = best_so_far_state['evaluationSummary']

        random.setstate(self._decode_state(meta['pythonRandomState']))
        np.random.set_state(self._decode_state(meta['numpyRandomState']))
        self._rng = random.Random()
        self._rng.setstate(self._decode_state(meta['trainerRandomState']))
        print(
            f'[snake_nn.headless_train] 已从 checkpoint 恢复训练：{checkpoint_path} | '
            f'generation={self.current_generation} | population={len(self.population.individuals)}'
        )

    def train(self):
        while self.current_generation < self.config.generations:
            self.evaluate_population()
            current_best = max(self.population.individuals, key=lambda individual: individual.fitness)
            if self.best_so_far is None or current_best.fitness > self.best_so_far.fitness:
                self.best_so_far = current_best
            summary = current_best.evaluation_summary
            population_size = len(self.population.individuals)
            print(
                f'第 {self.current_generation} 代 | 种群规模={population_size} | 最佳选择分={current_best.fitness:.2f} | '
                f'平均原始适应度={summary["avgFitness"]:.2f} | 平均苹果数={summary["avgScore"]:.2f} | '
                f'平均存活步数={summary["avgFrames"]:.2f} | 平均生存比例={summary["avgSurvivalRatio"]:.2f}'
            )

            generation_metadata = self._build_metadata(current_best)
            generation_metadata['generationCheckpointType'] = 'generation-best'
            self._write_checkpoint(current_best, generation_metadata, 'best.json')

            best_so_far_metadata = self._build_metadata(self.best_so_far)
            best_so_far_metadata['generationCheckpointType'] = 'best-so-far'
            self._write_checkpoint(self.best_so_far, best_so_far_metadata, 'best-so-far.json')

            self.next_generation()
            if self._should_save_population_checkpoint():
                self._save_population_checkpoint()

        if self.best_so_far is None:
            raise ValueError('No best individual is available for export. Training did not evaluate any population.')

        export_dir = Path(self.config.export_dir)
        if not export_dir.is_absolute():
            export_dir = project_root / export_dir
        export_dir.mkdir(parents=True, exist_ok=True)
        export_path = export_dir / f'{self.config.export_name}.json'
        default_path = project_root / 'snake_models' / 'profiles' / f'{self.config.profile_id}.json'
        metadata = self._build_metadata(self.best_so_far)
        exported = write_browser_model(self.best_so_far, self.settings, metadata, export_path)
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
