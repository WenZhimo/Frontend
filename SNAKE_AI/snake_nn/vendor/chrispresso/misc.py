from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Point:
    x: int
    y: int

    def copy(self) -> 'Point':
        return Point(self.x, self.y)

    def to_dict(self):
        return {'x': self.x, 'y': self.y}

    @classmethod
    def from_dict(cls, data):
        return cls(int(data['x']), int(data['y']))


@dataclass(frozen=True)
class Slope:
    rise: int
    run: int


VISION_16 = (
    Slope(-1, 0), Slope(-2, 1), Slope(-1, 1), Slope(-1, 2),
    Slope(0, 1), Slope(1, 2), Slope(1, 1), Slope(2, 1),
    Slope(1, 0), Slope(2, -1), Slope(1, -1), Slope(1, -2),
    Slope(0, -1), Slope(-1, -2), Slope(-1, -1), Slope(-2, -1),
)

VISION_8 = tuple([VISION_16[i] for i in range(len(VISION_16)) if i % 2 == 0])
