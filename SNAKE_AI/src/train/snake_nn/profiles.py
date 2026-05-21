from __future__ import annotations

from train.snake_nn.paths import CHECKPOINTS_ROOT, EXPORTS_ROOT, PROFILES_DIR, relative_to_project

DEVICE_BOARD_PROFILES = {
    'phone': {
        'label': '手机 19.5:9',
        'board_size_pool': [(26, 12)],
        'default_model_path': relative_to_project(PROFILES_DIR / 'phone.json'),
        'export_dir': relative_to_project(EXPORTS_ROOT / 'phone'),
        'checkpoint_dir': relative_to_project(CHECKPOINTS_ROOT / 'phone'),
    },
    'pc': {
        'label': 'PC 16:9',
        'board_size_pool': [(32, 18)],
        'default_model_path': relative_to_project(PROFILES_DIR / 'pc.json'),
        'export_dir': relative_to_project(EXPORTS_ROOT / 'pc'),
        'checkpoint_dir': relative_to_project(CHECKPOINTS_ROOT / 'pc'),
    },
    'tablet': {
        'label': '平板 4:3',
        'board_size_pool': [(32, 24)],
        'default_model_path': relative_to_project(PROFILES_DIR / 'tablet.json'),
        'export_dir': relative_to_project(EXPORTS_ROOT / 'tablet'),
        'checkpoint_dir': relative_to_project(CHECKPOINTS_ROOT / 'tablet'),
    },
}

PROFILE_FILE_MAP = {
    profile_id: PROFILES_DIR / f'{profile_id}.json'
    for profile_id in DEVICE_BOARD_PROFILES
}


def default_model_path(profile_id: str):
    return PROFILE_FILE_MAP[profile_id]
