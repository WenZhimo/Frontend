from __future__ import annotations

import numpy as np


def simulated_binary_crossover(parent1, parent2, eta):
    rand = np.random.random(parent1.shape)
    gamma = np.empty(parent1.shape)
    gamma[rand <= 0.5] = (2.0 * rand[rand <= 0.5]) ** (1.0 / (eta + 1.0))
    gamma[rand > 0.5] = (1.0 / (2.0 * (1.0 - rand[rand > 0.5]))) ** (1.0 / (eta + 1.0))
    child1 = 0.5 * ((1.0 + gamma) * parent1 + (1.0 - gamma) * parent2)
    child2 = 0.5 * ((1.0 - gamma) * parent1 + (1.0 + gamma) * parent2)
    return child1, child2


def single_point_binary_crossover(parent1, parent2, major='r'):
    child1 = parent1.copy()
    child2 = parent2.copy()
    if parent1.ndim == 1:
        point = np.random.randint(1, parent1.shape[0])
        child1[point:], child2[point:] = child2[point:].copy(), child1[point:].copy()
        return child1, child2

    rows, cols = parent1.shape
    if major == 'c':
        point = np.random.randint(1, cols)
        child1[:, point:], child2[:, point:] = child2[:, point:].copy(), child1[:, point:].copy()
    else:
        point = np.random.randint(1, rows)
        child1[point:, :], child2[point:, :] = child2[point:, :].copy(), child1[point:, :].copy()
    return child1, child2
