from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

RAY_ORDER: List[Tuple[int, int]] = [
    (-1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
    (1, 0),
    (1, -1),
    (0, -1),
    (-1, -1),
]

DIRECTION_ORDER = ["north", "south", "west", "east"]
DIRECTION_VECTORS = {
    "north": (0, -1),
    "east": (1, 0),
    "south": (0, 1),
    "west": (-1, 0),
}


def _infer_tail_direction(body: Sequence[Dict[str, int]], fallback_direction: str) -> str:
    if len(body) < 2:
        return fallback_direction

    tail = body[0]
    neck = body[1]
    dx = neck["x"] - tail["x"]
    dy = neck["y"] - tail["y"]

    for direction, (vx, vy) in DIRECTION_VECTORS.items():
        if vx == dx and vy == dy:
            return direction

    return fallback_direction


def _one_hot(direction: str) -> List[float]:
    return [1.0 if direction == candidate else 0.0 for candidate in DIRECTION_ORDER]


def build_feature_vector(state: Dict[str, object]) -> List[float]:
    body = state.get("body") or []
    head = state.get("head") or (body[-1] if body else None)
    food = state.get("food")
    direction = state.get("direction") or "east"
    columns = int(state["columns"])
    rows = int(state["rows"])

    if not head:
        features = [0.0] * 24
        features.extend(_one_hot(direction))
        features.extend(_one_hot(direction))
        return features

    body_cells = {(segment["x"], segment["y"]) for segment in body[:-1]}
    hx = int(head["x"])
    hy = int(head["y"])
    fx = int(food["x"]) if food else None
    fy = int(food["y"]) if food else None

    features: List[float] = []

    for dx, dy in RAY_ORDER:
        distance = 0
        apple_signal = 0.0
        self_signal = 0.0
        x = hx
        y = hy

        while True:
            x += dx
            y += dy
            distance += 1

            if x < 0 or y < 0 or x >= columns or y >= rows:
                features.append(1.0 / distance)
                features.append(apple_signal)
                features.append(self_signal)
                break

            if apple_signal == 0.0 and fx == x and fy == y:
                apple_signal = 1.0 / distance

            if self_signal == 0.0 and (x, y) in body_cells:
                self_signal = 1.0 / distance

    tail_direction = _infer_tail_direction(body, direction)
    features.extend(_one_hot(direction))
    features.extend(_one_hot(tail_direction))
    return features
