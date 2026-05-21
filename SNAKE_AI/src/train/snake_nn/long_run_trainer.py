from __future__ import annotations

import json
import random
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from shutil import rmtree

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parents[3]
    src_root = Path(__file__).resolve().parents[2]
    for entry in (src_root, project_root):
        if str(entry) not in sys.path:
            sys.path.insert(0, str(entry))
else:
    project_root = Path(__file__).resolve().parents[3]

from train.snake_nn.evaluate_models import evaluate_models, write_evaluation_report
from train.snake_nn.paths import LONG_RUN_ROOT, resolve_project_path
from train.snake_nn.trainer import TrainingConfig, build_export_name, build_profile_config, train


@dataclass
class LongRunConfig:
    profile_id: str = 'pc'
    trial_generations: int = 300
    full_generations: int = 1000
    warmup_seed_count: int = 5
    keep_top_n: int = 10
    cleanup_interval_runs: int = 5
    trial_min_selection_ratio_vs_default: float = 0.75
    trial_min_selection_ratio_vs_topn_floor: float = 0.6
    trial_min_avg_score: float = 1.0
    trial_min_avg_frames: float = 50.0
    keep_non_topn_final_exports: bool = False
    parallel_evaluation_enabled: bool = False
    parallel_evaluation_workers: int | None = None
    log_dir: str = LONG_RUN_ROOT.as_posix()
    dry_run: bool = False


def _list_existing_seeds(export_dir: Path, checkpoint_dir: Path) -> set[int]:
    seeds = set()
    if export_dir.exists():
        for path in export_dir.glob('*.json'):
            parts = path.stem.split('-')
            if len(parts) >= 3 and parts[-2].isdigit():
                seeds.add(int(parts[-2]))
    if checkpoint_dir.exists():
        for path in checkpoint_dir.glob('*-latest'):
            prefix = path.name[:-7]
            if prefix.isdigit():
                seeds.add(int(prefix))
    return seeds


def generate_unique_seed(existing_seeds: set[int], rng: random.Random) -> int:
    while True:
        candidate = rng.randrange(1, 10_000_000)
        if candidate not in existing_seeds:
            return candidate


def _log_event(log_path: Path, event: str, profile_id: str, seed: int | None = None, **extra):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'event': event,
        'profileId': profile_id,
        'seed': seed,
        **extra,
    }
    with log_path.open('a', encoding='utf-8') as fp:
        fp.write(json.dumps(payload, ensure_ascii=False) + '\n')


def _build_long_run_log_path(config: LongRunConfig) -> Path:
    return resolve_project_path(f"{config.log_dir}/{config.profile_id}/run-log.jsonl")


def _build_run_config(base_config: TrainingConfig, *, seed: int, generations: int, promote_to_default: bool, resume_from_checkpoint: str | None = None) -> TrainingConfig:
    export_name = build_export_name(base_config.profile_id, generations, seed)
    return TrainingConfig(
        **{
            **asdict(base_config),
            'seed': seed,
            'generations': generations,
            'export_name': export_name,
            'promote_to_default': promote_to_default,
            'resume_from_checkpoint': resume_from_checkpoint,
        }
    )


def _evaluate_export(config: TrainingConfig, output_path: Path):
    reports = evaluate_models([output_path], config.board_size_pool, config.episodes_per_board, config.starvation_scale)
    return reports[0]


def _evaluate_default(config: TrainingConfig):
    default_path = resolve_project_path(config.default_model_path)
    if not default_path.exists():
        return None
    reports = evaluate_models([default_path], config.board_size_pool, config.episodes_per_board, config.starvation_scale)
    return reports[0]


def _load_ranked_exports(export_dir: Path, profile_id: str):
    candidates = []
    for path in sorted(export_dir.glob('*.json')):
        if path.name.endswith('.eval-report.json'):
            continue
        if path.name in {'best-of-batch.json', 'evaluation-report.json'}:
            continue
        report = evaluate_models([path], None, episodes_per_board=2, starvation_scale=1.0)[0]
        candidates.append({'path': path, 'report': report, 'profileId': profile_id})
    candidates.sort(key=lambda item: item['report']['avgSelectionScore'], reverse=True)
    return candidates


def _cleanup_non_topn(config: LongRunConfig, ranked_candidates, checkpoint_dir: Path, log_path: Path):
    keep_paths = {item['path'].resolve() for item in ranked_candidates[:config.keep_top_n]}
    keep_seeds = set()
    for item in ranked_candidates[:config.keep_top_n]:
        metadata = item['report']
        model_path = item['path']
        stem_parts = model_path.stem.split('-')
        if len(stem_parts) >= 3 and stem_parts[-2].isdigit():
            keep_seeds.add(int(stem_parts[-2]))

    for item in ranked_candidates[config.keep_top_n:]:
        path = item['path']
        stem_parts = path.stem.split('-')
        seed = int(stem_parts[-2]) if len(stem_parts) >= 3 and stem_parts[-2].isdigit() else None
        if not config.keep_non_topn_final_exports and path.exists():
            path.unlink()
            _log_event(log_path, 'cleanup_deleted_export', config.profile_id, seed=seed, path=str(path))
        if seed is not None:
            checkpoint_path = checkpoint_dir / f'{seed}-latest'
            if checkpoint_path.exists() and seed not in keep_seeds:
                rmtree(checkpoint_path)
                _log_event(log_path, 'cleanup_deleted_checkpoint', config.profile_id, seed=seed, path=str(checkpoint_path))


def _write_bulk_report(export_dir: Path, ranked_candidates):
    if not ranked_candidates:
        return None
    report_json_path = export_dir / 'evaluation-report.json'
    reports = [item['report'] for item in ranked_candidates]
    write_evaluation_report(report_json_path, reports)
    return report_json_path


def _trial_passes(config: LongRunConfig, trial_report, default_report, ranked_candidates):
    if trial_report['avgScore'] < config.trial_min_avg_score:
        return False, 'avgScore below threshold'
    if trial_report['avgFrames'] < config.trial_min_avg_frames:
        return False, 'avgFrames below threshold'
    if default_report:
        ratio = trial_report['avgSelectionScore'] / max(default_report['avgSelectionScore'], 1e-9)
        if ratio < config.trial_min_selection_ratio_vs_default:
            return False, 'selection ratio vs default below threshold'
    if ranked_candidates and len(ranked_candidates) >= config.keep_top_n:
        floor_score = ranked_candidates[min(config.keep_top_n, len(ranked_candidates)) - 1]['report']['avgSelectionScore']
        ratio = trial_report['avgSelectionScore'] / max(floor_score, 1e-9)
        if ratio < config.trial_min_selection_ratio_vs_topn_floor:
            return False, 'selection ratio vs top-N floor below threshold'
    return True, 'accepted'


def run_long_training(config: LongRunConfig):
    rng = random.Random()
    base_config = build_profile_config(TrainingConfig(), config.profile_id)
    base_config.parallel_evaluation_enabled = config.parallel_evaluation_enabled
    base_config.parallel_evaluation_workers = config.parallel_evaluation_workers
    export_dir = resolve_project_path(base_config.export_dir)
    checkpoint_dir = resolve_project_path(base_config.checkpoint_dir)
    log_path = _build_long_run_log_path(config)

    existing_seeds = _list_existing_seeds(export_dir, checkpoint_dir)
    ranked_candidates = _load_ranked_exports(export_dir, config.profile_id)
    generated_seed = generate_unique_seed(existing_seeds, rng)
    existing_seeds.add(generated_seed)
    _log_event(log_path, 'seed_generated', config.profile_id, seed=generated_seed)

    warmup_mode = len(ranked_candidates) < config.warmup_seed_count
    if warmup_mode:
        _log_event(log_path, 'full_train_started', config.profile_id, seed=generated_seed, reason='warmup')
        if not config.dry_run:
            full_config = _build_run_config(base_config, seed=generated_seed, generations=config.full_generations, promote_to_default=False)
            full_output = train(full_config)
            full_report = _evaluate_export(full_config, full_output)
        else:
            full_output = export_dir / f'dry-run-{generated_seed}.json'
            full_report = None
        _log_event(log_path, 'full_train_finished', config.profile_id, seed=generated_seed, output=str(full_output), report=full_report)
        ranked_candidates = _load_ranked_exports(export_dir, config.profile_id)
        _write_bulk_report(export_dir, ranked_candidates)
        return generated_seed

    trial_config = _build_run_config(base_config, seed=generated_seed, generations=config.trial_generations, promote_to_default=False)
    _log_event(log_path, 'trial_started', config.profile_id, seed=generated_seed, generations=config.trial_generations)
    if not config.dry_run:
        trial_output = train(trial_config)
        trial_report = _evaluate_export(trial_config, trial_output)
    else:
        trial_output = export_dir / f'dry-run-trial-{generated_seed}.json'
        trial_report = {'avgSelectionScore': 0.0, 'avgScore': 0.0, 'avgFrames': 0.0}
    _log_event(log_path, 'trial_finished', config.profile_id, seed=generated_seed, output=str(trial_output), report=trial_report)

    default_report = _evaluate_default(base_config)
    passes, reason = _trial_passes(config, trial_report, default_report, ranked_candidates)
    if not passes:
        checkpoint_path = checkpoint_dir / f'{generated_seed}-latest'
        if checkpoint_path.exists() and not config.dry_run:
            rmtree(checkpoint_path)
            _log_event(log_path, 'cleanup_deleted_checkpoint', config.profile_id, seed=generated_seed, path=str(checkpoint_path))
        if trial_output.exists() and not config.keep_non_topn_final_exports and not config.dry_run:
            trial_output.unlink()
            _log_event(log_path, 'cleanup_deleted_export', config.profile_id, seed=generated_seed, path=str(trial_output))
        _log_event(log_path, 'trial_rejected', config.profile_id, seed=generated_seed, reason=reason, report=trial_report)
        return generated_seed

    _log_event(log_path, 'full_train_started', config.profile_id, seed=generated_seed, reason='trial_passed')
    if not config.dry_run:
        full_config = _build_run_config(base_config, seed=generated_seed, generations=config.full_generations, promote_to_default=False, resume_from_checkpoint=f'artifacts/models/checkpoints/{config.profile_id}/{generated_seed}-latest')
        full_output = train(full_config)
        full_report = _evaluate_export(full_config, full_output)
    else:
        full_output = export_dir / f'dry-run-full-{generated_seed}.json'
        full_report = None
    _log_event(log_path, 'full_train_finished', config.profile_id, seed=generated_seed, output=str(full_output), report=full_report)

    ranked_candidates = _load_ranked_exports(export_dir, config.profile_id)
    _log_event(log_path, 'batch_evaluation_started', config.profile_id, seed=generated_seed, candidateCount=len(ranked_candidates))
    report_json_path = _write_bulk_report(export_dir, ranked_candidates)
    _log_event(log_path, 'batch_evaluation_finished', config.profile_id, seed=generated_seed, report=str(report_json_path) if report_json_path else None)

    if len(ranked_candidates) >= config.cleanup_interval_runs:
        _log_event(log_path, 'cleanup_started', config.profile_id, seed=generated_seed, keepTopN=config.keep_top_n)
        _cleanup_non_topn(config, ranked_candidates, checkpoint_dir, log_path)
        ranked_candidates = _load_ranked_exports(export_dir, config.profile_id)
        _write_bulk_report(export_dir, ranked_candidates)

    for item in ranked_candidates[:config.keep_top_n]:
        path = item['path']
        seed = None
        stem_parts = path.stem.split('-')
        if len(stem_parts) >= 3 and stem_parts[-2].isdigit():
            seed = int(stem_parts[-2])
        _log_event(log_path, 'retained_top_model', config.profile_id, seed=seed, path=str(path), selectionScore=item['report']['avgSelectionScore'])

    return generated_seed


def main():
    config = LongRunConfig()
    run_long_training(config)


if __name__ == '__main__':
    main()
