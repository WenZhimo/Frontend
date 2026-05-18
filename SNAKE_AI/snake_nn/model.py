from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np


@dataclass
class FeedForwardNetwork:
    input_size: int = 32
    hidden_sizes: tuple[int, int] = (20, 12)
    output_size: int = 4

    def __post_init__(self) -> None:
        h1, h2 = self.hidden_sizes
        self.weights: Dict[str, np.ndarray] = {
            "W1": np.random.uniform(-1, 1, (self.input_size, h1)),
            "b1": np.random.uniform(-1, 1, (h1,)),
            "W2": np.random.uniform(-1, 1, (h1, h2)),
            "b2": np.random.uniform(-1, 1, (h2,)),
            "W3": np.random.uniform(-1, 1, (h2, self.output_size)),
            "b3": np.random.uniform(-1, 1, (self.output_size,)),
        }

    @classmethod
    def from_weights(cls, weights: Dict[str, np.ndarray]) -> "FeedForwardNetwork":
        network = cls()
        network.weights = {key: np.array(value, dtype=np.float64) for key, value in weights.items()}
        return network

    def clone(self) -> "FeedForwardNetwork":
        return FeedForwardNetwork.from_weights(self.weights)

    def mutate(self, mutation_rate: float, mutation_scale: float) -> None:
        for key, value in self.weights.items():
            mask = np.random.random(value.shape) < mutation_rate
            noise = np.random.normal(0.0, mutation_scale, value.shape)
            self.weights[key] = value + mask * noise

    def forward(self, features: List[float]) -> np.ndarray:
        x = np.asarray(features, dtype=np.float64)
        z1 = np.maximum(0.0, x @ self.weights["W1"] + self.weights["b1"])
        z2 = np.maximum(0.0, z1 @ self.weights["W2"] + self.weights["b2"])
        z3 = z2 @ self.weights["W3"] + self.weights["b3"]
        return 1.0 / (1.0 + np.exp(-z3))

    def to_serializable(self) -> Dict[str, List[List[float]] | List[float]]:
        serializable: Dict[str, List[List[float]] | List[float]] = {}
        for key, value in self.weights.items():
            serializable[key] = value.tolist()
        return serializable
