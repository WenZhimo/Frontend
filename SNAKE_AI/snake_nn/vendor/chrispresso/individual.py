from __future__ import annotations


class Individual:
    @property
    def fitness(self):
        return self._fitness

    def calculate_fitness(self):
        raise NotImplementedError
