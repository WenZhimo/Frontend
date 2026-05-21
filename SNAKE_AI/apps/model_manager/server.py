from __future__ import annotations

import json
import shutil
import sys
import threading
import webbrowser
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

PROFILES_DIR = PROJECT_ROOT / 'data' / 'models' / 'profiles'
EXPORTS_DIR = PROJECT_ROOT / 'artifacts' / 'models' / 'exports'
CHECKPOINTS_DIR = PROJECT_ROOT / 'artifacts' / 'models' / 'checkpoints'

PROFILE_FILE_MAP = {
    'pc': PROFILES_DIR / 'pc.json',
    'phone': PROFILES_DIR / 'phone.json',
    'tablet': PROFILES_DIR / 'tablet.json',
}
ALLOWED_PROFILE_TARGETS = {key: path.resolve() for key, path in PROFILE_FILE_MAP.items()}


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
    for path in sorted((PROJECT_ROOT / 'artifacts').glob('**/*.json')):
        if path.name.endswith('.eval-report.json') or path.name in {'evaluation-report.json', 'training-history.json'}:
            results.append({'path': _safe_relative(path), 'name': path.name, 'type': 'json'})
    return results


def build_artifacts_payload():
    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'profiles': _discover_profiles(),
        'candidates': _discover_candidates(),
        'checkpoints': _discover_checkpoints(),
        'reports': _discover_reports(),
    }


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
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in {'/api/model-manager/promote', '/api/model-manager/evaluate'}:
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
