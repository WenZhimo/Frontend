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
# 长期自动训练入口使用的总配置：决定是先 warmup、先试训，还是触发清理与保留 top-N。
class LongRunConfig:
    # 当前长期训练针对的设备档位。会决定默认模型、候选模型目录、checkpoint 目录和棋盘尺寸池。
    profile_id: str = 'pc'
    # 试训阶段的训练代数。用于先低成本判断一个新 seed 有没有继续投入完整训练的价值。
    trial_generations: int = 300
    # 完整训练阶段的目标总代数上限。trial 通过后会从 trial checkpoint 继续跑到这里，而不是再额外加这么多代。
    full_generations: int = 1000
    # 候选池少于多少个模型时，直接进入 warmup 模式，不走试训筛选，优先把候选样本数量堆起来。
    warmup_seed_count: int = 5
    # 长期训练最终保留的 top-N 模型数量。清理阶段会优先围绕这个数量裁剪弱模型。
    keep_top_n: int = 10
    # 当候选池达到这个规模后，就触发一次清理检查。名字叫 interval，但当前逻辑本质上更像“候选池规模阈值”。
    cleanup_interval_runs: int = 5
    # 试训模型相对当前默认模型的最低选择分比例门槛。低于这个比例就不继续做完整训练。
    trial_min_selection_ratio_vs_default: float = 0.75
    # 试训模型相对当前 top-N 最后一名的最低选择分比例门槛，用来防止明显弱于现有候选池地板的 seed 继续浪费算力。
    trial_min_selection_ratio_vs_topn_floor: float = 0.6
    # 试训模型的最低平均苹果数门槛。用于筛掉虽然 selection score 还行，但吃苹果能力明显不足的模型。
    trial_min_avg_score: float = 1.0
    # 试训模型的最低平均存活步数门槛。用于筛掉过早死亡、稳定性太差的模型。
    trial_min_avg_frames: float = 50.0
    # 清理非 top-N 模型时，是否仍保留它们的最终导出 JSON。False 表示连导出一起删掉，只保留强模型。
    keep_non_topn_final_exports: bool = False
    # 是否在评估阶段启用多进程并行。只影响评估吞吐，不改变遗传算法本身的演化逻辑。
    parallel_evaluation_enabled: bool = False
    # 多进程评估 worker 数量。None 表示沿用下游训练器的自动决策；手动设值适合在固定机器上调吞吐。
    parallel_evaluation_workers: int | None = None
    # 长期训练日志根目录。运行事件最终会写到 <log_dir>/<profile_id>/run-log.jsonl。
    log_dir: str = LONG_RUN_ROOT.as_posix()
    # True 时只演练长期训练调度流程，不真正训练、不真正清理，用于 smoke test 和流程验证。
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
        # 这里显式排除汇总文件，只把“真正可继续参与筛选的候选模型”算进长期训练池。
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


# 长期自动训练主流程：扫描现有候选池 -> 生成新 seed -> warmup / trial / full train -> 重新排行 -> 可选清理。
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

    # 候选池还没堆起来时直接完整训练，优先把样本数量补足，再谈 trial 筛选。
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

    # 试训结束后，先拿当前默认模型和现有 top-N 地板做门槛判断，决定这个 seed 值不值得继续投入完整训练。
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

    # 候选池达到设定规模后，按 keep_top_n 清理弱模型与其 checkpoint，避免长期运行后目录无限膨胀。
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
    # 直接运行 long_run_trainer.py 时，默认读取 LongRunConfig 的当前参数并执行一轮长期训练调度。
    config = LongRunConfig()
    run_long_training(config)


if __name__ == '__main__':
    main()
