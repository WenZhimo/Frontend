from __future__ import annotations

import random
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path
from shutil import copyfile

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parents[3]
    src_root = Path(__file__).resolve().parents[2]
    for entry in (src_root, project_root):
        if str(entry) not in sys.path:
            sys.path.insert(0, str(entry))
else:
    project_root = Path(__file__).resolve().parents[3]

from train.snake_nn.evaluate_models import (
    build_episode_seed_schedule,
    compare_reports,
    evaluate_models,
    format_board_size_comparison,
    format_board_size_summary,
    format_comparison,
    format_summary,
    write_evaluation_report,
)
from train.snake_nn.headless_train import HeadlessTrainer, TrainerConfig
from train.snake_nn.paths import resolve_project_path
from train.snake_nn.profiles import DEVICE_BOARD_PROFILES
from train.snake_nn.scoring import (
    DEFAULT_APPROACH_APPLE_WEIGHT,
    DEFAULT_RAW_FITNESS_CAP,
    DEFAULT_RAW_FITNESS_WEIGHT,
    DEFAULT_REPEAT_CELL_PENALTY,
    DEFAULT_SCORE_WEIGHT,
    DEFAULT_STALL_PENALTY,
    DEFAULT_SURVIVAL_WEIGHT,
    DEFAULT_ZERO_SCORE_PENALTY,
)


# 当前手动训练的目标档位。这里决定本轮训练绑定哪一种棋盘尺寸、默认模型路径和导出目录。
ACTIVE_PROFILE = 'pc'
# 本轮要跑的随机种子列表。通常先放少量种子，比较不同初始随机性的训练上限。
SEED_BATCH = [23]


@dataclass
class TrainingConfig:
    seed: int = 7
    generations: int = 200
    num_parents: int = 200
    num_offspring: int = 400
    board_size_pool: list[tuple[int, int]] = field(default_factory=list)
    boards_per_individual: int = 1
    episodes_per_board: int = 4
    starvation_scale: float = 1.0
    score_weight: float = DEFAULT_SCORE_WEIGHT
    survival_weight: float = DEFAULT_SURVIVAL_WEIGHT
    raw_fitness_weight: float = DEFAULT_RAW_FITNESS_WEIGHT
    raw_fitness_cap: float = DEFAULT_RAW_FITNESS_CAP
    zero_score_penalty: float = DEFAULT_ZERO_SCORE_PENALTY
    approach_apple_weight: float = DEFAULT_APPROACH_APPLE_WEIGHT
    repeat_cell_penalty: float = DEFAULT_REPEAT_CELL_PENALTY
    stall_penalty: float = DEFAULT_STALL_PENALTY
    export_name: str = ''
    export_dir: str = ''
    default_model_path: str = ''
    profile_id: str = ''
    profile_label: str = ''
    checkpoint_dir: str = ''
    promote_to_default: bool = False
    population_checkpoint_enabled: bool = True
    population_checkpoint_interval: int = 5
    resume_from_checkpoint: str | None = None
    resume_strict: bool = True
    parallel_evaluation_enabled: bool = False
    parallel_evaluation_workers: int | None = None
    parallel_evaluation_chunksize: int = 1


BASE_IDE_CONFIG = TrainingConfig(
    # 随机种子：会在批量模式里被逐个覆盖
    seed=23,
    # 训练代数：越大训练越充分，但耗时越长
    generations=3000,
    # 每代保留为父代的精英个体数量
    num_parents=120,
    # 每代新生成的子代数量
    num_offspring=240,
    # 固定棋盘时只需要评估这一种棋盘
    boards_per_individual=1,
    # 同一棋盘下重复跑多少局，降低偶然性
    episodes_per_board=4,
    # 饥饿阈值缩放：蛇如果太久没吃到苹果，就应该判死。实际 starvation_limit = max(100, rows*cols*starvation_scale)
    starvation_scale=1.0,
    # 苹果奖励权重：越大越强迫模型优先学会吃苹果，而不是只苟活
    score_weight=3000.0,
    # 生存奖励权重：保留适度“活下来”的激励，但不能压过吃苹果
    survival_weight=100.0,
    # 原始 fitness 的保留权重：作为辅助排序信号，而不是主目标
    raw_fitness_weight=0.1,
    # 原始 fitness 截断值：避免单局极端长生存把聚合分数拉爆
    raw_fitness_cap=300.0,
    # 0 苹果惩罚：针对“缩在角落里绕圈”这类只求存活的策略
    zero_score_penalty=50.0,
    # 接近苹果奖励：每次蛇头与苹果距离缩短时给予正反馈
    approach_apple_weight=12.0,
    # 重复踩格惩罚：每次蛇头回到已访问位置时施加惩罚
    repeat_cell_penalty=3.0,
    # 停滞惩罚：连续没有更接近苹果的步数会累计惩罚
    stall_penalty=1.5,
    # 批量实验默认不自动晋升，由比较结果决定是否手动晋升
    promote_to_default=True,
    # 是否启用整群 checkpoint（会保存在对应 profile 的 checkpoints 目录下）
    population_checkpoint_enabled=True,
    # 每隔多少代覆写一次整群 checkpoint，例如 5 表示每 5 代更新一次 <seed>-latest
    population_checkpoint_interval=1,
    # 从整群 checkpoint 继续训练时，把这里改成 checkpoint 目录路径。
    # 例 1（PC 档位，seed=56）：
    # resume_from_checkpoint='artifacts/models/checkpoints/pc/56-latest'
    # 例 2（phone 档位，seed=23）：
    # resume_from_checkpoint='artifacts/models/checkpoints/phone/23-latest'
    # 注意：恢复训练时，generations 表示“目标总代数上限”，不是“再训练多少代”。
    # 例如 checkpoint 是第 50 代，想继续跑到第 200 代，这里应保持 generations=200。
    # 如果想重新从头开始训练，把它改回 None 即可。
    resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest',
    # True: 关键训练参数必须与 checkpoint 中保存的一致，否则拒绝恢复。
    # False: 允许近似恢复，但后续训练轨迹可能与原始连续训练不同。
    resume_strict=True,
    # 是否启用“每代种群评估”的多进程并行。只并行 evaluate_population()，不并行 next_generation()。
    parallel_evaluation_enabled=True,
    # 多进程 worker 数量。建议先从 8 开始试；None 表示自动取 os.cpu_count()-1。
    parallel_evaluation_workers=None,
    # ProcessPoolExecutor.map 的 chunksize，通常保持 1 即可。
    parallel_evaluation_chunksize=1,
)


def build_export_name(profile_id: str, generations: int, seed: int) -> str:
    export_dir = resolve_project_path(DEVICE_BOARD_PROFILES[profile_id]['export_dir'])
    export_dir.mkdir(parents=True, exist_ok=True)
    prefix = f'{profile_id}-{generations}-{seed}-'
    existing = sorted(export_dir.glob(f'{prefix}*.json'))
    used = set()
    for path in existing:
        stem = path.stem
        if not stem.startswith(prefix):
            continue
        suffix = stem[len(prefix):]
        if suffix.isdigit():
            used.add(int(suffix))
    serial = 0
    while serial in used:
        serial += 1
    return f'{prefix}{serial:03d}'


# 把一份通用训练参数绑定到具体设备档位，避免手动同时改棋盘尺寸、导出目录和默认模型路径。
def build_profile_config(base: TrainingConfig, profile_id: str) -> TrainingConfig:
    profile = DEVICE_BOARD_PROFILES[profile_id]
    return replace(
        base,
        board_size_pool=list(profile['board_size_pool']),
        boards_per_individual=1,
        export_name='',
        export_dir=profile['export_dir'],
        default_model_path=profile['default_model_path'],
        profile_id=profile_id,
        profile_label=profile['label'],
        checkpoint_dir=profile['checkpoint_dir'],
    )


def build_run_config(base: TrainingConfig, seed: int) -> TrainingConfig:
    return replace(
        base,
        seed=seed,
        export_name=build_export_name(base.profile_id, base.generations, seed),
    )


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
            score_weight=config.score_weight,
            survival_weight=config.survival_weight,
            raw_fitness_weight=config.raw_fitness_weight,
            raw_fitness_cap=config.raw_fitness_cap,
            zero_score_penalty=config.zero_score_penalty,
            approach_apple_weight=config.approach_apple_weight,
            repeat_cell_penalty=config.repeat_cell_penalty,
            stall_penalty=config.stall_penalty,
            export_name=config.export_name,
            export_dir=config.export_dir,
            profile_id=config.profile_id,
            profile_label=config.profile_label,
            checkpoint_dir=config.checkpoint_dir,
            default_model_path=config.default_model_path,
            promote_to_default=config.promote_to_default,
            population_checkpoint_enabled=config.population_checkpoint_enabled,
            population_checkpoint_interval=config.population_checkpoint_interval,
            resume_from_checkpoint=config.resume_from_checkpoint,
            resume_strict=config.resume_strict,
            parallel_evaluation_enabled=config.parallel_evaluation_enabled,
            parallel_evaluation_workers=config.parallel_evaluation_workers,
            parallel_evaluation_chunksize=config.parallel_evaluation_chunksize,
        )
    )
    return trainer.train()


def _prepare_default_baseline(config: TrainingConfig):
    default_model_path = resolve_project_path(config.default_model_path)
    if not default_model_path.exists():
        return None

    baseline_temp_path = resolve_project_path(f'{config.export_dir}/__baseline_default_before_run__.json')
    baseline_temp_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_temp_path.write_text(default_model_path.read_text(encoding='utf-8'), encoding='utf-8')
    return baseline_temp_path


def _evaluate_against_baseline(output: Path, config: TrainingConfig, baseline_temp_path: Path | None):
    evaluation_rng = random.Random()
    episode_seed_schedule = build_episode_seed_schedule(config.board_size_pool, config.episodes_per_board, evaluation_rng)
    candidate_report = evaluate_models([output], config.board_size_pool, config.episodes_per_board, config.starvation_scale, episode_seed_schedule=episode_seed_schedule)[0]
    print('[snake_nn.trainer] 候选模型评估摘要：')
    print(format_summary([candidate_report]))
    print('[snake_nn.trainer] 候选模型分棋盘尺寸摘要：')
    print(format_board_size_summary(candidate_report))

    comparison = None
    baseline_report = None
    if baseline_temp_path and baseline_temp_path.exists():
        baseline_report = evaluate_models([baseline_temp_path], config.board_size_pool, config.episodes_per_board, config.starvation_scale, episode_seed_schedule=episode_seed_schedule)[0]
        print('[snake_nn.trainer] 当前默认模型评估摘要：')
        print(format_summary([baseline_report]))
        print('[snake_nn.trainer] 当前默认模型分棋盘尺寸摘要：')
        print(format_board_size_summary(baseline_report))
        comparison = compare_reports(candidate_report, baseline_report)
        print('[snake_nn.trainer] 晋升建议：')
        print(format_comparison(comparison))
        print('[snake_nn.trainer] 分棋盘尺寸对比：')
        print(format_board_size_comparison(comparison))
    else:
        print('[snake_nn.trainer] 当前没有可比较的该设备默认模型；如果候选模型表现满意，可以手动晋升为默认模型。')

    report_dir = resolve_project_path(config.export_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    report_json_path = report_dir / 'evaluation-report.json'
    report_models = [candidate_report] + ([baseline_report] if baseline_report else [])
    write_evaluation_report(report_json_path, report_models, comparison=comparison)

    return candidate_report, comparison


def _format_batch_rankings(batch_results):
    sorted_results = sorted(batch_results, key=lambda item: item['candidate_report']['avgSelectionScore'], reverse=True)
    lines = [f"[snake_nn.trainer] {sorted_results[0]['config'].profile_label} 本轮批量实验排行榜："]
    for index, item in enumerate(sorted_results, start=1):
        report = item['candidate_report']
        verdict = '建议晋升' if item['comparison'] and item['comparison']['better'] else '不建议晋升'
        lines.append(
            f"{index}. seed={item['config'].seed} | 模型={report['model']} | 平均选择分={report['avgSelectionScore']:.2f} | "
            f"平均苹果数={report['avgScore']:.2f} | 平均存活步数={report['avgFrames']:.2f} | {verdict}"
        )
    return '\n'.join(lines)


def _copy_best_of_batch(batch_results):
    if not batch_results:
        return None

    best = max(batch_results, key=lambda item: item['candidate_report']['avgSelectionScore'])
    source_path = resolve_project_path(best['output'])

    best_of_batch_path = resolve_project_path(f"{best['config'].export_dir}/best-of-batch.json")
    best_of_batch_path.parent.mkdir(parents=True, exist_ok=True)
    copyfile(source_path, best_of_batch_path)
    return best_of_batch_path, best


# 手动批量训练的主流程：逐个 seed 训练 -> 逐个评估 -> 生成排行榜 -> 复制 best-of-batch。
def run_seed_batch(base_config: TrainingConfig, seeds: list[int]):
    baseline_temp_path = _prepare_default_baseline(base_config)
    batch_results = []

    try:
        for seed in seeds:
            config = build_run_config(base_config, seed)
            print('\n' + '=' * 80)
            print(f'[snake_nn.trainer] 开始运行 {config.profile_label} 种子实验：seed={seed}')
            print('当前训练参数：')
            print(config)
            output = train(config)
            print(f'训练完成，候选模型已导出到：{output}')
            candidate_report, comparison = _evaluate_against_baseline(output, config, baseline_temp_path)
            batch_results.append({
                'config': config,
                'output': output,
                'candidate_report': candidate_report,
                'comparison': comparison,
            })
    finally:
        if baseline_temp_path and baseline_temp_path.exists():
            baseline_temp_path.unlink(missing_ok=True)

    print('\n' + '=' * 80)
    print(_format_batch_rankings(batch_results))

    copied = _copy_best_of_batch(batch_results)
    if copied:
        best_of_batch_path, best = copied
        print('[snake_nn.trainer] 已自动复制本轮排行榜第一名模型：')
        print(f"- 源模型：{best['output']}")
        print(f"- 目标文件：{best_of_batch_path}")

        if best['comparison'] and best['comparison']['better']:
            default_target = resolve_project_path(best['config'].default_model_path)
            print('[snake_nn.trainer] 推荐操作：')
            print(f"- 推荐将本轮最佳模型晋升为 {best['config'].profile_label} 的默认模型")
            print(f"- 推荐复制到：{default_target}")
        else:
            print('[snake_nn.trainer] 推荐操作：')
            print(f"- 暂不建议将本轮最佳模型晋升为 {best['config'].profile_label} 的默认模型")


def train_default():
    # 本地直接运行 trainer.py 时，默认就走“当前档位 + 当前种子列表”的批量实验模式。
    profile_config = build_profile_config(BASE_IDE_CONFIG, ACTIVE_PROFILE)
    return run_seed_batch(profile_config, SEED_BATCH)


if __name__ == '__main__':
    # CLI 直接启动时，先把 BASE_IDE_CONFIG 绑定到当前档位，再把 SEED_BATCH 里的种子逐个跑完。
    profile_config = build_profile_config(BASE_IDE_CONFIG, ACTIVE_PROFILE)
    print('[snake_nn.trainer] 开始执行种子批量实验模式...')
    print(f"当前设备档位：{profile_config.profile_label} ({profile_config.board_size_pool[0][0]}x{profile_config.board_size_pool[0][1]})")
    print(f'实验种子列表：{SEED_BATCH}')
    run_seed_batch(profile_config, SEED_BATCH)
