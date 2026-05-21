from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

if __package__ in (None, ''):
    project_root = Path(__file__).resolve().parents[3]
    train_root = Path(__file__).resolve().parents[1]
    for entry in (project_root, train_root):
        if str(entry) not in sys.path:
            sys.path.insert(0, str(entry))
else:
    project_root = Path(__file__).resolve().parents[3]
from train.snake_nn.scoring import (
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
from train.snake_nn.vendor.chrispresso.snake import Snake

DEFAULT_BOARD_SIZES = [(8, 8), (10, 10), (12, 12), (14, 14), (16, 16)]


def load_model(model_path: Path):
    return json.loads(model_path.read_text(encoding='utf-8'))


def build_vendor_params(model):
    import numpy as np

    params = {}
    for layer in (1, 2, 3):
        params[f'W{layer}'] = np.array(model['weights'][f'W{layer}'], dtype=float).T
        params[f'b{layer}'] = np.array(model['weights'][f'b{layer}'], dtype=float).reshape((-1, 1))
    return params


def build_episode_seed_schedule(board_sizes, episodes_per_board: int, rng: random.Random | None = None):
    random_source = rng or random.Random()
    return {
        tuple(board_size): [random_source.randrange(10_000_000) for _ in range(episodes_per_board)]
        for board_size in board_sizes
    }


def evaluate_model(model_path: Path, board_sizes, episodes_per_board: int, starvation_scale: float, episode_seed_schedule=None):
    model = load_model(model_path)
    params = build_vendor_params(model)
    metadata = model.get('metadata', {})
    score_weight = metadata.get('scoreWeight', DEFAULT_SCORE_WEIGHT)
    survival_weight = metadata.get('survivalWeight', DEFAULT_SURVIVAL_WEIGHT)
    raw_fitness_weight = metadata.get('rawFitnessWeight', DEFAULT_RAW_FITNESS_WEIGHT)
    raw_fitness_cap = metadata.get('rawFitnessCap', DEFAULT_RAW_FITNESS_CAP)
    zero_score_penalty = metadata.get('zeroScorePenalty', DEFAULT_ZERO_SCORE_PENALTY)
    approach_apple_weight = metadata.get('approachAppleWeight', DEFAULT_APPROACH_APPLE_WEIGHT)
    repeat_cell_penalty = metadata.get('repeatCellPenalty', DEFAULT_REPEAT_CELL_PENALTY)
    stall_penalty = metadata.get('stallPenalty', DEFAULT_STALL_PENALTY)
    seed_schedule = episode_seed_schedule or build_episode_seed_schedule(board_sizes, episodes_per_board)
    results = []

    for board_size in board_sizes:
        board_key = tuple(board_size)
        board_episode_seeds = seed_schedule[board_key]
        for episode, apple_seed in enumerate(board_episode_seeds):
            starvation_limit = max(100, int(board_size[0] * board_size[1] * starvation_scale))
            snake = Snake(
                board_size,
                chromosome=params,
                hidden_layer_architecture=model['hiddenSizes'],
                hidden_activation=model['hiddenActivation'],
                output_activation=model['outputActivation'],
                apple_and_self_vision=metadata.get('appleAndSelfVision', 'binary'),
                starvation_limit=starvation_limit,
                apple_seed=apple_seed,
            )
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
            survival_ratio = compute_survival_ratio(float(snake._frames), starvation_limit)
            selection_score = compute_selection_score(
                score=float(snake.score),
                frames=float(snake._frames),
                raw_fitness=float(snake.fitness),
                starvation_limit=starvation_limit,
                approach_apple_events=float(approach_apple_events),
                repeat_cell_count=float(repeat_cell_count),
                stall_steps=float(stall_steps),
                score_weight=score_weight,
                survival_weight=survival_weight,
                raw_fitness_weight=raw_fitness_weight,
                raw_fitness_cap=raw_fitness_cap,
                zero_score_penalty=zero_score_penalty,
                approach_apple_weight=approach_apple_weight,
                repeat_cell_penalty=repeat_cell_penalty,
                stall_penalty=stall_penalty,
            )
            results.append({
                'boardSize': list(board_size),
                'episode': episode,
                'fitness': float(snake.fitness),
                'selectionScore': float(selection_score),
                'score': float(snake.score),
                'frames': float(snake._frames),
                'survivalRatio': float(survival_ratio),
                'approachAppleEvents': float(approach_apple_events),
                'repeatCellCount': float(repeat_cell_count),
                'stallSteps': float(stall_steps),
                'uniqueHeadCells': float(len(visited_head_cells)),
            })

    summary = summarize_episodes(
        results,
        score_weight=score_weight,
        survival_weight=survival_weight,
        raw_fitness_weight=raw_fitness_weight,
        raw_fitness_cap=raw_fitness_cap,
        zero_score_penalty=zero_score_penalty,
        approach_apple_weight=approach_apple_weight,
        repeat_cell_penalty=repeat_cell_penalty,
        stall_penalty=stall_penalty,
    )
    return {
        'model': str(model_path),
        **summary,
        'results': results,
    }


def evaluate_models(model_paths, board_sizes, episodes_per_board: int, starvation_scale: float, episode_seed_schedule=None):
    seed_schedule = episode_seed_schedule or build_episode_seed_schedule(board_sizes, episodes_per_board)
    return [evaluate_model(path, board_sizes, episodes_per_board, starvation_scale, episode_seed_schedule=seed_schedule) for path in model_paths]


def summarize_by_board_size(results):
    grouped = {}
    for item in results:
        key = tuple(item['boardSize'])
        grouped.setdefault(key, []).append(item)

    summary = []
    for board_size, items in sorted(grouped.items()):
        summary.append({
            'boardSize': list(board_size),
            'avgSelectionScore': mean(item['selectionScore'] for item in items),
            'avgFitness': mean(item['fitness'] for item in items),
            'avgScore': mean(item['score'] for item in items),
            'avgFrames': mean(item['frames'] for item in items),
            'avgSurvivalRatio': mean(item['survivalRatio'] for item in items),
        })
    return summary


def format_summary(reports):
    lines = []
    for report in reports:
        lines.append(
            f"- 模型 {report['model']}：平均选择分={report['avgSelectionScore']:.2f}，平均原始适应度={report['avgFitness']:.2f}，"
            f"平均苹果数={report['avgScore']:.2f}，平均存活步数={report['avgFrames']:.2f}，选择分标准差={report['selectionScoreStd']:.2f}"
        )
    return '\n'.join(lines)


def format_board_size_summary(report):
    lines = []
    for item in summarize_by_board_size(report['results']):
        width, height = item['boardSize']
        lines.append(
            f"  - 棋盘 {width}x{height}：平均选择分={item['avgSelectionScore']:.2f}，平均原始适应度={item['avgFitness']:.2f}，"
            f"平均苹果数={item['avgScore']:.2f}，平均存活步数={item['avgFrames']:.2f}，平均生存比例={item['avgSurvivalRatio']:.2f}"
        )
    return '\n'.join(lines)


def compare_reports(candidate_report, baseline_report):
    deltas = {
        'selection': candidate_report['avgSelectionScore'] - baseline_report['avgSelectionScore'],
        'fitness': candidate_report['avgFitness'] - baseline_report['avgFitness'],
        'score': candidate_report['avgScore'] - baseline_report['avgScore'],
        'frames': candidate_report['avgFrames'] - baseline_report['avgFrames'],
    }

    candidate_by_board = {
        tuple(item['boardSize']): item for item in summarize_by_board_size(candidate_report['results'])
    }
    baseline_by_board = {
        tuple(item['boardSize']): item for item in summarize_by_board_size(baseline_report['results'])
    }

    board_comparisons = []
    for board_size in sorted(set(candidate_by_board) | set(baseline_by_board)):
        candidate_item = candidate_by_board.get(board_size)
        baseline_item = baseline_by_board.get(board_size)
        if not candidate_item or not baseline_item:
            continue
        board_comparisons.append({
            'boardSize': list(board_size),
            'selection': candidate_item['avgSelectionScore'] - baseline_item['avgSelectionScore'],
            'fitness': candidate_item['avgFitness'] - baseline_item['avgFitness'],
            'score': candidate_item['avgScore'] - baseline_item['avgScore'],
            'frames': candidate_item['avgFrames'] - baseline_item['avgFrames'],
        })

    better = deltas['selection'] > 0
    return {
        'better': better,
        'deltas': deltas,
        'candidate': candidate_report['model'],
        'baseline': baseline_report['model'],
        'byBoard': board_comparisons,
    }


def compare_reports(candidate_report, baseline_report):
    deltas = {
        'selection': candidate_report['avgSelectionScore'] - baseline_report['avgSelectionScore'],
        'fitness': candidate_report['avgFitness'] - baseline_report['avgFitness'],
        'score': candidate_report['avgScore'] - baseline_report['avgScore'],
        'frames': candidate_report['avgFrames'] - baseline_report['avgFrames'],
    }

    candidate_by_board = {
        tuple(item['boardSize']): item for item in summarize_by_board_size(candidate_report['results'])
    }
    baseline_by_board = {
        tuple(item['boardSize']): item for item in summarize_by_board_size(baseline_report['results'])
    }

    board_comparisons = []
    for board_size in sorted(set(candidate_by_board) | set(baseline_by_board)):
        candidate_item = candidate_by_board.get(board_size)
        baseline_item = baseline_by_board.get(board_size)
        if not candidate_item or not baseline_item:
            continue
        board_comparisons.append({
            'boardSize': list(board_size),
            'selection': candidate_item['avgSelectionScore'] - baseline_item['avgSelectionScore'],
            'fitness': candidate_item['avgFitness'] - baseline_item['avgFitness'],
            'score': candidate_item['avgScore'] - baseline_item['avgScore'],
            'frames': candidate_item['avgFrames'] - baseline_item['avgFrames'],
        })

    better = deltas['selection'] > 0
    return {
        'better': better,
        'deltas': deltas,
        'candidate': candidate_report['model'],
        'baseline': baseline_report['model'],
        'byBoard': board_comparisons,
    }


def build_evaluation_report_payload(reports, comparison=None, generated_at=None):
    generated_at = generated_at or datetime.now(timezone.utc).isoformat()
    return {
        'generatedAt': generated_at,
        'reports': reports,
        'boardSummaries': [
            {
                'model': report['model'],
                'items': summarize_by_board_size(report['results']),
            }
            for report in reports
        ],
        'comparison': comparison,
    }


def build_evaluation_report_html(payload):
    json_payload = json.dumps(payload, ensure_ascii=False)
    template = """<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>Snake AI 评估报告</title>
  <script src=\"https://cdn.jsdelivr.net/npm/chart.js\"></script>
  <style>
    :root {{
      --bg: #070a0c;
      --panel: rgba(7, 10, 12, 0.86);
      --text: #d8d8d8;
      --muted: #9aa7b0;
      --gold: #c89a2e;
      --cyan: #00e5ff;
      --danger: #d45134;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.08), transparent 30%), linear-gradient(180deg, #050709, #0a0d10); color: var(--text); font-family: \"Segoe UI\", system-ui, sans-serif; padding: 24px; }}
    h1 {{ margin: 0 0 8px; color: var(--gold); }}
    p {{ color: var(--muted); }}
    .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0 24px; }}
    .card, .panel {{ background: var(--panel); border: 1px solid rgba(200, 154, 46, 0.16); padding: 14px; }}
    .label {{ font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }}
    .value {{ margin-top: 8px; font-size: 1.2rem; color: var(--gold); font-family: monospace, sans-serif; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }}
    canvas {{ width: 100% !important; height: 280px !important; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.92rem; }}
    th, td {{ padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: right; }}
    th:first-child, td:first-child {{ text-align: left; }}
  </style>
</head>
<body>
  <h1>Snake AI 评估报告</h1>
  <p>展示模型 summary、按棋盘尺寸结果，以及候选模型与 baseline 的比较。</p>
  <div class=\"cards\" id=\"summary-cards\"></div>
  <div class=\"grid\">
    <div class=\"panel\"><canvas id=\"summaryChart\"></canvas></div>
    <div class=\"panel\"><canvas id=\"boardScoreChart\"></canvas></div>
    <div class=\"panel\"><canvas id=\"boardFramesChart\"></canvas></div>
    <div class=\"panel\"><canvas id=\"comparisonChart\"></canvas></div>
  </div>
  <div class=\"panel\" style=\"margin-top: 18px;\">
    <h2 style=\"margin-top:0;color:var(--gold);font-size:1.1rem;\">模型摘要</h2>
    <table id=\"summary-table\"></table>
  </div>
  <script>
    const payload = __PAYLOAD__;
    const reports = payload.reports || [];
    const boardSummaries = payload.boardSummaries || [];
    const comparison = payload.comparison || null;

    function fixed(value, digits = 2) {{ return Number.isFinite(value) ? value.toFixed(digits) : '--'; }}
    const labels = reports.map(report => report.model.split(/[\\/]/).pop());
    document.getElementById('summary-cards').innerHTML = [
      ['Models', reports.length],
      ['Generated At', (payload.generatedAt || '').replace('T', ' ').slice(0, 19)],
      ['Comparison', comparison ? (comparison.better ? 'Candidate Better' : 'Keep Baseline') : '--'],
    ].map(([label, value]) => `<div class=\"card\"><div class=\"label\">${{label}}</div><div class=\"value\">${{value}}</div></div>`).join('');

    function barChart(id, title, datasets, labels) {{
      new Chart(document.getElementById(id), {{
        type: 'bar',
        data: {{ labels, datasets }},
        options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ labels: {{ color: '#d8d8d8' }} }}, title: {{ display: true, text: title, color: '#c89a2e' }} }}, scales: {{ x: {{ ticks: {{ color: '#9aa7b0' }} }}, y: {{ ticks: {{ color: '#9aa7b0' }} }} }} }}
      }});
    }}

    barChart('summaryChart', '模型总体摘要', [
      {{ label: 'Selection Score', data: reports.map(r => r.avgSelectionScore), backgroundColor: 'rgba(0,229,255,0.55)' }},
      {{ label: 'Avg Score', data: reports.map(r => r.avgScore), backgroundColor: 'rgba(200,154,46,0.55)' }},
      {{ label: 'Avg Frames', data: reports.map(r => r.avgFrames), backgroundColor: 'rgba(123,216,143,0.55)' }},
    ], labels);

    const boardLabels = Array.from(new Set(boardSummaries.flatMap(item => item.items.map(entry => `${{entry.boardSize[0]}}x${{entry.boardSize[1]}}`))));
    barChart('boardScoreChart', '按棋盘尺寸 Avg Score', boardSummaries.map((entry, idx) => ({
      label: entry.model.split(/[\\/]/).pop(),
      data: boardLabels.map(label => {{
        const item = entry.items.find(board => `${{board.boardSize[0]}}x${{board.boardSize[1]}}` === label);
        return item ? item.avgScore : null;
      }}),
      backgroundColor: ['rgba(0,229,255,0.55)','rgba(200,154,46,0.55)','rgba(123,216,143,0.55)','rgba(138,125,255,0.55)'][idx % 4],
    })), boardLabels);
    barChart('boardFramesChart', '按棋盘尺寸 Avg Frames', boardSummaries.map((entry, idx) => ({
      label: entry.model.split(/[\\/]/).pop(),
      data: boardLabels.map(label => {{
        const item = entry.items.find(board => `${{board.boardSize[0]}}x${{board.boardSize[1]}}` === label);
        return item ? item.avgFrames : null;
      }}),
      backgroundColor: ['rgba(255,183,0,0.55)','rgba(0,229,255,0.55)','rgba(200,154,46,0.55)','rgba(123,216,143,0.55)'][idx % 4],
    })), boardLabels);

    const comparisonLabels = comparison ? ['Selection Δ', 'Fitness Δ', 'Score Δ', 'Frames Δ'] : [];
    barChart('comparisonChart', 'Candidate vs Baseline 差值', comparison ? [{
      label: 'Delta',
      data: [comparison.deltas.selection, comparison.deltas.fitness, comparison.deltas.score, comparison.deltas.frames],
      backgroundColor: ['rgba(0,229,255,0.55)','rgba(200,154,46,0.55)','rgba(123,216,143,0.55)','rgba(212,81,52,0.55)'],
    }] : [{ label: 'No Comparison', data: [] }], comparisonLabels);

    const table = document.getElementById('summary-table');
    table.innerHTML = `<thead><tr><th>模型</th><th>选择分</th><th>苹果数</th><th>存活步数</th><th>选择分标准差</th></tr></thead><tbody>${{reports.map(report => `<tr><td>${{report.model}}</td><td>${{fixed(report.avgSelectionScore)}}</td><td>${{fixed(report.avgScore)}}</td><td>${{fixed(report.avgFrames)}}</td><td>${{fixed(report.selectionScoreStd)}}</td></tr>`).join('')}}</tbody>`;
  </script>
</body>
</html>"""
    return template.replace('__PAYLOAD__', json_payload)


def write_evaluation_report(report_json_path: Path, reports, comparison=None):
    payload = build_evaluation_report_payload(reports, comparison=comparison)
    report_json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
    report_html_path = report_json_path.with_suffix('.html')
    report_html_path.write_text(build_evaluation_report_html(payload), encoding='utf-8')
    return report_json_path, report_html_path


def format_comparison(comparison):
    verdict = '建议晋升为默认模型' if comparison['better'] else '建议保留当前默认模型'
    deltas = comparison['deltas']
    return (
        f"[{verdict}] 候选模型={comparison['candidate']} | 当前默认模型={comparison['baseline']} | "
        f"选择分差值={deltas['selection']:.2f}，原始适应度差值={deltas['fitness']:.2f}，"
        f"苹果数差值={deltas['score']:.2f}，存活步数差值={deltas['frames']:.2f}"
    )


def format_board_size_comparison(comparison):
    lines = []
    for item in comparison['byBoard']:
        width, height = item['boardSize']
        lines.append(
            f"  - 棋盘 {width}x{height}：选择分差值={item['selection']:.2f}，原始适应度差值={item['fitness']:.2f}，"
            f"苹果数差值={item['score']:.2f}，存活步数差值={item['frames']:.2f}"
        )
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='批量评估导出的贪吃蛇神经网络模型')
    parser.add_argument('target', help='模型文件路径，或包含多个模型 json 文件的目录')
    parser.add_argument('--episodes-per-board', type=int, default=2, help='每个棋盘尺寸重复评估的局数')
    parser.add_argument('--starvation-scale', type=float, default=1.0, help='评估时使用的饥饿阈值缩放系数')
    args = parser.parse_args()

    target = Path(args.target)
    if not target.is_absolute():
        target = project_root / target
    if target.is_dir():
        model_paths = sorted(target.glob('*.json'))
    else:
        model_paths = [target]

    reports = evaluate_models(model_paths, DEFAULT_BOARD_SIZES, args.episodes_per_board, args.starvation_scale)
    print('模型评估摘要：')
    print(format_summary(reports))
    print('\n分棋盘尺寸摘要：')
    for report in reports:
        print(f"- 模型 {report['model']}")
        print(format_board_size_summary(report))

    if len(model_paths) == 1:
        target_json_path = model_paths[0].with_name(f'{model_paths[0].name}.eval-report.json')
    else:
        target_json_path = target / 'evaluation-report.json'
    write_evaluation_report(target_json_path, reports)


if __name__ == '__main__':
    main()
