from __future__ import annotations

import json
import shutil
import subprocess
import sys
import threading
import traceback
import uuid
import webbrowser
from dataclasses import asdict
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = PROJECT_ROOT / 'src'
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from train.snake_nn.evaluate_models import evaluate_models, write_evaluation_report
from train.snake_nn.paths import CHECKPOINTS_ROOT, EXPORTS_ROOT, PROFILES_DIR
from train.snake_nn.profiles import PROFILE_FILE_MAP
from train.snake_nn.trainer import ACTIVE_PROFILE, BASE_IDE_CONFIG, TrainingConfig, build_profile_config, run_seed_batch
from train.snake_nn.long_run_trainer import LongRunConfig, run_long_training, write_long_run_report


TRAINING_REPORT_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Snake AI 训练报告</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root { --bg: #070a0c; --panel: rgba(7, 10, 12, 0.86); --text: #d8d8d8; --muted: #9aa7b0; --gold: #c89a2e; --cyan: #00e5ff; --danger: #d45134; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top right, rgba(0, 229, 255, 0.08), transparent 30%), linear-gradient(180deg, #050709, #0a0d10); color: var(--text); font-family: "Segoe UI", system-ui, sans-serif; padding: 24px; }
    h1 { margin: 0 0 8px; color: var(--gold); }
    p { color: var(--muted); }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0 24px; }
    .card { background: var(--panel); border: 1px solid rgba(200, 154, 46, 0.16); padding: 14px; }
    .label { font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
    .value { margin-top: 8px; font-size: 1.35rem; color: var(--gold); font-family: monospace, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    canvas { width: 100% !important; height: 280px !important; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.92rem; }
    th, td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: right; }
    th:first-child, td:first-child { text-align: left; }
  </style>
</head>
<body>
  <h1>Snake AI 训练报告</h1>
  <p>显示 checkpoint 目录中累计保存的每代训练指标历史。</p>
  <div class="cards" id="summary-cards"></div>
  <div class="grid">
    <div class="card"><canvas id="selectionChart"></canvas></div>
    <div class="card"><canvas id="scoreChart"></canvas></div>
    <div class="card"><canvas id="framesChart"></canvas></div>
    <div class="card"><canvas id="survivalChart"></canvas></div>
    <div class="card"><canvas id="behaviorChart"></canvas></div>
    <div class="card"><canvas id="stabilityChart"></canvas></div>
  </div>
  <div class="card" style="margin-top: 18px;">
    <h2 style="margin-top:0;color:var(--gold);font-size:1.1rem;">最近 20 代</h2>
    <table id="history-table"></table>
  </div>
  <script src="__DATA_JS__"></script>
  <script>
    var payload = window.__TRAINING_PAYLOAD__ || {};
    var history = payload.history || [];
    var latest = payload.latest || {};
    var labels = history.map(function(item) { return item.generation; });
    function metric(name) { return history.map(function(item) { return item[name] != null ? item[name] : null; }); }
    function fixed(value, digits) { digits = digits || 2; return Number.isFinite(value) ? value.toFixed(digits) : '--'; }
    document.getElementById('summary-cards').innerHTML = [
      ['Seed', payload.seed], ['Profile', payload.profileLabel || payload.profileId || '--'], ['Latest Gen', payload.latestGeneration],
      ['Best Selection', fixed(latest.bestSelectionScore)], ['Best Avg Score', fixed(latest.bestAvgScore)], ['Best Avg Frames', fixed(latest.bestAvgFrames)],
    ].map(function(item) { return '<div class="card"><div class="label">' + item[0] + '</div><div class="value">' + item[1] + '</div></div>'; }).join('');
    function lineChart(id, title, datasets) {
      new Chart(document.getElementById(id), { type: 'line', data: { labels: labels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#d8d8d8' } }, title: { display: true, text: title, color: '#c89a2e' } }, scales: { x: { ticks: { color: '#9aa7b0' } }, y: { ticks: { color: '#9aa7b0' } } } } });
    }
    lineChart('selectionChart', '每代最佳 Selection Score', [{ label: 'Selection Score', data: metric('bestSelectionScore'), borderColor: '#00e5ff' }]);
    lineChart('scoreChart', '每代最佳 Avg Score', [{ label: 'Avg Score', data: metric('bestAvgScore'), borderColor: '#c89a2e' }]);
    lineChart('framesChart', '每代最佳 Avg Frames', [{ label: 'Avg Frames', data: metric('bestAvgFrames'), borderColor: '#7bd88f' }]);
    lineChart('survivalChart', '每代最佳 Avg Survival Ratio', [{ label: 'Avg Survival Ratio', data: metric('bestAvgSurvivalRatio'), borderColor: '#ffb700' }]);
    lineChart('behaviorChart', '行为指标趋势', [{ label: 'Approach Apple', data: metric('bestAvgApproachAppleEvents'), borderColor: '#00e5ff' }, { label: 'Repeat Cell', data: metric('bestAvgRepeatCellCount'), borderColor: '#d45134' }, { label: 'Stall Steps', data: metric('bestAvgStallSteps'), borderColor: '#ffb700' }]);
    lineChart('stabilityChart', '稳定性指标', [{ label: 'Selection Std', data: metric('bestSelectionScoreStd'), borderColor: '#c89a2e' }, { label: 'Fitness Std', data: metric('bestFitnessStd'), borderColor: '#8a7dff' }]);
    var recent = history.slice(-20).reverse();
    var table = document.getElementById('history-table');
    table.innerHTML = '<thead><tr><th>Generation</th><th>Selection</th><th>Avg Score</th><th>Avg Frames</th><th>Survival</th></tr></thead><tbody>' + recent.map(function(item) { return '<tr><td>' + item.generation + '</td><td>' + fixed(item.bestSelectionScore) + '</td><td>' + fixed(item.bestAvgScore) + '</td><td>' + fixed(item.bestAvgFrames) + '</td><td>' + fixed(item.bestAvgSurvivalRatio) + '</td></tr>'; }).join('') + '</tbody>';
  </script>
</body>
</html>"""



def _build_training_report_from_history(history_payload: dict, seed_dir: Path) -> str:
    data_js_path = seed_dir / 'training-history-data.js'
    data_js_path.write_text(
        'window.__TRAINING_PAYLOAD__ = ' + json.dumps(history_payload, ensure_ascii=False) + ';',
        encoding='utf-8',
    )
    return TRAINING_REPORT_HTML_TEMPLATE.replace('__DATA_JS__', 'training-history-data.js')


def _rebuild_profile_training_history(profile_id: str) -> dict:
    merged = []
    checkpoint_dir = CHECKPOINTS_DIR / profile_id
    if not checkpoint_dir.exists():
        return {'history': [], 'latestGeneration': 0, 'seed': None, 'profileId': profile_id}
    for seed_dir in sorted(checkpoint_dir.glob('*-latest')):
        history_path = seed_dir / 'training-history.json'
        if not history_path.exists():
            continue
        try:
            seed_data = json.loads(history_path.read_text(encoding='utf-8'))
            merged.extend(seed_data.get('history', []))
        except Exception:
            continue
    merged.sort(key=lambda item: int(item.get('generation', 0)))
    latest = merged[-1] if merged else {}
    return {
        'seed': latest.get('seed'),
        'profileId': profile_id,
        'profileLabel': latest.get('profileLabel', profile_id.upper()),
        'latestGeneration': int(latest.get('generation', 0)) if merged else 0,
        'latest': latest,
        'history': merged,
    }


def regenerate_training_report(profile_id: str) -> dict:
    checkpoint_dir = CHECKPOINTS_DIR / profile_id
    results = []
    for seed_dir in sorted(checkpoint_dir.glob('*-latest')):
        history_path = seed_dir / 'training-history.json'
        if not history_path.exists():
            continue
        try:
            payload = _read_json(history_path)
            if not payload.get('history'):
                continue
        except Exception:
            continue
        html = _build_training_report_from_history(payload, seed_dir)
        report_path = seed_dir / 'training-report.html'
        report_path.write_text(html, encoding='utf-8')
        results.append({
            'seed': seed_dir.name.replace('-latest', ''),
            'reportPath': _safe_relative(report_path),
            'historyEntryCount': len(payload.get('history', [])),
        })
    return {'regenerated': len(results), 'reports': results}

EXPORTS_DIR = EXPORTS_ROOT
CHECKPOINTS_DIR = CHECKPOINTS_ROOT
CONFIGS_DIR = PROJECT_ROOT / 'artifacts' / 'models' / 'config'
ALLOWED_PROFILE_TARGETS = {key: path.resolve() for key, path in PROFILE_FILE_MAP.items()}
RUN_STATE = {
    'id': None,
    'kind': None,
    'presetId': None,
    'presetName': None,
    'status': 'idle',
    'pid': None,
    'startedAt': None,
    'endedAt': None,
    'error': None,
    'result': None,
    'statusPath': None,
}
RUN_LOCK = threading.Lock()


def _safe_relative(path: Path) -> str:
    return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()


def _resolve_repo_path(relative_path: str) -> Path:
    candidate = (PROJECT_ROOT / relative_path).resolve()
    repo_root = PROJECT_ROOT.resolve()
    if repo_root not in candidate.parents and candidate != repo_root:
        raise ValueError('Path must stay inside repository root')
    return candidate


def _read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def _extract_model_summary(path: Path):
    data = _read_json(path)
    metadata = data.get('metadata', {})
    return {
        'path': _safe_relative(path),
        'name': path.name,
        'profileId': metadata.get('profileId'),
        'seed': metadata.get('seed'),
        'generation': metadata.get('generation'),
        'selectionScore': metadata.get('selectionScore'),
        'score': metadata.get('score'),
        'frames': metadata.get('frames'),
        'mtime': path.stat().st_mtime,
        'metadata': metadata,
    }


def _candidate_eval_report_paths(candidate_path: Path):
    return (
        candidate_path.with_name(f'{candidate_path.name}.eval-report.json'),
        candidate_path.with_name(f'{candidate_path.name}.eval-report.html'),
    )


def _run_candidate_evaluation(candidate_path: Path):
    reports = evaluate_models([candidate_path], None, episodes_per_board=2, starvation_scale=1.0)
    report_json_path, report_html_path = write_evaluation_report(_candidate_eval_report_paths(candidate_path)[0], reports)
    return {
        'reportJsonPath': _safe_relative(report_json_path),
        'reportHtmlPath': _safe_relative(report_html_path),
        'report': reports[0],
    }


def _run_bulk_evaluation(candidate_paths: list[Path]):
    reports = evaluate_models(candidate_paths, None, episodes_per_board=2, starvation_scale=1.0)
    report_json_path = EXPORTS_DIR / 'evaluation-report.json'
    report_json_path, report_html_path = write_evaluation_report(report_json_path, reports)
    return {
        'reportJsonPath': _safe_relative(report_json_path),
        'reportHtmlPath': _safe_relative(report_html_path),
        'count': len(reports),
        'topModel': max(reports, key=lambda item: item['avgSelectionScore']) if reports else None,
    }


def _discover_profiles():
    results = []
    for profile_id, path in PROFILE_FILE_MAP.items():
        entry = {'profile': profile_id, 'path': _safe_relative(path), 'exists': path.exists()}
        if path.exists():
            entry['summary'] = _extract_model_summary(path)
        results.append(entry)
    return results


def _discover_candidates():
    results = []
    for profile_dir in sorted(EXPORTS_DIR.iterdir() if EXPORTS_DIR.exists() else []):
        if not profile_dir.is_dir():
            continue
        for model_path in sorted(profile_dir.glob('*.json')):
            if model_path.name.endswith('.eval-report.json'):
                continue
            if model_path.name == 'evaluation-report.json':
                continue
            results.append(_extract_model_summary(model_path))
    return results


def _discover_checkpoints():
    results = []
    checkpoints_root = CHECKPOINTS_DIR
    if not checkpoints_root.exists():
        return results
    for profile_dir in sorted(checkpoints_root.iterdir()):
        if not profile_dir.is_dir():
            continue
        checkpoint_root = profile_dir
        profile_entry = {
            'profile': profile_dir.name,
            'root': _safe_relative(checkpoint_root),
            'rolling': [],
            'latestSeeds': [],
        }
        for filename in ('best.json', 'best-so-far.json', 'training-history.json', 'training-report.html'):
            file_path = checkpoint_root / filename
            if file_path.exists():
                profile_entry['rolling'].append({'name': filename, 'path': _safe_relative(file_path)})
        for seed_dir in sorted(path for path in checkpoint_root.iterdir() if path.is_dir() and path.name.endswith('-latest')):
            meta_path = seed_dir / 'checkpoint_meta.json'
            meta = _read_json(meta_path) if meta_path.exists() else None
            checkpoint_entry = {
                'name': seed_dir.name,
                'path': _safe_relative(seed_dir),
                'metaPath': _safe_relative(meta_path) if meta_path.exists() else None,
                'summary': {
                    'generation': meta.get('generation') if meta else None,
                    'populationSize': meta.get('populationSize') if meta else None,
                    'seed': meta.get('seed') if meta else None,
                    'checkpointInterval': meta.get('checkpointInterval') if meta else None,
                    'profileId': (meta.get('trainerConfigSnapshot') or {}).get('profile_id') if meta else None,
                    'resumePath': _safe_relative(seed_dir),
                    'resumeExample': f"resume_from_checkpoint='{_safe_relative(seed_dir)}'",
                    'targetGenerations': (meta.get('trainerConfigSnapshot') or {}).get('generations') if meta else None,
                    'parallelEvaluationEnabled': (meta.get('trainerConfigSnapshot') or {}).get('parallel_evaluation_enabled') if meta else None,
                } if meta else None,
            }
            profile_entry['latestSeeds'].append(checkpoint_entry)
        results.append(profile_entry)
    return results


def _discover_reports():
    results = []
    for path in sorted((PROJECT_ROOT / 'artifacts').glob('**/*.html')):
        results.append({'path': _safe_relative(path), 'name': path.name, 'type': 'html'})
    return results


def _iter_report_files_to_clear():
    patterns = [
        'artifacts/models/exports/evaluation-report.html',
        'artifacts/models/exports/evaluation-report.json',
        'artifacts/models/exports/*/evaluation-report.html',
        'artifacts/models/exports/*/evaluation-report.json',
        'artifacts/models/exports/*/*.eval-report.html',
        'artifacts/models/exports/*/*.eval-report.json',
    ]
    seen = set()
    for pattern in patterns:
        for path in PROJECT_ROOT.glob(pattern):
            resolved = path.resolve()
            if resolved in seen or not path.exists() or not path.is_file():
                continue
            seen.add(resolved)
            yield path


def _clear_report_files():
    removed = []
    for path in _iter_report_files_to_clear():
        path.unlink(missing_ok=True)
        removed.append(_safe_relative(path))
    return removed


def _iter_training_data_to_clear():
    yield from (PROJECT_ROOT / 'artifacts' / 'models' / 'checkpoints').glob('*/training-history.json')
    yield from (PROJECT_ROOT / 'artifacts' / 'models' / 'checkpoints').glob('*/training-report.html')
    yield from (PROJECT_ROOT / 'artifacts' / 'models' / 'long-run').glob('*/run-log.jsonl')
    yield from (PROJECT_ROOT / 'artifacts' / 'models' / 'long-run').glob('*/run-log-summary.html')


def _clear_training_data():
    removed = []
    for path in _iter_training_data_to_clear():
        if path.exists() and path.is_file():
            path.unlink(missing_ok=True)
            removed.append(_safe_relative(path))
    return removed


def _manual_presets_path() -> Path:
    return CONFIGS_DIR / 'manual-training-presets.json'


def _long_run_presets_path() -> Path:
    return CONFIGS_DIR / 'long-run-presets.json'


def _default_manual_config():
    base = build_profile_config(BASE_IDE_CONFIG, ACTIVE_PROFILE)
    config = asdict(base)
    config.pop('export_name', None)
    return config


def _default_long_run_config():
    config = asdict(LongRunConfig())
    return config


def _default_preset_store(default_name: str, default_payload: dict):
    return {
        'activePresetId': 'default',
        'presets': [
            {
                'id': 'default',
                'name': default_name,
                'config': default_payload,
            }
        ],
    }


def _read_or_init_preset_store(path: Path, default_name: str, default_payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        payload = _default_preset_store(default_name, default_payload)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        return payload
    data = _read_json(path)
    if 'presets' not in data or 'activePresetId' not in data:
        data = _default_preset_store(default_name, default_payload)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return data


def _write_preset_store(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def _get_active_preset_config(store: dict):
    active_id = store.get('activePresetId')
    for preset in store.get('presets', []):
        if preset.get('id') == active_id:
            return preset.get('config', {})
    return (store.get('presets') or [{}])[0].get('config', {})


def _upsert_preset(path: Path, default_name: str, default_payload: dict, preset: dict):
    store = _read_or_init_preset_store(path, default_name, default_payload)
    preset_id = preset.get('id')
    if not preset_id:
        raise ValueError('Missing preset id')
    existing = next((item for item in store['presets'] if item.get('id') == preset_id), None)
    if existing:
        existing.update(preset)
    else:
        store['presets'].append(preset)
    _write_preset_store(path, store)
    return store


def _activate_preset(path: Path, default_name: str, default_payload: dict, preset_id: str):
    store = _read_or_init_preset_store(path, default_name, default_payload)
    if not any(item.get('id') == preset_id for item in store['presets']):
        raise ValueError('Preset not found')
    store['activePresetId'] = preset_id
    _write_preset_store(path, store)
    return store


def _delete_preset(path: Path, default_name: str, default_payload: dict, preset_id: str):
    store = _read_or_init_preset_store(path, default_name, default_payload)
    presets = store.get('presets', [])
    if preset_id == 'default':
        raise ValueError('默认预设不允许删除')
    if len(presets) <= 1:
        raise ValueError('至少保留一个预设')
    next_presets = [item for item in presets if item.get('id') != preset_id]
    if len(next_presets) == len(presets):
        raise ValueError('Preset not found')
    store['presets'] = next_presets
    if store.get('activePresetId') == preset_id:
        store['activePresetId'] = next_presets[0].get('id')
    _write_preset_store(path, store)
    return store


def _rename_preset(path: Path, default_name: str, default_payload: dict, preset_id: str, new_name: str):
    store = _read_or_init_preset_store(path, default_name, default_payload)
    if not new_name or not str(new_name).strip():
        raise ValueError('预设名称不能为空')
    preset = next((item for item in store.get('presets', []) if item.get('id') == preset_id), None)
    if not preset:
        raise ValueError('Preset not found')
    preset['name'] = str(new_name).strip()
    _write_preset_store(path, store)
    return store


def _manual_training_config_from_preset(config: dict) -> TrainingConfig:
    base = TrainingConfig(
        seed=int(config.get('seed', 23)),
        generations=int(config.get('generations', 3000)),
        num_parents=int(config.get('num_parents', 120)),
        num_offspring=int(config.get('num_offspring', 240)),
        boards_per_individual=int(config.get('boards_per_individual', 1)),
        episodes_per_board=int(config.get('episodes_per_board', 4)),
        starvation_scale=float(config.get('starvation_scale', 1.0)),
        score_weight=float(config.get('score_weight', 3000.0)),
        survival_weight=float(config.get('survival_weight', 100.0)),
        raw_fitness_weight=float(config.get('raw_fitness_weight', 0.1)),
        raw_fitness_cap=float(config.get('raw_fitness_cap', 300.0)),
        zero_score_penalty=float(config.get('zero_score_penalty', 50.0)),
        approach_apple_weight=float(config.get('approach_apple_weight', 12.0)),
        repeat_cell_penalty=float(config.get('repeat_cell_penalty', 3.0)),
        stall_penalty=float(config.get('stall_penalty', 1.5)),
        promote_to_default=False,
        population_checkpoint_enabled=bool(config.get('population_checkpoint_enabled', True)),
        population_checkpoint_interval=int(config.get('population_checkpoint_interval', 1)),
        resume_from_checkpoint=config.get('resume_from_checkpoint'),
        resume_strict=bool(config.get('resume_strict', True)),
        parallel_evaluation_enabled=bool(config.get('parallel_evaluation_enabled', True)),
        parallel_evaluation_workers=config.get('parallel_evaluation_workers'),
        parallel_evaluation_chunksize=int(config.get('parallel_evaluation_chunksize', 1)),
    )
    return build_profile_config(base, config.get('profile_id', 'pc'))


def _long_run_config_from_preset(config: dict) -> LongRunConfig:
    return LongRunConfig(**config)


def _set_run_state(**kwargs):
    with RUN_LOCK:
        RUN_STATE.update(kwargs)


def _training_runner_script(config_json: str, kind: str, status_path: str):
    return [
        sys.executable, '-c', f'''
import json
import os
import signal
import sys
import traceback
from pathlib import Path
sys.path.insert(0, {str(PROJECT_ROOT)!r})
sys.path.insert(0, {str(SRC_ROOT)!r})
config = json.loads({config_json!r})
kind = {kind!r}
status_path = {status_path!r}

def write_status(status, error=None, result=None):
    payload = {{"status": status}}
    if error:
        payload["error"] = error
    if result:
        payload["result"] = result
    try:
        Path(status_path).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

def on_terminate(signum, frame):
    write_status("killed", error="进程被外部终止(SIGTERM)")
    os._exit(1)

signal.signal(signal.SIGTERM, on_terminate)

write_status("running")
try:
    if kind == "manual":
        from train.snake_nn.trainer import TrainingConfig, build_profile_config, run_seed_batch
        from dataclasses import replace
        profile_id = config.pop("profile_id", "pc")
        base = TrainingConfig(**config)
        base = build_profile_config(base, profile_id)
        result = str(run_seed_batch(base, [base.seed]))
    else:
        from train.snake_nn.long_run_trainer import LongRunConfig, run_long_training
        result = str(run_long_training(LongRunConfig(**config)))
    write_status("succeeded", result=result)
except Exception as exc:
    write_status("failed", error=str(exc) + "\\n" + traceback.format_exc())
''',
    ]


def _start_run(kind: str, preset: dict):
    with RUN_LOCK:
        if RUN_STATE['status'] == 'running':
            raise ValueError('已有训练任务正在运行')
        run_id = uuid.uuid4().hex
        status_path = str(CONFIGS_DIR / f'run-status-{run_id}.json')
        CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
        config_json = json.dumps(preset.get('config', {}), ensure_ascii=False)
        pid_file_info = {'pid': None}
        cmd = _training_runner_script(config_json, kind, status_path)
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pid_file_info['pid'] = proc.pid
        Path(status_path).write_text(json.dumps({'status': 'running', 'pid': proc.pid}, ensure_ascii=False), encoding='utf-8')
        RUN_STATE.update({
            'id': run_id,
            'kind': kind,
            'presetId': preset.get('id'),
            'presetName': preset.get('name'),
            'status': 'running',
            'pid': proc.pid,
            'startedAt': datetime.now(timezone.utc).isoformat(),
            'endedAt': None,
            'error': None,
            'result': None,
            'statusPath': status_path,
        })

    def monitor():
        proc.wait()
        status_payload = {'status': 'failed', 'error': 'Process exited without writing status'}
        try:
            status_payload = json.loads(Path(status_path).read_text(encoding='utf-8'))
        except Exception:
            pass
        _set_run_state(
            status=status_payload.get('status', 'failed'),
            endedAt=datetime.now(timezone.utc).isoformat(),
            result=status_payload.get('result'),
            error=status_payload.get('error'),
        )

    threading.Thread(target=monitor, daemon=True).start()
    return run_id


def build_artifacts_payload():
    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'profiles': _discover_profiles(),
        'candidates': _discover_candidates(),
        'checkpoints': _discover_checkpoints(),
        'reports': _discover_reports(),
    }


def recover_orphaned_run_state():
    if not CONFIGS_DIR.exists():
        return
    for status_file in sorted(CONFIGS_DIR.glob('run-status-*.json')):
        try:
            status_data = json.loads(status_file.read_text(encoding='utf-8'))
            saved_pid = status_data.get('pid')
            alive = False
            if saved_pid is not None:
                try:
                    import os
                    os.kill(saved_pid, 0)
                    alive = True
                except OSError:
                    pass
            recovered_status = status_data.get('status', 'unknown')
            if recovered_status != 'running':
                status_file.unlink(missing_ok=True)
                continue
            if not alive:
                status_file.unlink(missing_ok=True)
                continue
            with RUN_LOCK:
                if RUN_STATE['status'] == 'running':
                    return
                RUN_STATE.update({
                    'id': status_file.stem.replace('run-status-', ''),
                    'kind': 'recovered',
                    'presetId': None,
                    'presetName': None,
                    'status': 'running',
                    'pid': saved_pid,
                    'startedAt': None,
                    'endedAt': None,
                    'error': None,
                    'result': None,
                    'statusPath': str(status_file),
                })
                _start_monitor_for_existing(status_file, saved_pid)
                return
        except Exception:
            pass


def _start_monitor_for_existing(status_file: Path, pid: int):
    def monitor():
        try:
            import os
            os.waitpid(pid, 0)
        except OSError:
            pass
        status_payload = {'status': 'failed', 'error': 'Process exited without writing status'}
        try:
            status_payload = json.loads(status_file.read_text(encoding='utf-8'))
        except Exception:
            pass
        _set_run_state(
            status=status_payload.get('status', 'failed'),
            endedAt=datetime.now(timezone.utc).isoformat(),
            result=status_payload.get('result'),
            error=status_payload.get('error') or '服务器重启后恢复，训练进程已结束',
        )
        status_file.unlink(missing_ok=True)

    threading.Thread(target=monitor, daemon=True).start()


class ModelManagerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/model-manager/health':
            return self._send_json({
                'ok': True,
                'repoRoot': str(PROJECT_ROOT),
                'time': datetime.now(timezone.utc).isoformat(),
            })
        if parsed.path == '/api/model-manager/artifacts':
            return self._send_json(build_artifacts_payload())
        if parsed.path == '/api/model-manager/reports':
            return self._send_json({'reports': _discover_reports()})
        if parsed.path == '/api/model-manager/configs':
            return self._send_json({
                'manual': _read_or_init_preset_store(_manual_presets_path(), '默认手动训练', _default_manual_config()),
                'longRun': _read_or_init_preset_store(_long_run_presets_path(), '默认长期训练', _default_long_run_config()),
            })
        if parsed.path == '/api/model-manager/candidate':
            query = parse_qs(parsed.query)
            relative_path = query.get('path', [None])[0]
            if not relative_path:
                return self._send_json({'error': 'Missing candidate path'}, status=HTTPStatus.BAD_REQUEST)
            try:
                candidate_path = _resolve_repo_path(relative_path)
                if not candidate_path.exists() or candidate_path.suffix != '.json':
                    raise FileNotFoundError(relative_path)
                return self._send_json({'candidate': _extract_model_summary(candidate_path), 'raw': _read_json(candidate_path)})
            except Exception as exc:
                return self._send_json({'error': str(exc)}, status=HTTPStatus.BAD_REQUEST)
        if parsed.path == '/api/model-manager/run-status':
            return self._send_json({'run': RUN_STATE})
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in {
            '/api/model-manager/promote',
            '/api/model-manager/evaluate',
            '/api/model-manager/reports/clear',
            '/api/model-manager/configs/manual',
            '/api/model-manager/configs/long-run',
            '/api/model-manager/presets/manual',
            '/api/model-manager/presets/long-run',
            '/api/model-manager/presets/manual/delete',
            '/api/model-manager/presets/long-run/delete',
            '/api/model-manager/presets/manual/rename',
            '/api/model-manager/presets/long-run/rename',
            '/api/model-manager/presets/manual/activate',
            '/api/model-manager/presets/long-run/activate',
            '/api/model-manager/runs/manual',
            '/api/model-manager/runs/long-run',
            '/api/model-manager/server/shutdown',
            '/api/model-manager/training-data/clear',
            '/api/model-manager/runs/stop',
            '/api/model-manager/long-run/summary',
            '/api/model-manager/training-report/regenerate',
        }:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode('utf-8')) if body else {}
            if parsed.path == '/api/model-manager/promote':
                profile = payload.get('profile')
                candidate_path_value = payload.get('candidatePath')
                if profile not in ALLOWED_PROFILE_TARGETS:
                    raise ValueError('Invalid profile')
                if not candidate_path_value:
                    raise ValueError('Missing candidatePath')

                candidate_path = _resolve_repo_path(candidate_path_value)
                if not candidate_path.exists() or candidate_path.suffix != '.json':
                    raise FileNotFoundError(candidate_path_value)

                target_path = ALLOWED_PROFILE_TARGETS[profile]
                shutil.copyfile(candidate_path, target_path)
                return self._send_json({
                    'ok': True,
                    'profile': profile,
                    'candidatePath': _safe_relative(candidate_path),
                    'targetPath': _safe_relative(target_path),
                    'updatedDefault': _extract_model_summary(target_path),
                })

            if parsed.path == '/api/model-manager/reports/clear':
                removed = _clear_report_files()
                return self._send_json({
                    'ok': True,
                    'removedCount': len(removed),
                    'removedPaths': removed,
                })

            if parsed.path == '/api/model-manager/configs/manual':
                store = _read_or_init_preset_store(_manual_presets_path(), '默认手动训练', _default_manual_config())
                active_id = store.get('activePresetId')
                active = next((item for item in store['presets'] if item.get('id') == active_id), None)
                if not active:
                    raise ValueError('Active manual preset not found')
                active['config'] = payload
                _write_preset_store(_manual_presets_path(), store)
                return self._send_json({'ok': True, 'manual': store})

            if parsed.path == '/api/model-manager/configs/long-run':
                store = _read_or_init_preset_store(_long_run_presets_path(), '默认长期训练', _default_long_run_config())
                active_id = store.get('activePresetId')
                active = next((item for item in store['presets'] if item.get('id') == active_id), None)
                if not active:
                    raise ValueError('Active long-run preset not found')
                active['config'] = payload
                _write_preset_store(_long_run_presets_path(), store)
                return self._send_json({'ok': True, 'longRun': store})

            if parsed.path == '/api/model-manager/presets/manual':
                store = _upsert_preset(_manual_presets_path(), '默认手动训练', _default_manual_config(), payload)
                return self._send_json({'ok': True, 'manual': store})

            if parsed.path == '/api/model-manager/presets/long-run':
                store = _upsert_preset(_long_run_presets_path(), '默认长期训练', _default_long_run_config(), payload)
                return self._send_json({'ok': True, 'longRun': store})

            if parsed.path == '/api/model-manager/presets/manual/activate':
                store = _activate_preset(_manual_presets_path(), '默认手动训练', _default_manual_config(), payload.get('id'))
                return self._send_json({'ok': True, 'manual': store})

            if parsed.path == '/api/model-manager/presets/long-run/activate':
                store = _activate_preset(_long_run_presets_path(), '默认长期训练', _default_long_run_config(), payload.get('id'))
                return self._send_json({'ok': True, 'longRun': store})

            if parsed.path == '/api/model-manager/presets/manual/delete':
                store = _delete_preset(_manual_presets_path(), '默认手动训练', _default_manual_config(), payload.get('id'))
                return self._send_json({'ok': True, 'manual': store})

            if parsed.path == '/api/model-manager/presets/long-run/delete':
                store = _delete_preset(_long_run_presets_path(), '默认长期训练', _default_long_run_config(), payload.get('id'))
                return self._send_json({'ok': True, 'longRun': store})

            if parsed.path == '/api/model-manager/presets/manual/rename':
                store = _rename_preset(_manual_presets_path(), '默认手动训练', _default_manual_config(), payload.get('id'), payload.get('name'))
                return self._send_json({'ok': True, 'manual': store})

            if parsed.path == '/api/model-manager/presets/long-run/rename':
                store = _rename_preset(_long_run_presets_path(), '默认长期训练', _default_long_run_config(), payload.get('id'), payload.get('name'))
                return self._send_json({'ok': True, 'longRun': store})

            if parsed.path == '/api/model-manager/runs/manual':
                store = _read_or_init_preset_store(_manual_presets_path(), '默认手动训练', _default_manual_config())
                active_id = store.get('activePresetId')
                preset = next((item for item in store['presets'] if item.get('id') == active_id), None)
                if not preset:
                    raise ValueError('Active manual preset not found')
                run_id = _start_run('manual', preset)
                return self._send_json({'ok': True, 'runId': run_id, 'run': RUN_STATE})

            if parsed.path == '/api/model-manager/runs/long-run':
                store = _read_or_init_preset_store(_long_run_presets_path(), '默认长期训练', _default_long_run_config())
                active_id = store.get('activePresetId')
                preset = next((item for item in store['presets'] if item.get('id') == active_id), None)
                if not preset:
                    raise ValueError('Active long-run preset not found')
                run_id = _start_run('long-run', preset)
                return self._send_json({'ok': True, 'runId': run_id, 'run': RUN_STATE})

            if parsed.path == '/api/model-manager/server/shutdown':
                self._send_json({'ok': True, 'message': '服务器即将关闭。已启动的训练任务在独立进程中运行，不受影响。'})
                import os
                threading.Timer(0.3, lambda: os._exit(0)).start()
                return

            if parsed.path == '/api/model-manager/training-data/clear':
                removed = _clear_training_data()
                return self._send_json({
                    'ok': True,
                    'removedCount': len(removed),
                    'removedPaths': removed,
                })

            if parsed.path == '/api/model-manager/runs/stop':
                with RUN_LOCK:
                    if RUN_STATE['status'] != 'running':
                        raise ValueError('当前没有正在运行的训练任务')
                    pid = RUN_STATE.get('pid')
                    killed = False
                    if pid is not None:
                        try:
                            import signal
                            import os
                            os.kill(pid, signal.SIGTERM)
                            killed = True
                        except OSError:
                            pass
                    status_path = RUN_STATE.get('statusPath')
                    if status_path:
                        Path(status_path).unlink(missing_ok=True)
                    RUN_STATE.update({
                        'status': 'failed',
                        'endedAt': datetime.now(timezone.utc).isoformat(),
                        'error': '用户手动终止训练进程' if killed else '终止请求已发送',
                        'statusPath': None,
                    })
                return self._send_json({'ok': True, 'killed': killed, 'run': RUN_STATE})

            if parsed.path == '/api/model-manager/long-run/summary':
                store = _read_or_init_preset_store(_long_run_presets_path(), '默认长期训练', _default_long_run_config())
                active_id = store.get('activePresetId')
                preset = next((item for item in store['presets'] if item.get('id') == active_id), None)
                profile_id = (preset.get('config', {}) if preset else {}).get('profile_id', 'pc')
                log_path = PROJECT_ROOT / 'artifacts' / 'models' / 'long-run' / profile_id / 'run-log.jsonl'
                summary_path = write_long_run_report(log_path)
                return self._send_json({'ok': True, 'summaryPath': _safe_relative(summary_path)})

            if parsed.path == '/api/model-manager/training-report/regenerate':
                store = _read_or_init_preset_store(_long_run_presets_path(), '默认长期训练', _default_long_run_config())
                active_id = store.get('activePresetId')
                preset = next((item for item in store['presets'] if item.get('id') == active_id), None)
                profile_id = (preset.get('config', {}) if preset else {}).get('profile_id', 'pc')
                result = regenerate_training_report(profile_id)
                return self._send_json({'ok': True, **result})

            evaluate_all = bool(payload.get('allCandidates'))
            if evaluate_all:
                candidate_paths = [
                    _resolve_repo_path(candidate['path'])
                    for candidate in _discover_candidates()
                ]
                if not candidate_paths:
                    raise ValueError('No candidate models available to evaluate')
                evaluation_result = _run_bulk_evaluation(candidate_paths)
                return self._send_json({'ok': True, 'mode': 'all', **evaluation_result})

            candidate_path_value = payload.get('candidatePath')
            if not candidate_path_value:
                raise ValueError('Missing candidatePath')
            candidate_path = _resolve_repo_path(candidate_path_value)
            if not candidate_path.exists() or candidate_path.suffix != '.json':
                raise FileNotFoundError(candidate_path_value)
            evaluation_result = _run_candidate_evaluation(candidate_path)
            return self._send_json({'ok': True, 'mode': 'single', **evaluation_result})
        except Exception as exc:
            self._send_json({'ok': False, 'error': str(exc)}, status=HTTPStatus.BAD_REQUEST)


def main(host='127.0.0.1', port=8000, open_browser=True):
    recover_orphaned_run_state()
    server = ThreadingHTTPServer((host, port), ModelManagerHandler)
    manager_url = f'http://{host}:{port}/apps/model_manager/index.html'
    print(f'[model_manager_server] serving {PROJECT_ROOT} at http://{host}:{port}')
    if open_browser:
        threading.Timer(0.35, lambda: webbrowser.open(manager_url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
