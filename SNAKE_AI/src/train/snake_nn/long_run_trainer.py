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

from train.snake_nn.evaluate_models import write_evaluation_report
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


def _local_timestamp_text():
    now = datetime.now()
    return f'{now.year % 100}.{now.month}.{now.day} - {now.hour:02d}：{now.minute:02d}'


def _format_float(value):
    if value is None:
        return '--'
    return f'{float(value):.2f}'


def _build_log_message(action: str, *, target: str | None = None, reason: str | None = None, result: str = '成功', details: str | None = None):
    headline = f'[{_local_timestamp_text()}]：{action}'
    if target:
        headline += f'{target}'
    if reason:
        headline += f'（由于{reason}）'
    parts = [headline]
    if details:
        parts.append(details)
    parts.append(f'操作结果：{result}')
    return '；'.join(parts)


def _log_event(
    log_path: Path,
    event: str,
    profile_id: str,
    seed: int | None = None,
    *,
    action: str | None = None,
    target: str | None = None,
    reason: str | None = None,
    result: str = 'success',
    details: str | None = None,
    **extra,
):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'timestampLocalText': _local_timestamp_text(),
        'event': event,
        'action': action or event,
        'profileId': profile_id,
        'seed': seed,
        'target': target,
        'reason': reason,
        'result': result,
        'details': details,
        'message': _build_log_message(action or event, target=target, reason=reason, result='成功' if result == 'success' else result, details=details),
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


def _history_entry_to_report(entry, *, seed: int, generation: int, profile_id: str, profile_label: str, path: Path | None = None):
    report_path = str(path) if path is not None else f'history://{profile_id}/{seed}/{generation}'
    return {
        'model': report_path,
        'avgSelectionScore': float(entry['bestSelectionScore']),
        'avgFitness': float(entry.get('bestAvgFitness', 0.0)),
        'avgScore': float(entry.get('bestAvgScore', 0.0)),
        'avgFrames': float(entry.get('bestAvgFrames', 0.0)),
        'avgSurvivalRatio': float(entry.get('bestAvgSurvivalRatio', 0.0)),
        'avgApproachAppleEvents': float(entry.get('bestAvgApproachAppleEvents', 0.0)),
        'avgRepeatCellCount': float(entry.get('bestAvgRepeatCellCount', 0.0)),
        'avgStallSteps': float(entry.get('bestAvgStallSteps', 0.0)),
        'fitnessStd': float(entry.get('bestFitnessStd', 0.0)),
        'selectionScoreStd': float(entry.get('bestSelectionScoreStd', 0.0)),
        'results': [],
        'historyEntry': entry,
        'seed': seed,
        'generation': generation,
        'profileId': profile_id,
        'profileLabel': profile_label,
    }


def _history_generation_map(history_path: Path):
    if not history_path.exists():
        return {}
    data = json.loads(history_path.read_text(encoding='utf-8'))
    return {int(item['generation']): item for item in data.get('history', [])}


def _load_history_snapshot(profile_id: str, seed: int, generation: int, *, checkpoint_dir: Path, export_dir: Path | None = None):
    checkpoint_path = checkpoint_dir / f'{seed}-latest'
    history_path = checkpoint_path / 'training-history.json'
    generation_map = _history_generation_map(history_path)
    entry = generation_map.get(int(generation))
    if entry is None:
        return None
    export_path = None
    if export_dir is not None:
        fallback_path = None
        for path in sorted(export_dir.glob(f'{profile_id}-*-{seed}-*.json')):
            if path.name.endswith('.eval-report.json') or path.name in {'best-of-batch.json', 'evaluation-report.json'}:
                continue
            metadata = json.loads(path.read_text(encoding='utf-8')).get('metadata', {})
            if int(metadata.get('generation', -1)) == int(generation):
                export_path = path
                break
            if fallback_path is None:
                fallback_path = path
        if export_path is None:
            export_path = fallback_path
    return {
        'seed': seed,
        'generation': int(generation),
        'historyEntry': entry,
        'checkpointPath': checkpoint_path,
        'historyPath': history_path,
        'exportPath': export_path,
        'report': _history_entry_to_report(
            entry,
            seed=seed,
            generation=int(generation),
            profile_id=profile_id,
            profile_label=entry.get('profileLabel', profile_id),
            path=export_path,
        ),
    }


def _load_default_history(config: TrainingConfig, generation: int, *, export_dir: Path):
    default_path = resolve_project_path(config.default_model_path)
    if not default_path.exists():
        return None
    metadata = json.loads(default_path.read_text(encoding='utf-8')).get('metadata', {})
    default_seed = metadata.get('seed')
    if default_seed is None:
        return None
    return _load_history_snapshot(config.profile_id, int(default_seed), generation, checkpoint_dir=resolve_project_path(config.checkpoint_dir), export_dir=export_dir)


def _scan_resumable_trial_checkpoints(checkpoint_dir: Path, profile_id: str, trial_generations: int):
    resumable = []
    if not checkpoint_dir.exists():
        return resumable
    for path in sorted(checkpoint_dir.glob('*-latest')):
        meta_path = path / 'checkpoint_meta.json'
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        seed = meta.get('seed')
        generation = int(meta.get('generation', -1))
        snapshot_profile = (meta.get('trainerConfigSnapshot') or {}).get('profile_id')
        if seed is None or snapshot_profile != profile_id:
            continue
        if generation >= trial_generations:
            continue
        resumable.append({
            'seed': int(seed),
            'generation': generation,
            'checkpointPath': path,
            'metaPath': meta_path,
            'meta': meta,
        })
    resumable.sort(key=lambda item: (item['generation'], item['seed']))
    return resumable


def _load_ranked_history_snapshots(export_dir: Path, checkpoint_dir: Path, profile_id: str, generation: int):
    candidates = []
    seen_seeds = set()
    if checkpoint_dir.exists():
        for path in sorted(checkpoint_dir.glob('*-latest')):
            prefix = path.name[:-7]
            if not prefix.isdigit():
                continue
            seed = int(prefix)
            snapshot = _load_history_snapshot(profile_id, seed, generation, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
            if snapshot is None:
                continue
            candidates.append(snapshot)
            seen_seeds.add(seed)
    if export_dir.exists():
        for path in sorted(export_dir.glob('*.json')):
            if path.name.endswith('.eval-report.json'):
                continue
            # 这里显式排除汇总文件，只把“真正可继续参与筛选的候选模型”算进长期训练池。
            if path.name in {'best-of-batch.json', 'evaluation-report.json'}:
                continue
            metadata = json.loads(path.read_text(encoding='utf-8')).get('metadata', {})
            seed = metadata.get('seed')
            if seed is None or int(seed) in seen_seeds:
                continue
            snapshot = _load_history_snapshot(profile_id, int(seed), generation, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
            if snapshot is None:
                continue
            candidates.append(snapshot)
            seen_seeds.add(int(seed))
    candidates.sort(key=lambda item: item['report']['avgSelectionScore'], reverse=True)
    return candidates


def _cleanup_non_topn(config: LongRunConfig, ranked_candidates, checkpoint_dir: Path, log_path: Path):
    keep_seeds = {int(item['seed']) for item in ranked_candidates[:config.keep_top_n]}

    for item in ranked_candidates[config.keep_top_n:]:
        seed = int(item['seed'])
        export_path = item.get('exportPath')
        if not config.keep_non_topn_final_exports and export_path is not None and export_path.exists():
            export_path.unlink()
            _log_event(log_path, 'cleanup_deleted_export', config.profile_id, seed=seed, action='回收导出模型', target=f'：{seed}', reason='非 top-N 候选模型被清理', details=f'导出文件：{export_path}', path=str(export_path))
        checkpoint_path = checkpoint_dir / f'{seed}-latest'
        if checkpoint_path.exists() and seed not in keep_seeds:
            rmtree(checkpoint_path)
            _log_event(log_path, 'cleanup_deleted_checkpoint', config.profile_id, seed=seed, action='回收checkpoint', target=f'：{seed}', reason='非 top-N 候选模型被清理', details=f'checkpoint目录：{checkpoint_path}', path=str(checkpoint_path))


def _write_bulk_report(export_dir: Path, ranked_candidates):
    if not ranked_candidates:
        return None
    report_json_path = export_dir / 'evaluation-report.json'
    reports = [item['report'] for item in ranked_candidates]
    write_evaluation_report(report_json_path, reports)
    return report_json_path


def _trial_passes(config: LongRunConfig, trial_report, default_report, ranked_candidates):
    if trial_report['avgScore'] < config.trial_min_avg_score:
        return False, {
            'code': '平均苹果数低于试训门槛',
            'message': '平均苹果数低于试训门槛',
            'trialAvgScore': trial_report['avgScore'],
            'requiredAvgScore': config.trial_min_avg_score,
        }
    if trial_report['avgFrames'] < config.trial_min_avg_frames:
        return False, {
            'code': '平均存活步数低于试训门槛',
            'message': '平均存活步数低于试训门槛',
            'trialAvgFrames': trial_report['avgFrames'],
            'requiredAvgFrames': config.trial_min_avg_frames,
        }
    if default_report:
        ratio = trial_report['avgSelectionScore'] / max(default_report['avgSelectionScore'], 1e-9)
        if ratio < config.trial_min_selection_ratio_vs_default:
            return False, {
                'code': '相对默认模型的选择分比例低于门槛',
                'message': '平均选择分低于默认模型要求',
                'trialAvgSelectionScore': trial_report['avgSelectionScore'],
                'defaultAvgSelectionScore': default_report['avgSelectionScore'],
                'ratio': ratio,
                'requiredRatio': config.trial_min_selection_ratio_vs_default,
            }
    if ranked_candidates and len(ranked_candidates) >= config.keep_top_n:
        floor_candidate = ranked_candidates[min(config.keep_top_n, len(ranked_candidates)) - 1]
        floor_score = floor_candidate['report']['avgSelectionScore']
        ratio = trial_report['avgSelectionScore'] / max(floor_score, 1e-9)
        if ratio < config.trial_min_selection_ratio_vs_topn_floor:
            return False, {
                'code': '相对历史候选地板的选择分比例低于门槛',
                'message': '平均选择分低于历史候选地板要求',
                'trialAvgSelectionScore': trial_report['avgSelectionScore'],
                'floorAvgSelectionScore': floor_score,
                'floorSeed': floor_candidate['seed'],
                'ratio': ratio,
                'requiredRatio': config.trial_min_selection_ratio_vs_topn_floor,
            }
    return True, {
        'code': '通过试训筛选',
        'message': '通过试训筛选',
        'trialAvgSelectionScore': trial_report['avgSelectionScore'],
        'trialAvgScore': trial_report['avgScore'],
        'trialAvgFrames': trial_report['avgFrames'],
    }


# 长期自动训练主流程：优先续训未完成 trial 的 checkpoint，清空 backlog 后才生成新 seed，再做 warmup / trial / full train / 排序 / 清理。
def run_long_training(config: LongRunConfig):
    rng = random.Random()
    base_config = build_profile_config(TrainingConfig(), config.profile_id)
    base_config.parallel_evaluation_enabled = config.parallel_evaluation_enabled
    base_config.parallel_evaluation_workers = config.parallel_evaluation_workers
    export_dir = resolve_project_path(base_config.export_dir)
    checkpoint_dir = resolve_project_path(base_config.checkpoint_dir)
    log_path = _build_long_run_log_path(config)

    while True:
        resumable_checkpoints = _scan_resumable_trial_checkpoints(checkpoint_dir, config.profile_id, config.trial_generations)
        if resumable_checkpoints:
            resumable = resumable_checkpoints[0]
            resumed_seed = int(resumable['seed'])
            resumed_generation = int(resumable['generation'])
            ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.trial_generations)
            _log_event(
                log_path,
                'resume_trial_checkpoint',
                config.profile_id,
                seed=resumed_seed,
                action='恢复试训checkpoint',
                target=f'：{resumed_seed}',
                reason='发现未完成试训的checkpoint，优先续训而不是创建新seed',
                details=f'checkpoint目录：{resumable["checkpointPath"]}；当前代数：{resumed_generation}；试训目标代数：{config.trial_generations}；当前待续训checkpoint数量：{len(resumable_checkpoints)}',
                checkpointPath=str(resumable['checkpointPath']),
                checkpointGeneration=resumed_generation,
                pendingCheckpointCount=len(resumable_checkpoints),
            )
            trial_config = _build_run_config(
                base_config,
                seed=resumed_seed,
                generations=config.trial_generations,
                promote_to_default=False,
                resume_from_checkpoint=str(resumable['checkpointPath']),
            )
            _log_event(log_path, 'trial_started', config.profile_id, seed=resumed_seed, action='开始试训', target=f'：{resumed_seed}', reason='从未完成试训的checkpoint恢复执行', details=f'试训代数：{config.trial_generations}；checkpoint当前代数：{resumed_generation}；可比较历史候选数：{len(ranked_candidates)}', generations=config.trial_generations)
            if not config.dry_run:
                trial_output = train(trial_config)
                trial_snapshot = _load_history_snapshot(config.profile_id, resumed_seed, config.trial_generations, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
                if trial_snapshot is None:
                    raise ValueError(f'Missing generation-matched history for resumed trial seed={resumed_seed} generation={config.trial_generations}')
                trial_report = trial_snapshot['report']
            else:
                trial_output = export_dir / f'dry-run-trial-{resumed_seed}.json'
                trial_report = {'avgSelectionScore': 0.0, 'avgScore': 0.0, 'avgFrames': 0.0}
            _log_event(log_path, 'trial_finished', config.profile_id, seed=resumed_seed, action='完成试训', target=f'：{resumed_seed}', reason='checkpoint恢复后的trial阶段结束，准备进入历史候选比较', details=f'输出模型：{trial_output}；对比代数：{config.trial_generations}；平均选择分：{_format_float(trial_report["avgSelectionScore"])}；平均苹果数：{_format_float(trial_report["avgScore"])}；平均存活步数：{_format_float(trial_report["avgFrames"])}', output=str(trial_output), report=trial_report)

            default_snapshot = _load_default_history(base_config, config.trial_generations, export_dir=export_dir)
            default_report = default_snapshot['report'] if default_snapshot else None
            passes, reason_info = _trial_passes(config, trial_report, default_report, ranked_candidates)
            if not passes:
                checkpoint_path = checkpoint_dir / f'{resumed_seed}-latest'
                if checkpoint_path.exists() and not config.dry_run:
                    rmtree(checkpoint_path)
                    _log_event(log_path, 'cleanup_deleted_checkpoint', config.profile_id, seed=resumed_seed, action='回收checkpoint', target=f'：{resumed_seed}', reason='trial未通过，回收该seed的checkpoint', details=f'checkpoint目录：{checkpoint_path}', path=str(checkpoint_path))
                if trial_output.exists() and not config.keep_non_topn_final_exports and not config.dry_run:
                    trial_output.unlink()
                    _log_event(log_path, 'cleanup_deleted_export', config.profile_id, seed=resumed_seed, action='回收导出模型', target=f'：{resumed_seed}', reason='trial未通过，删除该seed的导出模型', details=f'导出文件：{trial_output}', path=str(trial_output))
                _log_event(log_path, 'trial_rejected', config.profile_id, seed=resumed_seed, action='回收seed', target=f'：{resumed_seed}', reason=reason_info['message'], details=(
                    f'试训代数：{config.trial_generations}；'
                    f'该seed平均选择分：{_format_float(reason_info.get("trialAvgSelectionScore", trial_report.get("avgSelectionScore")))}；'
                    f'该seed平均苹果数：{_format_float(reason_info.get("trialAvgScore", trial_report.get("avgScore")))}；'
                    f'该seed平均存活步数：{_format_float(reason_info.get("trialAvgFrames", trial_report.get("avgFrames")))}；'
                    f'默认模型平均选择分：{_format_float(reason_info.get("defaultAvgSelectionScore"))}；'
                    f'历史候选地板seed：{reason_info.get("floorSeed", "--")}；'
                    f'历史候选地板平均选择分：{_format_float(reason_info.get("floorAvgSelectionScore"))}；'
                    f'当前比例：{_format_float(reason_info.get("ratio"))}；'
                    f'要求比例：{_format_float(reason_info.get("requiredRatio"))}；'
                    f'要求最低平均苹果数：{_format_float(reason_info.get("requiredAvgScore"))}；'
                    f'要求最低平均存活步数：{_format_float(reason_info.get("requiredAvgFrames"))}'
                ), report=trial_report, reasonInfo=reason_info)
                continue

            _log_event(log_path, 'full_train_started', config.profile_id, seed=resumed_seed, action='开始完整训练', target=f'：{resumed_seed}', reason='trial通过，继续从trial checkpoint跑到完整代数', details=f'目标完整代数：{config.full_generations}；试训平均选择分：{_format_float(trial_report["avgSelectionScore"])}；试训平均苹果数：{_format_float(trial_report["avgScore"])}；试训平均存活步数：{_format_float(trial_report["avgFrames"])}')
            if not config.dry_run:
                full_config = _build_run_config(base_config, seed=resumed_seed, generations=config.full_generations, promote_to_default=False, resume_from_checkpoint=str(resumable['checkpointPath']))
                full_output = train(full_config)
                full_snapshot = _load_history_snapshot(config.profile_id, resumed_seed, config.full_generations, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
                if full_snapshot is None:
                    raise ValueError(f'Missing generation-matched history for resumed full-train seed={resumed_seed} generation={config.full_generations}')
                full_report = full_snapshot['report']
            else:
                full_output = export_dir / f'dry-run-full-{resumed_seed}.json'
                full_report = None
            _log_event(log_path, 'full_train_finished', config.profile_id, seed=resumed_seed, action='完成完整训练', target=f'：{resumed_seed}', reason='full train阶段结束，准备重新进入全量历史候选池排序', details=f'输出模型：{full_output}；对比代数：{config.full_generations}；平均选择分：{_format_float(full_report["avgSelectionScore"]) if full_report else "--"}；平均苹果数：{_format_float(full_report["avgScore"]) if full_report else "--"}；平均存活步数：{_format_float(full_report["avgFrames"]) if full_report else "--"}', output=str(full_output), report=full_report)

            ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.full_generations)
            _log_event(log_path, 'batch_evaluation_started', config.profile_id, seed=resumed_seed, action='开始重排历史候选池', target=f'：{config.profile_id}', reason='full train完成后，重新加载 full_generations 上的历史候选并生成汇总报告', details=f'可比较候选数：{len(ranked_candidates)}；对比代数：{config.full_generations}', candidateCount=len(ranked_candidates))
            report_json_path = _write_bulk_report(export_dir, ranked_candidates)
            _log_event(log_path, 'batch_evaluation_finished', config.profile_id, seed=resumed_seed, action='完成历史候选池重排', target=f'：{config.profile_id}', reason='full_generations历史候选汇总报告已生成', details=f'报告文件：{report_json_path if report_json_path else "--"}；候选数：{len(ranked_candidates)}', report=str(report_json_path) if report_json_path else None)

            if len(ranked_candidates) >= config.cleanup_interval_runs:
                _log_event(log_path, 'cleanup_started', config.profile_id, seed=resumed_seed, action='开始清理弱模型', target=f'：{config.profile_id}', reason='可比较候选池规模达到清理阈值', details=f'候选数：{len(ranked_candidates)}；清理阈值：{config.cleanup_interval_runs}；保留topN：{config.keep_top_n}', keepTopN=config.keep_top_n)
                _cleanup_non_topn(config, ranked_candidates, checkpoint_dir, log_path)
                ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.full_generations)
                _write_bulk_report(export_dir, ranked_candidates)

            for item in ranked_candidates[:config.keep_top_n]:
                export_path = item.get('exportPath') or item['checkpointPath']
                _log_event(log_path, 'retained_top_model', config.profile_id, seed=int(item['seed']), action='保留top模型', target=f'：{int(item["seed"])}', reason='进入当前full_generations历史候选池前列，保留为长期候选', details=f'文件路径：{export_path}；平均选择分：{_format_float(item["report"]["avgSelectionScore"])}；平均苹果数：{_format_float(item["report"]["avgScore"])}；平均存活步数：{_format_float(item["report"]["avgFrames"])}', path=str(export_path), selectionScore=item['report']['avgSelectionScore'])
            continue

        _log_event(log_path, 'resume_backlog_cleared', config.profile_id, action='未完成试训checkpoint已清空', target=f'：{config.profile_id}', reason='当前目录中已没有代数小于试训目标的checkpoint，允许进入新seed创建阶段', details=f'试训目标代数：{config.trial_generations}')
        break

    existing_seeds = _list_existing_seeds(export_dir, checkpoint_dir)
    ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.trial_generations)
    generated_seed = generate_unique_seed(existing_seeds, rng)
    existing_seeds.add(generated_seed)
    _log_event(log_path, 'seed_generated', config.profile_id, seed=generated_seed, action='生成新seed', target=f'：{generated_seed}', reason='未发现待续训checkpoint，创建新seed进入长期训练流程', details=f'当前已知历史seed池数量：{len(existing_seeds) - 1}')

    warmup_mode = len(ranked_candidates) < config.warmup_seed_count
    if warmup_mode:
        _log_event(log_path, 'full_train_started', config.profile_id, seed=generated_seed, action='开始完整训练', target=f'：{generated_seed}', reason='进入warmup模式：可比较历史模型数量不足', details=f'可比较历史候选数：{len(ranked_candidates)}；warmup阈值：{config.warmup_seed_count}；目标代数：{config.full_generations}')
        if not config.dry_run:
            full_config = _build_run_config(base_config, seed=generated_seed, generations=config.full_generations, promote_to_default=False)
            full_output = train(full_config)
            full_snapshot = _load_history_snapshot(config.profile_id, generated_seed, config.full_generations, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
            if full_snapshot is None:
                raise ValueError(f'Missing generation-matched history for warmup seed={generated_seed} generation={config.full_generations}')
            full_report = full_snapshot['report']
        else:
            full_output = export_dir / f'dry-run-{generated_seed}.json'
            full_report = None
        _log_event(log_path, 'full_train_finished', config.profile_id, seed=generated_seed, action='完成完整训练', target=f'：{generated_seed}', reason='warmup阶段完整训练结束', details=f'输出模型：{full_output}；对比代数：{config.full_generations}；平均选择分：{_format_float(full_report["avgSelectionScore"]) if full_report else "--"}；平均苹果数：{_format_float(full_report["avgScore"]) if full_report else "--"}；平均存活步数：{_format_float(full_report["avgFrames"])}' if full_report else f'输出模型：{full_output}；对比代数：{config.full_generations}；平均选择分：--；平均苹果数：--；平均存活步数：--', output=str(full_output), report=full_report)
        ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.full_generations)
        _write_bulk_report(export_dir, ranked_candidates)
        return generated_seed

    trial_config = _build_run_config(base_config, seed=generated_seed, generations=config.trial_generations, promote_to_default=False)
    _log_event(log_path, 'trial_started', config.profile_id, seed=generated_seed, action='开始试训', target=f'：{generated_seed}', reason='可比较历史模型数量已达到warmup阈值，进入trial筛选', details=f'试训代数：{config.trial_generations}；可比较历史候选数：{len(ranked_candidates)}；warmup阈值：{config.warmup_seed_count}', generations=config.trial_generations)
    if not config.dry_run:
        trial_output = train(trial_config)
        trial_snapshot = _load_history_snapshot(config.profile_id, generated_seed, config.trial_generations, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
        if trial_snapshot is None:
            raise ValueError(f'Missing generation-matched history for trial seed={generated_seed} generation={config.trial_generations}')
        trial_report = trial_snapshot['report']
    else:
        trial_output = export_dir / f'dry-run-trial-{generated_seed}.json'
        trial_report = {'avgSelectionScore': 0.0, 'avgScore': 0.0, 'avgFrames': 0.0}
    _log_event(log_path, 'trial_finished', config.profile_id, seed=generated_seed, action='完成试训', target=f'：{generated_seed}', reason='trial阶段训练结束，准备进入历史候选比较', details=f'输出模型：{trial_output}；对比代数：{config.trial_generations}；平均选择分：{_format_float(trial_report["avgSelectionScore"])}；平均苹果数：{_format_float(trial_report["avgScore"])}；平均存活步数：{_format_float(trial_report["avgFrames"])}', output=str(trial_output), report=trial_report)

    default_snapshot = _load_default_history(base_config, config.trial_generations, export_dir=export_dir)
    default_report = default_snapshot['report'] if default_snapshot else None
    passes, reason_info = _trial_passes(config, trial_report, default_report, ranked_candidates)
    if not passes:
        checkpoint_path = checkpoint_dir / f'{generated_seed}-latest'
        if checkpoint_path.exists() and not config.dry_run:
            rmtree(checkpoint_path)
            _log_event(log_path, 'cleanup_deleted_checkpoint', config.profile_id, seed=generated_seed, action='回收checkpoint', target=f'：{generated_seed}', reason='trial未通过，回收该seed的checkpoint', details=f'checkpoint目录：{checkpoint_path}', path=str(checkpoint_path))
        if trial_output.exists() and not config.keep_non_topn_final_exports and not config.dry_run:
            trial_output.unlink()
            _log_event(log_path, 'cleanup_deleted_export', config.profile_id, seed=generated_seed, action='回收导出模型', target=f'：{generated_seed}', reason='trial未通过，删除该seed的导出模型', details=f'导出文件：{trial_output}', path=str(trial_output))
        _log_event(log_path, 'trial_rejected', config.profile_id, seed=generated_seed, action='回收seed', target=f'：{generated_seed}', reason=reason_info['message'], details=(
            f'试训代数：{config.trial_generations}；'
            f'该seed平均选择分：{_format_float(reason_info.get("trialAvgSelectionScore", trial_report.get("avgSelectionScore")))}；'
            f'该seed平均苹果数：{_format_float(reason_info.get("trialAvgScore", trial_report.get("avgScore")))}；'
            f'该seed平均存活步数：{_format_float(reason_info.get("trialAvgFrames", trial_report.get("avgFrames")))}；'
            f'默认模型平均选择分：{_format_float(reason_info.get("defaultAvgSelectionScore"))}；'
            f'历史候选地板seed：{reason_info.get("floorSeed", "--")}；'
            f'历史候选地板平均选择分：{_format_float(reason_info.get("floorAvgSelectionScore"))}；'
            f'当前比例：{_format_float(reason_info.get("ratio"))}；'
            f'要求比例：{_format_float(reason_info.get("requiredRatio"))}；'
            f'要求最低平均苹果数：{_format_float(reason_info.get("requiredAvgScore"))}；'
            f'要求最低平均存活步数：{_format_float(reason_info.get("requiredAvgFrames"))}'
        ), report=trial_report, reasonInfo=reason_info)
        return generated_seed

    _log_event(log_path, 'full_train_started', config.profile_id, seed=generated_seed, action='开始完整训练', target=f'：{generated_seed}', reason='trial通过，继续从trial checkpoint跑到完整代数', details=f'目标完整代数：{config.full_generations}；试训平均选择分：{_format_float(trial_report["avgSelectionScore"])}；试训平均苹果数：{_format_float(trial_report["avgScore"])}；试训平均存活步数：{_format_float(trial_report["avgFrames"])}')
    if not config.dry_run:
        full_config = _build_run_config(base_config, seed=generated_seed, generations=config.full_generations, promote_to_default=False, resume_from_checkpoint=f'artifacts/models/checkpoints/{config.profile_id}/{generated_seed}-latest')
        full_output = train(full_config)
        full_snapshot = _load_history_snapshot(config.profile_id, generated_seed, config.full_generations, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
        if full_snapshot is None:
            raise ValueError(f'Missing generation-matched history for full-train seed={generated_seed} generation={config.full_generations}')
        full_report = full_snapshot['report']
    else:
        full_output = export_dir / f'dry-run-full-{generated_seed}.json'
        full_report = None
    _log_event(log_path, 'full_train_finished', config.profile_id, seed=generated_seed, action='完成完整训练', target=f'：{generated_seed}', reason='full train阶段结束，准备重新进入全量历史候选池排序', details=f'输出模型：{full_output}；对比代数：{config.full_generations}；平均选择分：{_format_float(full_report["avgSelectionScore"]) if full_report else "--"}；平均苹果数：{_format_float(full_report["avgScore"]) if full_report else "--"}；平均存活步数：{_format_float(full_report["avgFrames"])}' if full_report else f'输出模型：{full_output}；对比代数：{config.full_generations}；平均选择分：--；平均苹果数：--；平均存活步数：--', output=str(full_output), report=full_report)

    ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.full_generations)
    _log_event(log_path, 'batch_evaluation_started', config.profile_id, seed=generated_seed, action='开始重排历史候选池', target=f'：{config.profile_id}', reason='full train完成后，重新加载 full_generations 上的历史候选并生成汇总报告', details=f'可比较候选数：{len(ranked_candidates)}；对比代数：{config.full_generations}', candidateCount=len(ranked_candidates))
    report_json_path = _write_bulk_report(export_dir, ranked_candidates)
    _log_event(log_path, 'batch_evaluation_finished', config.profile_id, seed=generated_seed, action='完成历史候选池重排', target=f'：{config.profile_id}', reason='full_generations历史候选汇总报告已生成', details=f'报告文件：{report_json_path if report_json_path else "--"}；候选数：{len(ranked_candidates)}', report=str(report_json_path) if report_json_path else None)

    if len(ranked_candidates) >= config.cleanup_interval_runs:
        _log_event(log_path, 'cleanup_started', config.profile_id, seed=generated_seed, action='开始清理弱模型', target=f'：{config.profile_id}', reason='可比较候选池规模达到清理阈值', details=f'候选数：{len(ranked_candidates)}；清理阈值：{config.cleanup_interval_runs}；保留topN：{config.keep_top_n}', keepTopN=config.keep_top_n)
        _cleanup_non_topn(config, ranked_candidates, checkpoint_dir, log_path)
        ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, config.full_generations)
        _write_bulk_report(export_dir, ranked_candidates)

    for item in ranked_candidates[:config.keep_top_n]:
        export_path = item.get('exportPath') or item['checkpointPath']
        _log_event(log_path, 'retained_top_model', config.profile_id, seed=int(item['seed']), action='保留top模型', target=f'：{int(item["seed"])}', reason='进入当前full_generations历史候选池前列，保留为长期候选', details=f'文件路径：{export_path}；平均选择分：{_format_float(item["report"]["avgSelectionScore"])}；平均苹果数：{_format_float(item["report"]["avgScore"])}；平均存活步数：{_format_float(item["report"]["avgFrames"])}', path=str(export_path), selectionScore=item['report']['avgSelectionScore'])

    return generated_seed


def main():
    # 直接运行 long_run_trainer.py 时，默认读取 LongRunConfig 的当前参数并执行一轮长期训练调度。
    config = LongRunConfig()
    run_long_training(config)


if __name__ == '__main__':
    main()
