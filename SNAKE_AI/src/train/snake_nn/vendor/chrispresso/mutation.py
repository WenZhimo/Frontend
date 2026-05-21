from __future__ import annotations

import numpy as np


def gaussian_mutation(chromosome, mutation_rate, scale=0.2):
    mask = np.random.random(chromosome.shape) < mutation_rate
    chromosome += mask * np.random.normal(0.0, scale, chromosome.shape)


def random_uniform_mutation(chromosome, mutation_rate, low, high):
    mask = np.random.random(chromosome.shape) < mutation_rate
    chromosome[mask] = np.random.uniform(low, high, np.count_nonzero(mask))
