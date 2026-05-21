from __future__ import annotations


class Population:
    def __init__(self, individuals):
        self.individuals = list(individuals)

    @property
    def num_individuals(self):
        return len(self.individuals)

    @property
    def average_fitness(self):
        if not self.individuals:
            return 0.0
        return sum(individual.fitness for individual in self.individuals) / len(self.individuals)

    @property
    def fittest_individual(self):
        return max(self.individuals, key=lambda individual: individual.fitness)
