from __future__ import annotations

import json
import random
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from shutil import rmtree

from train.snake_nn.evaluate_models import write_evaluation_report
from train.snake_nn.headless_train import HeadlessTrainer, TrainerConfig
from train.snake_nn.vendor.chrispresso.population import Population
from train.snake_nn.vendor.chrispresso.snake import load_snake
from train.snake_nn.paths import LONG_RUN_ROOT, resolve_project_path
from train.snake_nn.trainer import TrainingConfig, build_export_name, build_profile_config, train

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parents[3]
    src_root = Path(__file__).resolve().parents[2]
    for entry in (src_root, project_root):
        if str(entry) not in sys.path:
            sys.path.insert(0, str(entry))
else:
    project_root = Path(__file__).resolve().parents[3]


@dataclass
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
    keep_top_n: int = 15
    # 当候选池达到这个规模后，就触发一次清理检查。名字叫 interval，但当前逻辑本质上更像“候选池规模阈值”。
    cleanup_interval_runs: int = 20
    # 试训模型相对当前默认模型的最低选择分比例门槛。低于这个比例就不继续做完整训练。
    trial_min_selection_ratio_vs_default: float = 0.8
    # 试训模型相对当前 top-N 最后一名的最低选择分比例门槛，用来防止明显弱于现有候选池地板的 seed 继续浪费算力。
    trial_min_selection_ratio_vs_topn_floor: float = 0.8
    # 试训模型的最低平均苹果数门槛。用于筛掉虽然 selection score 还行，但吃苹果能力明显不足的模型。
    trial_min_avg_score: float = 30.0
    # 试训模型的最低平均存活步数门槛。用于筛掉过早死亡、稳定性太差的模型。
    trial_min_avg_frames: float = 1800.0
    # 每代保留为父代的精英个体数量。
    num_parents: int = 120
    # 每代新生成的子代数量。
    num_offspring: int = 240
    # 每个个体抽样多少种棋盘尺寸做评估；固定棋盘时通常为 1。
    boards_per_individual: int = 1
    # 同一棋盘重复跑多少局，用于降低随机性。
    episodes_per_board: int = 4
    # 饥饿阈值缩放系数。越大越允许长时间不吃苹果仍继续存活。
    starvation_scale: float = 1.0
    # 苹果奖励权重。
    score_weight: float = 2500.0
    # 生存奖励权重。
    survival_weight: float = 100.0
    # 原始 fitness 在最终选择分中的保留权重。
    raw_fitness_weight: float = 0.1
    # 原始 fitness 截断上限。
    raw_fitness_cap: float = 300.0
    # 0 苹果惩罚。
    zero_score_penalty: float = 500.0
    # 接近苹果奖励权重。
    approach_apple_weight: float = 12.0
    # 重复踩格惩罚权重。
    repeat_cell_penalty: float = 3.0
    # 停滞惩罚权重。
    stall_penalty: float = 10.5
    # 是否在训练过程中自动把最终模型晋升为默认模型；长期训练通常保持 False。
    promote_to_default: bool = True
    # 是否启用整群 checkpoint。
    population_checkpoint_enabled: bool = True
    # 每隔多少代覆写一次整群 checkpoint；这控制的是 checkpoint 频率，不影响每代 history 写入。
    population_checkpoint_interval: int = 1
    # 恢复训练时是否严格校验 checkpoint 参数一致性。
    resume_strict: bool = True
    # 是否在评估阶段启用多进程并行。只影响评估吞吐，不改变遗传算法本身的演化逻辑。
    parallel_evaluation_enabled: bool = False
    # 多进程评估 worker 数量。None 表示沿用下游训练器的自动决策；手动设值适合在固定机器上调吞吐。
    parallel_evaluation_workers: int | None = None
    # 并行评估 map 的 chunksize。
    parallel_evaluation_chunksize: int = 1
    # 是否启用跨种群 hybrid 融合。
    hybrid_enabled: bool = True
    # full 阶段可比较历史 seed 至少达到多少个时，才允许触发 hybrid。
    hybrid_min_seed_pool: int = 20
    # 每次 hybrid 从前多少个 seed 中挑选来源种群，推荐 5~8。
    hybrid_top_seed_count: int = 6
    # hybrid 合并后的目标人口规模；为空时直接沿用 num_parents。
    hybrid_population_size: int | None = None
    # 每个来源种群内部的排名切段边界，例如 0.1/0.3/0.6/1.0 表示切成四段。
    hybrid_segment_boundaries: tuple[float, ...] = (0.1, 0.3, 0.6, 1.0)
    # 每个排名段的配额权重，默认把更多名额给头部，但仍保留中后段多样性。
    hybrid_segment_weights: tuple[float, ...] = (0.4, 0.3, 0.2, 0.1)
    # 若来源种群不兼容，是否允许跳过并继续向后补足来源 seed 数量。
    hybrid_skip_incompatible_sources: bool = True
    # 在一次 hybrid 之后，至少要新增多少个普通 seed，才允许下一次 hybrid，再次平衡探索与融合。
    hybrid_min_new_seeds_since_last: int = 3
    # 清理非 top-N 模型时，是否仍保留它们的最终导出 JSON。False 表示连导出一起删掉，只保留强模型。
    keep_non_topn_final_exports: bool = False
    # 长期训练日志根目录。运行事件最终会写到 <log_dir>/<profile_id>/run-log.jsonl。
    log_dir: str = LONG_RUN_ROOT.as_posix()
    # True 时只演练长期训练调度流程，不真正训练、不真正清理，用于 smoke test 和流程验证。
    dry_run: bool = False


# ---------- config helpers ----------

def _build_long_run_base_training_config(config: LongRunConfig) -> TrainingConfig:
    base = build_profile_config(TrainingConfig(), config.profile_id)
    base.num_parents = config.num_parents
    base.num_offspring = config.num_offspring
    base.boards_per_individual = config.boards_per_individual
    base.episodes_per_board = config.episodes_per_board
    base.starvation_scale = config.starvation_scale
    base.score_weight = config.score_weight
    base.survival_weight = config.survival_weight
    base.raw_fitness_weight = config.raw_fitness_weight
    base.raw_fitness_cap = config.raw_fitness_cap
    base.zero_score_penalty = config.zero_score_penalty
    base.approach_apple_weight = config.approach_apple_weight
    base.repeat_cell_penalty = config.repeat_cell_penalty
    base.stall_penalty = config.stall_penalty
    base.promote_to_default = config.promote_to_default
    base.population_checkpoint_enabled = config.population_checkpoint_enabled
    base.population_checkpoint_interval = config.population_checkpoint_interval
    base.resume_strict = config.resume_strict
    base.parallel_evaluation_enabled = config.parallel_evaluation_enabled
    base.parallel_evaluation_workers = config.parallel_evaluation_workers
    base.parallel_evaluation_chunksize = config.parallel_evaluation_chunksize
    return base


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


def _build_full_run_config(base_config: TrainingConfig, seed: int, *, resume_from_checkpoint: str | None = None) -> TrainingConfig:
    return _build_run_config(
        base_config,
        seed=seed,
        generations=base_config.generations,
        promote_to_default=False,
        resume_from_checkpoint=resume_from_checkpoint,
    )


def _evaluated_generation_for_target(target_generations: int) -> int:
    return max(0, int(target_generations) - 1)


def _trial_comparison_generation(config: LongRunConfig) -> int:
    return _evaluated_generation_for_target(config.trial_generations)


def _full_comparison_generation(config: LongRunConfig) -> int:
    return _evaluated_generation_for_target(config.full_generations)


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


# ---------- logging helpers ----------

def _local_timestamp_text() -> str:
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


def _load_long_run_events(log_path: Path):
    if not log_path.exists():
        return []
    events = []
    for line in log_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _new_seed_count_since_last_hybrid(log_path: Path) -> int:
    events = _load_long_run_events(log_path)
    last_hybrid_index = -1
    for index, event in enumerate(events):
        if event.get('event') == 'hybrid_started':
            last_hybrid_index = index
    if last_hybrid_index < 0:
        return 10**9
    return sum(1 for event in events[last_hybrid_index + 1:] if event.get('event') == 'seed_generated')


def _long_run_summary_path(log_path: Path) -> Path:
    return log_path.with_name('run-log-summary.html')


def build_long_run_report_payload(events):
    seeds = {}
    timeline = []
    retained = []
    for event in events:
        event_name = event.get('event')
        seed = event.get('seed')
        timeline.append({
            'timestamp': event.get('timestampLocalText') or event.get('timestamp'),
            'event': event_name,
            'message': event.get('message'),
        })
        if seed is not None:
            seed_entry = seeds.setdefault(str(seed), {
                'seed': seed,
                'profileId': event.get('profileId'),
                'events': [],
                'latestEvent': None,
                'report': None,
            })
            seed_entry['events'].append({
                'event': event_name,
                'message': event.get('message'),
                'reason': event.get('reason'),
                'details': event.get('details'),
            })
            seed_entry['latestEvent'] = event_name
            if event.get('report'):
                seed_entry['report'] = event['report']
        if event_name == 'retained_top_model':
            retained.append({
                'seed': seed,
                'selectionScore': event.get('selectionScore'),
                'path': event.get('path'),
            })

    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'totalEvents': len(events),
        'timeline': timeline,
        'seeds': sorted(seeds.values(), key=lambda item: int(item['seed'])),
        'retainedTopModels': retained,
        'latestHybridSkip': next((event for event in reversed(events) if event.get('event') == 'hybrid_skipped_cooldown'), None),
        'latestResumeSkip': next((event for event in reversed(events) if event.get('event') == 'resume_checkpoint_skipped'), None),
    }


def _build_seed_summary_block(seed_entry):
    recent_items = ''.join(
        f"<li>{event.get('message') or event.get('event') or '--'}</li>"
        for event in seed_entry['events'][-5:]
    ) or '<li>暂无最近事件</li>'
    report = seed_entry.get('report') or {}
    return (
        f"<div class='card'>"
        f"<h3>Seed {seed_entry['seed']}</h3>"
        f"<p>最新阶段：{seed_entry.get('latestEvent') or '--'}</p>"
        f"<p>最新报告选择分：{_format_float(report.get('avgSelectionScore'))}</p>"
        f"<ul>{recent_items}</ul>"
        f"</div>"
    )


def build_long_run_report_html(payload):
    timeline_items = ''.join(
        f"<li><strong>{item['timestamp']}</strong> · {item['message'] or item['event']}</li>"
        for item in payload['timeline'][-50:]
    ) or '<li>暂无事件</li>'
    seed_blocks = ''.join(_build_seed_summary_block(seed) for seed in payload['seeds']) or '<div class="card">暂无 seed 摘要</div>'
    retained_rows = ''.join(
        f"<tr><td>{item['seed']}</td><td>{_format_float(item['selectionScore'])}</td><td>{item['path'] or '--'}</td></tr>"
        for item in payload['retainedTopModels']
    ) or '<tr><td colspan="3">暂无保留模型</td></tr>'
    latest_hybrid_skip = payload['latestHybridSkip']
    latest_resume_skip = payload['latestResumeSkip']
    return f"""<!DOCTYPE html>
<html lang='zh-CN'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>长期训练日志摘要</title>
  <style>
    body {{ margin: 0; padding: 24px; background: #0b0f12; color: #d8d8d8; font-family: 'Segoe UI', system-ui, sans-serif; }}
    h1, h2, h3 {{ color: #c89a2e; }}
    .grid {{ display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }}
    .card {{ background: rgba(10,14,16,0.92); border: 1px solid rgba(200,154,46,0.16); padding: 16px; }}
    ul {{ line-height: 1.6; padding-left: 18px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ border-bottom: 1px solid rgba(255,255,255,0.08); padding: 8px 10px; text-align: left; }}
    .muted {{ color: #9aa7b0; }}
  </style>
</head>
<body>
  <h1>长期训练日志摘要</h1>
  <p class='muted'>生成时间：{payload['generatedAt']} ｜ 事件总数：{payload['totalEvents']}</p>
  <div class='grid'>
    <div class='card'>
      <h2>最近时间线</h2>
      <ul>{timeline_items}</ul>
    </div>
    <div class='card'>
      <h2>关键跳过原因</h2>
      <p><strong>最近 hybrid 跳过：</strong>{(latest_hybrid_skip or {}).get('message', '无')}</p>
      <p><strong>最近 checkpoint 跳过：</strong>{(latest_resume_skip or {}).get('message', '无')}</p>
    </div>
  </div>
  <h2>Seed 摘要</h2>
  <div class='grid'>{seed_blocks}</div>
  <h2>当前保留 Top 模型</h2>
  <table>
    <thead><tr><th>Seed</th><th>选择分</th><th>路径</th></tr></thead>
    <tbody>{retained_rows}</tbody>
  </table>
</body>
</html>"""


def write_long_run_report(log_path: Path):
    events = _load_long_run_events(log_path)
    payload = build_long_run_report_payload(events)
    summary_path = _long_run_summary_path(log_path)
    summary_path.write_text(build_long_run_report_html(payload), encoding='utf-8')
    return summary_path


def _log_trial_started(log_path: Path, profile_id: str, seed: int, target_generations: int, comparison_generation: int, reason: str, extra_details: str = ''):
    details = f'试训目标代数：{target_generations}；实际比较代数：{comparison_generation}'
    if extra_details:
        details += f'；{extra_details}'
    _log_event(log_path, 'trial_started', profile_id, seed=seed, action='开始试训', target=f'：{seed}', reason=reason, details=details, generations=target_generations)


def _log_full_started(log_path: Path, profile_id: str, seed: int, full_generations: int, trial_report, reason: str):
    _log_event(
        log_path,
        'full_train_started',
        profile_id,
        seed=seed,
        action='开始完整训练',
        target=f'：{seed}',
        reason=reason,
        details=f'目标完整代数：{full_generations}；试训平均选择分：{_format_float(trial_report["avgSelectionScore"])}；试训平均苹果数：{_format_float(trial_report["avgScore"])}；试训平均存活步数：{_format_float(trial_report["avgFrames"])}',
    )


def _log_full_finished(log_path: Path, profile_id: str, seed: int, full_generations: int, comparison_generation: int, output_path, full_report, reason: str):
    _log_event(
        log_path,
        'full_train_finished',
        profile_id,
        seed=seed,
        action='完成完整训练',
        target=f'：{seed}',
        reason=reason,
        details=f'输出模型：{output_path}；完整训练目标代数：{full_generations}；实际比较代数：{comparison_generation}；平均选择分：{_format_float(full_report["avgSelectionScore"]) if full_report else "--"}；平均苹果数：{_format_float(full_report["avgScore"]) if full_report else "--"}；平均存活步数：{_format_float(full_report["avgFrames"]) if full_report else "--"}',
        output=str(output_path),
        report=full_report,
    )


def _log_batch_rebuild_started(log_path: Path, profile_id: str, seed: int | None, candidate_count: int, full_generations: int, comparison_generation: int):
    _log_event(
        log_path,
        'batch_evaluation_started',
        profile_id,
        seed=seed,
        action='开始重排历史候选池',
        target=f'：{profile_id}',
        reason='full train完成后，重新加载 full_generations 上的历史候选并生成汇总报告',
        details=f'可比较候选数：{candidate_count}；完整训练目标代数：{full_generations}；实际比较代数：{comparison_generation}',
        candidateCount=candidate_count,
    )


def _log_batch_rebuild_finished(log_path: Path, profile_id: str, seed: int | None, report_json_path, candidate_count: int):
    _log_event(
        log_path,
        'batch_evaluation_finished',
        profile_id,
        seed=seed,
        action='完成历史候选池重排',
        target=f'：{profile_id}',
        reason='full_generations历史候选汇总报告已生成',
        details=f'报告文件：{report_json_path if report_json_path else "--"}；候选数：{candidate_count}',
        report=str(report_json_path) if report_json_path else None,
    )


# ---------- history / checkpoint helpers ----------

def _load_population_snapshot(checkpoint_path: Path):
    meta_path = checkpoint_path / 'checkpoint_meta.json'
    if not meta_path.exists():
        raise FileNotFoundError(f'Checkpoint metadata not found: {meta_path}')
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    settings = meta.get('settingsSnapshot') or {}
    population_manifest = meta.get('populationManifest') or []
    population_dir = checkpoint_path / 'population'
    individuals = [load_snake(str(population_dir), individual_name, settings=settings) for individual_name in population_manifest]
    return {
        'checkpointPath': checkpoint_path,
        'metaPath': meta_path,
        'meta': meta,
        'settings': settings,
        'trainerConfigSnapshot': meta.get('trainerConfigSnapshot') or {},
        'population': Population(individuals),
        'seed': int(meta['seed']),
        'generation': int(meta['generation']),
    }


def _population_compatibility_key(snapshot):
    trainer_config = snapshot['trainerConfigSnapshot']
    settings = snapshot['settings']
    return (
        trainer_config.get('profile_id'),
        tuple(settings.get('hidden_network_architecture') or []),
        settings.get('hidden_layer_activation'),
        settings.get('output_layer_activation'),
        settings.get('apple_and_self_vision'),
        settings.get('selection_type'),
        settings.get('crossover_selection_type'),
    )


def _is_population_snapshot_compatible(reference_snapshot, candidate_snapshot):
    return _population_compatibility_key(reference_snapshot) == _population_compatibility_key(candidate_snapshot)


def _history_generation_map(history_path: Path):
    if not history_path.exists():
        return {}
    data = json.loads(history_path.read_text(encoding='utf-8'))
    return {int(item['generation']): item for item in data.get('history', [])}


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


def _resume_compatibility_mismatches(base_config: TrainingConfig, meta: dict):
    checkpoint_config = meta.get('trainerConfigSnapshot', {})
    checkpoint_settings = meta.get('settingsSnapshot', {})
    config_fields = [
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

    def normalize(value):
        if isinstance(value, tuple):
            return [normalize(item) for item in value]
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, dict):
            return {key: normalize(item) for key, item in value.items()}
        return value

    settings_current = {
        'board_size': [base_config.board_size_pool[0][0], base_config.board_size_pool[0][1]] if base_config.board_size_pool else None,
        'hidden_layer_activation': 'relu',
        'output_layer_activation': 'sigmoid',
        'hidden_network_architecture': [20, 12],
        'mutation_rate': 0.05,
        'mutation_rate_type': 'static',
        'probability_gaussian': 1.0,
        'probability_random_uniform': 0.0,
        'SBX_eta': 100,
        'probability_SBX': 0.5,
        'SPBX_type': 'r',
        'probability_SPBX': 0.5,
        'crossover_selection_type': 'roulette_wheel',
        'num_parents': base_config.num_parents,
        'num_offspring': base_config.num_offspring,
        'selection_type': 'plus',
        'lifespan': float('inf'),
        'apple_and_self_vision': 'binary',
    }

    mismatches = []
    for field_name in config_fields:
        current_value = normalize(getattr(base_config, field_name))
        checkpoint_value = normalize(checkpoint_config.get(field_name))
        if current_value != checkpoint_value:
            mismatches.append(f'config.{field_name}: current={current_value!r}, checkpoint={checkpoint_value!r}')
    for field_name in settings_fields:
        current_value = normalize(settings_current.get(field_name))
        checkpoint_value = normalize(checkpoint_settings.get(field_name))
        if current_value != checkpoint_value:
            mismatches.append(f'settings.{field_name}: current={current_value!r}, checkpoint={checkpoint_value!r}')
    return mismatches


def _scan_resumable_trial_checkpoints(base_config: TrainingConfig, checkpoint_dir: Path, profile_id: str, trial_generations: int):
    resumable = []
    incompatible = []
    if not checkpoint_dir.exists():
        return resumable, incompatible
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
        mismatches = _resume_compatibility_mismatches(base_config, meta) if base_config.resume_strict else []
        item = {
            'seed': int(seed),
            'generation': generation,
            'checkpointPath': path,
            'metaPath': meta_path,
            'meta': meta,
            'mismatches': mismatches,
        }
        if mismatches:
            incompatible.append(item)
        else:
            resumable.append(item)
    resumable.sort(key=lambda item: (item['generation'], item['seed']))
    incompatible.sort(key=lambda item: (item['generation'], item['seed']))
    return resumable, incompatible


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


# ---------- hybrid helpers ----------

def _select_segmented_individuals(individuals, total_quota: int, boundaries: tuple[float, ...], weights: tuple[float, ...]):
    if total_quota <= 0 or not individuals:
        return []
    ranked = sorted(individuals, key=lambda individual: individual.fitness, reverse=True)
    total = len(ranked)
    segments = []
    start = 0
    for boundary in boundaries:
        end = max(start, min(total, int(round(total * boundary))))
        segments.append(ranked[start:end])
        start = end
    if start < total:
        if segments:
            segments[-1].extend(ranked[start:])
        else:
            segments.append(ranked[start:])

    raw_quotas = [total_quota * weight for weight in weights]
    quotas = [int(value) for value in raw_quotas]
    remainder = total_quota - sum(quotas)
    order = sorted(range(len(raw_quotas)), key=lambda idx: raw_quotas[idx] - quotas[idx], reverse=True)
    for idx in order[:remainder]:
        quotas[idx] += 1

    selected = []
    leftovers = []
    for segment, quota in zip(segments, quotas):
        take = min(len(segment), quota)
        selected.extend(segment[:take])
        leftovers.extend(segment[take:])
    if len(selected) < total_quota:
        selected.extend(leftovers[: total_quota - len(selected)])
    return selected[:total_quota]


def _build_hybrid_population(config: LongRunConfig, ranked_candidates, *, generation: int):
    if not config.hybrid_enabled:
        return None
    if len(ranked_candidates) < config.hybrid_min_seed_pool:
        return None

    target_population_size = config.hybrid_population_size or config.num_parents
    requested_source_count = max(1, config.hybrid_top_seed_count)
    compatible_snapshots = []
    incompatible_seeds = []
    reference_snapshot = None

    for item in ranked_candidates:
        snapshot = _load_population_snapshot(item['checkpointPath'])
        if reference_snapshot is None:
            reference_snapshot = snapshot
            compatible_snapshots.append(snapshot)
        elif _is_population_snapshot_compatible(reference_snapshot, snapshot):
            compatible_snapshots.append(snapshot)
        else:
            incompatible_seeds.append(snapshot['seed'])
            if not config.hybrid_skip_incompatible_sources:
                break
        if len(compatible_snapshots) >= requested_source_count:
            break

    if len(compatible_snapshots) < 2:
        return None

    source_count = len(compatible_snapshots)
    base_quota = target_population_size // source_count
    remainder = target_population_size % source_count
    allocations = [base_quota + (1 if index < remainder else 0) for index in range(source_count)]

    merged_individuals = []
    source_details = []
    for snapshot, quota in zip(compatible_snapshots, allocations):
        selected = _select_segmented_individuals(
            snapshot['population'].individuals,
            quota,
            config.hybrid_segment_boundaries,
            config.hybrid_segment_weights,
        )
        merged_individuals.extend(selected)
        source_details.append({
            'seed': snapshot['seed'],
            'checkpointPath': str(snapshot['checkpointPath']),
            'populationSize': snapshot['population'].num_individuals,
            'selectedCount': len(selected),
        })

    if len(merged_individuals) != target_population_size:
        return None

    return {
        'population': Population(merged_individuals),
        'sourceSeeds': [item['seed'] for item in source_details],
        'sourceDetails': source_details,
        'targetPopulationSize': target_population_size,
        'generation': generation,
        'segmentBoundaries': list(config.hybrid_segment_boundaries),
        'segmentWeights': list(config.hybrid_segment_weights),
        'sourceCount': source_count,
        'incompatibleSeeds': incompatible_seeds,
    }


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


# ---------- phase execution helpers ----------

def _trial_report_from_output(config: LongRunConfig, profile_id: str, seed: int, checkpoint_dir: Path, export_dir: Path, trial_output: Path, log_path: Path, reason: str, extra_details: str = ''):
    comparison_generation = _trial_comparison_generation(config)
    snapshot = _load_history_snapshot(profile_id, seed, comparison_generation, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
    if snapshot is None:
        raise ValueError(f'Missing generation-matched history for trial seed={seed} generation={comparison_generation} (target={config.trial_generations})')
    report = snapshot['report']
    details = f'输出模型：{trial_output}；试训目标代数：{config.trial_generations}；实际比较代数：{comparison_generation}；平均选择分：{_format_float(report["avgSelectionScore"])}；平均苹果数：{_format_float(report["avgScore"])}；平均存活步数：{_format_float(report["avgFrames"])}'
    if extra_details:
        details += f'；{extra_details}'
    _log_event(log_path, 'trial_finished', profile_id, seed=seed, action='完成试训', target=f'：{seed}', reason=reason, details=details, output=str(trial_output), report=report)
    return report


def _full_report_from_output(config: LongRunConfig, profile_id: str, seed: int, checkpoint_dir: Path, export_dir: Path, full_output: Path, log_path: Path, reason: str):
    comparison_generation = _full_comparison_generation(config)
    snapshot = _load_history_snapshot(profile_id, seed, comparison_generation, checkpoint_dir=checkpoint_dir, export_dir=export_dir)
    if snapshot is None:
        raise ValueError(f'Missing generation-matched history for full-train seed={seed} generation={comparison_generation} (target={config.full_generations})')
    report = snapshot['report']
    _log_full_finished(log_path, profile_id, seed, config.full_generations, comparison_generation, full_output, report, reason)
    return report


def _process_post_full_pool(log_path: Path, config: LongRunConfig, checkpoint_dir: Path, export_dir: Path, seed: int | None = None):
    comparison_generation = _full_comparison_generation(config)
    ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, comparison_generation)
    _log_batch_rebuild_started(log_path, config.profile_id, seed, len(ranked_candidates), config.full_generations, comparison_generation)
    report_json_path = _write_bulk_report(export_dir, ranked_candidates)
    _log_batch_rebuild_finished(log_path, config.profile_id, seed, report_json_path, len(ranked_candidates))
    if len(ranked_candidates) >= config.cleanup_interval_runs:
        _log_event(log_path, 'cleanup_started', config.profile_id, seed=seed, action='开始清理弱模型', target=f'：{config.profile_id}', reason='可比较候选池规模达到清理阈值', details=f'候选数：{len(ranked_candidates)}；清理阈值：{config.cleanup_interval_runs}；保留topN：{config.keep_top_n}', keepTopN=config.keep_top_n)
        _cleanup_non_topn(config, ranked_candidates, checkpoint_dir, log_path)
        ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, comparison_generation)
        _write_bulk_report(export_dir, ranked_candidates)
    for item in ranked_candidates[:config.keep_top_n]:
        export_path = item.get('exportPath') or item['checkpointPath']
        _log_event(log_path, 'retained_top_model', config.profile_id, seed=int(item['seed']), action='保留top模型', target=f'：{int(item["seed"])}', reason='进入当前full_generations历史候选池前列，保留为长期候选', details=f'文件路径：{export_path}；平均选择分：{_format_float(item["report"]["avgSelectionScore"])}；平均苹果数：{_format_float(item["report"]["avgScore"])}；平均存活步数：{_format_float(item["report"]["avgFrames"])}', path=str(export_path), selectionScore=item['report']['avgSelectionScore'])
    return ranked_candidates


def _resume_checkpoint_trial(base_config: TrainingConfig, config: LongRunConfig, checkpoint_dir: Path, export_dir: Path, log_path: Path, resumable):
    resumed_seed = int(resumable['seed'])
    resumed_generation = int(resumable['generation'])
    ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, _trial_comparison_generation(config))
    _log_event(
        log_path,
        'resume_trial_checkpoint',
        config.profile_id,
        seed=resumed_seed,
        action='恢复试训checkpoint',
        target=f'：{resumed_seed}',
        reason='发现未完成试训的checkpoint，优先续训而不是创建新seed',
        details=f'checkpoint目录：{resumable["checkpointPath"]}；当前代数：{resumed_generation}；试训目标代数：{config.trial_generations}；实际比较代数：{_trial_comparison_generation(config)}；当前待续训checkpoint数量：{len(_scan_resumable_trial_checkpoints(base_config, checkpoint_dir, config.profile_id, config.trial_generations))}',
        checkpointPath=str(resumable['checkpointPath']),
        checkpointGeneration=resumed_generation,
    )
    trial_config = _build_run_config(base_config, seed=resumed_seed, generations=config.trial_generations, promote_to_default=False, resume_from_checkpoint=str(resumable['checkpointPath']))
    _log_trial_started(log_path, config.profile_id, resumed_seed, config.trial_generations, _trial_comparison_generation(config), '从未完成试训的checkpoint恢复执行', f'checkpoint当前代数：{resumed_generation}；可比较历史候选数：{len(ranked_candidates)}')
    if not config.dry_run:
        trial_output = train(trial_config)
        trial_report = _trial_report_from_output(config, config.profile_id, resumed_seed, checkpoint_dir, export_dir, trial_output, log_path, 'checkpoint恢复后的trial阶段结束，准备进入历史候选比较')
    else:
        trial_output = export_dir / f'dry-run-trial-{resumed_seed}.json'
        trial_report = {'avgSelectionScore': 0.0, 'avgScore': 0.0, 'avgFrames': 0.0}
    default_snapshot = _load_default_history(base_config, _trial_comparison_generation(config), export_dir=export_dir)
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
            f'试训目标代数：{config.trial_generations}；'
            f'实际比较代数：{_trial_comparison_generation(config)}；'
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
        return True

    _log_full_started(log_path, config.profile_id, resumed_seed, config.full_generations, trial_report, 'trial通过，继续从trial checkpoint跑到完整代数')
    if not config.dry_run:
        full_config = _build_full_run_config(base_config, resumed_seed, resume_from_checkpoint=str(resumable['checkpointPath']))
        full_output = train(full_config)
        _full_report_from_output(config, config.profile_id, resumed_seed, checkpoint_dir, export_dir, full_output, log_path, 'full train阶段结束，准备重新进入全量历史候选池排序')
    _process_post_full_pool(log_path, config, checkpoint_dir, export_dir, resumed_seed)
    return True


def _process_resume_backlog(base_config: TrainingConfig, config: LongRunConfig, checkpoint_dir: Path, export_dir: Path, log_path: Path) -> bool:
    processed_any = False
    while True:
        resumable_checkpoints, incompatible_checkpoints = _scan_resumable_trial_checkpoints(base_config, checkpoint_dir, config.profile_id, config.trial_generations)
        for item in incompatible_checkpoints:
            _log_event(
                log_path,
                'resume_checkpoint_skipped',
                config.profile_id,
                seed=int(item['seed']),
                action='跳过不兼容checkpoint',
                target=f'：{int(item["seed"])}',
                reason='checkpoint 与当前长期训练参数不兼容，已跳过恢复',
                details=f'checkpoint目录：{item["checkpointPath"]}；当前代数：{item["generation"]}；不兼容项：{" | ".join(item["mismatches"][:5])}',
                checkpointPath=str(item['checkpointPath']),
                mismatchCount=len(item['mismatches']),
            )
        if not resumable_checkpoints:
            if processed_any or incompatible_checkpoints:
                _log_event(log_path, 'resume_backlog_cleared', config.profile_id, action='未完成试训checkpoint已清空', target=f'：{config.profile_id}', reason='当前目录中已没有可恢复的未完成试训checkpoint，允许进入下一个调度阶段', details=f'试训目标代数：{config.trial_generations}')
            return processed_any
        processed_any = True
        _resume_checkpoint_trial(base_config, config, checkpoint_dir, export_dir, log_path, resumable_checkpoints[0])


def _maybe_run_hybrid(base_config: TrainingConfig, config: LongRunConfig, checkpoint_dir: Path, export_dir: Path, log_path: Path, existing_seeds: set[int], rng: random.Random):
    new_seed_count = _new_seed_count_since_last_hybrid(log_path)
    if new_seed_count < config.hybrid_min_new_seeds_since_last:
        _log_event(
            log_path,
            'hybrid_skipped_cooldown',
            config.profile_id,
            action='跳过hybrid融合',
            target=f'：{config.profile_id}',
            reason='自上次hybrid以来新增seed数量不足，继续优先探索新seed',
            details=f'已新增seed数量：{new_seed_count}；要求最少新增seed数量：{config.hybrid_min_new_seeds_since_last}',
        )
        return None
    hybrid_candidate_pool = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, _full_comparison_generation(config))
    hybrid_bundle = _build_hybrid_population(config, hybrid_candidate_pool, generation=_full_comparison_generation(config))
    if hybrid_bundle is None:
        return None
    hybrid_seed = generate_unique_seed(existing_seeds, rng)
    _log_event(log_path, 'hybrid_started', config.profile_id, seed=hybrid_seed, action='开始hybrid融合训练', target=f'：{hybrid_seed}', reason='backlog已清空且历史候选池达到hybrid触发条件', details=f'来源seed={hybrid_bundle["sourceSeeds"]}；来源数量={hybrid_bundle["sourceCount"]}；目标人口={hybrid_bundle["targetPopulationSize"]}；对比代数={hybrid_bundle["generation"]}')
    _log_event(log_path, 'hybrid_population_built', config.profile_id, seed=hybrid_seed, action='构造hybrid人口', target=f'：{hybrid_seed}', reason='已按分段配额从多个来源seed的人口中取样合并', details=f'来源详情={hybrid_bundle["sourceDetails"]}；分段边界={hybrid_bundle["segmentBoundaries"]}；分段权重={hybrid_bundle["segmentWeights"]}')
    if not config.dry_run:
        hybrid_config = _build_full_run_config(base_config, hybrid_seed)
        trainer = HeadlessTrainer(
            TrainerConfig(
                seed=hybrid_config.seed,
                generations=hybrid_config.generations,
                num_parents=hybrid_config.num_parents,
                num_offspring=hybrid_config.num_offspring,
                board_size_pool=hybrid_config.board_size_pool,
                boards_per_individual=hybrid_config.boards_per_individual,
                episodes_per_board=hybrid_config.episodes_per_board,
                starvation_scale=hybrid_config.starvation_scale,
                score_weight=hybrid_config.score_weight,
                survival_weight=hybrid_config.survival_weight,
                raw_fitness_weight=hybrid_config.raw_fitness_weight,
                raw_fitness_cap=hybrid_config.raw_fitness_cap,
                zero_score_penalty=hybrid_config.zero_score_penalty,
                approach_apple_weight=hybrid_config.approach_apple_weight,
                repeat_cell_penalty=hybrid_config.repeat_cell_penalty,
                stall_penalty=hybrid_config.stall_penalty,
                export_name=hybrid_config.export_name,
                export_dir=hybrid_config.export_dir,
                profile_id=hybrid_config.profile_id,
                profile_label=hybrid_config.profile_label,
                checkpoint_dir=hybrid_config.checkpoint_dir,
                default_model_path=hybrid_config.default_model_path,
                promote_to_default=hybrid_config.promote_to_default,
                population_checkpoint_enabled=hybrid_config.population_checkpoint_enabled,
                population_checkpoint_interval=hybrid_config.population_checkpoint_interval,
                resume_from_checkpoint=hybrid_config.resume_from_checkpoint,
                resume_strict=hybrid_config.resume_strict,
                parallel_evaluation_enabled=hybrid_config.parallel_evaluation_enabled,
                parallel_evaluation_workers=hybrid_config.parallel_evaluation_workers,
                parallel_evaluation_chunksize=hybrid_config.parallel_evaluation_chunksize,
            ),
            initial_population=hybrid_bundle['population'],
        )
        hybrid_output = trainer.train()
        hybrid_report = _full_report_from_output(config, config.profile_id, hybrid_seed, checkpoint_dir, export_dir, hybrid_output, log_path, 'hybrid人口已完成训练并进入历史候选池')
    else:
        hybrid_output = export_dir / f'dry-run-hybrid-{hybrid_seed}.json'
        hybrid_report = None
    _log_event(log_path, 'hybrid_finished', config.profile_id, seed=hybrid_seed, action='完成hybrid融合训练', target=f'：{hybrid_seed}', reason='hybrid人口已完成训练并进入历史候选池', details=f'输出模型={hybrid_output}；来源seed={hybrid_bundle["sourceSeeds"]}；目标人口={hybrid_bundle["targetPopulationSize"]}；平均选择分={_format_float(hybrid_report["avgSelectionScore"]) if hybrid_report else "--"}', output=str(hybrid_output), report=hybrid_report)
    _process_post_full_pool(log_path, config, checkpoint_dir, export_dir, hybrid_seed)
    return hybrid_seed


def _run_new_seed_flow(base_config: TrainingConfig, config: LongRunConfig, checkpoint_dir: Path, export_dir: Path, log_path: Path, existing_seeds: set[int], rng: random.Random):
    ranked_candidates = _load_ranked_history_snapshots(export_dir, checkpoint_dir, config.profile_id, _trial_comparison_generation(config))
    generated_seed = generate_unique_seed(existing_seeds, rng)
    existing_seeds.add(generated_seed)
    _log_event(log_path, 'seed_generated', config.profile_id, seed=generated_seed, action='生成新seed', target=f'：{generated_seed}', reason='未发现待续训checkpoint，创建新seed进入长期训练流程', details=f'当前已知历史seed池数量：{len(existing_seeds) - 1}')

    warmup_mode = len(ranked_candidates) < config.warmup_seed_count
    if warmup_mode:
        _log_event(log_path, 'full_train_started', config.profile_id, seed=generated_seed, action='开始完整训练', target=f'：{generated_seed}', reason='进入warmup模式：可比较历史模型数量不足', details=f'可比较历史候选数：{len(ranked_candidates)}；warmup阈值：{config.warmup_seed_count}；目标代数：{config.full_generations}')
        if not config.dry_run:
            full_config = _build_full_run_config(base_config, generated_seed)
            full_output = train(full_config)
            _full_report_from_output(config, config.profile_id, generated_seed, checkpoint_dir, export_dir, full_output, log_path, 'warmup阶段完整训练结束')
        _process_post_full_pool(log_path, config, checkpoint_dir, export_dir, generated_seed)
        return generated_seed

    trial_config = _build_run_config(base_config, seed=generated_seed, generations=config.trial_generations, promote_to_default=False)
    _log_trial_started(log_path, config.profile_id, generated_seed, config.trial_generations, _trial_comparison_generation(config), '可比较历史模型数量已达到warmup阈值，进入trial筛选', f'可比较历史候选数：{len(ranked_candidates)}；warmup阈值：{config.warmup_seed_count}')
    if not config.dry_run:
        trial_output = train(trial_config)
        trial_report = _trial_report_from_output(config, config.profile_id, generated_seed, checkpoint_dir, export_dir, trial_output, log_path, 'trial阶段训练结束，准备进入历史候选比较')
    else:
        trial_output = export_dir / f'dry-run-trial-{generated_seed}.json'
        trial_report = {'avgSelectionScore': 0.0, 'avgScore': 0.0, 'avgFrames': 0.0}

    default_snapshot = _load_default_history(base_config, _trial_comparison_generation(config), export_dir=export_dir)
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
            f'试训目标代数：{config.trial_generations}；'
            f'实际比较代数：{_trial_comparison_generation(config)}；'
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

    _log_full_started(log_path, config.profile_id, generated_seed, config.full_generations, trial_report, 'trial通过，继续从trial checkpoint跑到完整代数')
    if not config.dry_run:
        full_config = _build_full_run_config(base_config, generated_seed, resume_from_checkpoint=f'artifacts/models/checkpoints/{config.profile_id}/{generated_seed}-latest')
        full_output = train(full_config)
        _full_report_from_output(config, config.profile_id, generated_seed, checkpoint_dir, export_dir, full_output, log_path, 'full train阶段结束，准备重新进入全量历史候选池排序')
    _process_post_full_pool(log_path, config, checkpoint_dir, export_dir, generated_seed)
    return generated_seed


def run_long_training(config: LongRunConfig):
    rng = random.Random()
    base_config = _build_long_run_base_training_config(config)
    export_dir = resolve_project_path(base_config.export_dir)
    checkpoint_dir = resolve_project_path(base_config.checkpoint_dir)
    log_path = _build_long_run_log_path(config)

    result_seed = None
    try:
        _process_resume_backlog(base_config, config, checkpoint_dir, export_dir, log_path)

        existing_seeds = _list_existing_seeds(export_dir, checkpoint_dir)
        hybrid_seed = _maybe_run_hybrid(base_config, config, checkpoint_dir, export_dir, log_path, existing_seeds, rng)
        if hybrid_seed is not None:
            result_seed = hybrid_seed
            return result_seed

        result_seed = _run_new_seed_flow(base_config, config, checkpoint_dir, export_dir, log_path, existing_seeds, rng)
        return result_seed
    finally:
        write_long_run_report(log_path)


def main():
    config = LongRunConfig()
    run_long_training(config)


if __name__ == '__main__':
    main()
