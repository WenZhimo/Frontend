from __future__ import annotations

import random


def elitism_selection(population, num_individuals):
    return sorted(population.individuals, key=lambda individual: individual.fitness, reverse=True)[:num_individuals]


def roulette_wheel_selection(population, num_individuals):
    selected = []
    total_fitness = sum(individual.fitness for individual in population.individuals)
    if total_fitness <= 0:
        return random.sample(population.individuals, num_individuals)

    for _ in range(num_individuals):
        pick = random.uniform(0, total_fitness)
        current = 0.0
        for individual in population.individuals:
            current += individual.fitness
            if current >= pick:
                selected.append(individual)
                break
    return selected
