from __future__ import annotations

import json
import os
import random
from collections import deque
from typing import Any, Dict, Optional, Tuple, Union

import numpy as np

from .individual import Individual
from .misc import Point, Slope, VISION_8
from .neural_network import FeedForwardNetwork


class Vision:
    def __init__(self):
        self.dist_to_wall = 0.0
        self.dist_to_apple = 0.0
        self.dist_to_self = 0.0


class Snake(Individual):
    possible_directions = ('u', 'd', 'l', 'r')

    def __init__(
        self,
        board_size,
        chromosome=None,
        start_pos=None,
        apple_seed=None,
        initial_velocity=None,
        starting_direction=None,
        hidden_layer_architecture=None,
        hidden_activation='relu',
        output_activation='sigmoid',
        lifespan=np.inf,
        apple_and_self_vision='binary',
        starvation_limit=100,
    ):
        self.board_size = tuple(board_size)
        self.hidden_layer_architecture = list(hidden_layer_architecture or [20, 12])
        self.hidden_activation = hidden_activation
        self.output_activation = output_activation
        self.apple_and_self_vision = apple_and_self_vision
        self.starvation_limit = starvation_limit
        self.lifespan = lifespan
        self.score = 0
        self._fitness = 0.0
        self._frames = 0
        self._frames_since_last_apple = 0
        self.is_alive = True
        self._vision_type = VISION_8
        self._vision = [Vision() for _ in self._vision_type]
        self.vision_as_array = np.zeros((len(self._vision_type) * 3 + 8, 1), dtype=np.float64)

        center = Point(self.board_size[0] // 2, self.board_size[1] // 2)
        self.start_pos = start_pos or center
        self.initial_velocity = initial_velocity or 'r'
        self.starting_direction = starting_direction or self.initial_velocity
        self.direction = self.starting_direction
        self.tail_direction = self.starting_direction
        self.apple_seed = apple_seed if apple_seed is not None else random.randrange(10_000_000)
        self.rand_apple = random.Random(self.apple_seed)

        head = self.start_pos.copy()
        if self.starting_direction == 'r':
            body = [Point(head.x, head.y), Point(head.x - 1, head.y)]
        elif self.starting_direction == 'l':
            body = [Point(head.x, head.y), Point(head.x + 1, head.y)]
        elif self.starting_direction == 'u':
            body = [Point(head.x, head.y), Point(head.x, head.y + 1)]
        else:
            body = [Point(head.x, head.y), Point(head.x, head.y - 1)]
        self.snake_array = deque(body)
        self._body_locations = set(body)

        network_architecture = [len(self._vision_type) * 3 + 8] + self.hidden_layer_architecture + [4]
        self.network = FeedForwardNetwork(network_architecture, hidden_activation, output_activation)
        if chromosome:
            self.network.params = {key: np.array(value, dtype=np.float64) for key, value in chromosome.items()}
        self.generate_apple()

    def _within_wall(self, point: Point) -> bool:
        return 0 <= point.x < self.board_size[0] and 0 <= point.y < self.board_size[1]

    def _is_body_location(self, point: Point) -> bool:
        return point in self._body_locations

    def _is_apple_location(self, point: Point) -> bool:
        return self.apple_location == point

    def _is_valid(self, point: Point) -> bool:
        if not self._within_wall(point):
            return False
        if point == self.snake_array[-1]:
            return True
        return point not in self._body_locations

    def generate_apple(self):
        occupied = {(point.x, point.y) for point in self.snake_array}
        while True:
            candidate = Point(self.rand_apple.randrange(self.board_size[0]), self.rand_apple.randrange(self.board_size[1]))
            if (candidate.x, candidate.y) not in occupied:
                self.apple_location = candidate
                return

    def look_in_direction(self, slope: Slope) -> Tuple[Vision, Dict[str, Optional[Dict[str, int]]]]:
        dist_to_apple = np.inf
        dist_to_self = np.inf
        position = self.snake_array[0].copy()
        total_distance = 0.0
        position = Point(position.x + slope.run, position.y + slope.rise)
        total_distance += 1.0
        body_found = False
        food_found = False
        wall_location = None
        apple_location = None
        self_location = None

        while self._within_wall(position):
            if not body_found and self._is_body_location(position):
                dist_to_self = total_distance
                self_location = position.copy()
                body_found = True
            if not food_found and self._is_apple_location(position):
                dist_to_apple = total_distance
                apple_location = position.copy()
                food_found = True

            wall_location = position.copy()
            position = Point(position.x + slope.run, position.y + slope.rise)
            total_distance += 1.0

        vision = Vision()
        vision.dist_to_wall = 1.0 / total_distance
        if self.apple_and_self_vision == 'binary':
            vision.dist_to_apple = 1.0 if dist_to_apple != np.inf else 0.0
            vision.dist_to_self = 1.0 if dist_to_self != np.inf else 0.0
        else:
            vision.dist_to_apple = 0.0 if dist_to_apple == np.inf else 1.0 / dist_to_apple
            vision.dist_to_self = 0.0 if dist_to_self == np.inf else 1.0 / dist_to_self

        drawable = {
            'wall_location': wall_location.to_dict() if wall_location else None,
            'apple_location': apple_location.to_dict() if apple_location else None,
            'self_location': self_location.to_dict() if self_location else None,
        }
        return vision, drawable

    def look(self):
        for index, slope in enumerate(self._vision_type):
            vision, _ = self.look_in_direction(slope)
            self._vision[index] = vision

        vision_values = []
        for vision in self._vision:
            vision_values.extend([vision.dist_to_wall, vision.dist_to_apple, vision.dist_to_self])

        direction_one_hot = [1.0 if self.direction == option else 0.0 for option in self.possible_directions]
        tail_one_hot = [1.0 if self.tail_direction == option else 0.0 for option in self.possible_directions]
        values = np.array(vision_values + direction_one_hot + tail_one_hot, dtype=np.float64).reshape((-1, 1))
        self.vision_as_array = values

    def update(self):
        if self.is_alive:
            self._frames += 1
            self.look()
            self.network.feed_forward(self.vision_as_array)
            self.direction = self.possible_directions[int(np.argmax(self.network.out))]
            return True
        return False

    def move(self) -> bool:
        if not self.is_alive:
            return False

        direction = self.direction[0].lower()
        head = self.snake_array[0]
        if direction == 'u':
            next_pos = Point(head.x, head.y - 1)
        elif direction == 'd':
            next_pos = Point(head.x, head.y + 1)
        elif direction == 'r':
            next_pos = Point(head.x + 1, head.y)
        else:
            next_pos = Point(head.x - 1, head.y)

        if self._is_valid(next_pos):
            if next_pos == self.snake_array[-1]:
                self.snake_array.pop()
                self.snake_array.appendleft(next_pos)
            elif next_pos == self.apple_location:
                self.score += 1
                self._frames_since_last_apple = 0
                self.snake_array.appendleft(next_pos)
                self._body_locations.add(next_pos)
                self.generate_apple()
            else:
                self.snake_array.appendleft(next_pos)
                self._body_locations.add(next_pos)
                tail = self.snake_array.pop()
                self._body_locations.remove(tail)

            if len(self.snake_array) > 1:
                tail = self.snake_array[-1]
                next_tail = self.snake_array[-2]
                dx = next_tail.x - tail.x
                dy = next_tail.y - tail.y
                if dx == 1:
                    self.tail_direction = 'r'
                elif dx == -1:
                    self.tail_direction = 'l'
                elif dy == 1:
                    self.tail_direction = 'd'
                elif dy == -1:
                    self.tail_direction = 'u'

            self._frames_since_last_apple += 1
            if self._frames_since_last_apple > self.starvation_limit:
                self.is_alive = False
            return True

        self.is_alive = False
        return False

    def calculate_fitness(self):
        self._fitness = (self._frames) + ((2 ** self.score) + (self.score ** 2.1) * 500) - (((0.25 * self._frames) ** 1.3) * (self.score ** 1.2))
        self._fitness = max(self._fitness, 0.1)


def save_snake(population_folder: str, individual_name: str, snake: Snake, settings: Dict[str, Any]) -> None:
    os.makedirs(population_folder, exist_ok=True)
    settings_file = os.path.join(population_folder, 'settings.json')
    if not os.path.exists(settings_file):
        with open(settings_file, 'w', encoding='utf-8') as out:
            json.dump(settings, out, sort_keys=True, indent=4)

    individual_dir = os.path.join(population_folder, individual_name)
    os.makedirs(individual_dir, exist_ok=True)
    constructor = {
        'board_size': list(snake.board_size),
        'start_pos': snake.start_pos.to_dict(),
        'apple_seed': snake.apple_seed,
        'initial_velocity': snake.initial_velocity,
        'starting_direction': snake.starting_direction,
        'lifespan': snake.lifespan,
    }
    with open(os.path.join(individual_dir, 'constructor_params.json'), 'w', encoding='utf-8') as out:
        json.dump(constructor, out, sort_keys=True, indent=4)

    for layer in range(1, len(snake.network.layer_nodes)):
        np.save(os.path.join(individual_dir, f'W{layer}'), snake.network.params[f'W{layer}'])
        np.save(os.path.join(individual_dir, f'b{layer}'), snake.network.params[f'b{layer}'])


def load_snake(population_folder: str, individual_name: str, settings: Optional[Union[Dict[str, Any], str]] = None) -> Snake:
    if not settings:
        with open(os.path.join(population_folder, 'settings.json'), 'r', encoding='utf-8') as fp:
            settings = json.load(fp)
    elif isinstance(settings, str):
        with open(settings, 'r', encoding='utf-8') as fp:
            settings = json.load(fp)

    params = {}
    individual_dir = os.path.join(population_folder, individual_name)
    for fname in os.listdir(individual_dir):
        if fname.endswith('.npy'):
            params[fname[:-4]] = np.load(os.path.join(individual_dir, fname))

    with open(os.path.join(individual_dir, 'constructor_params.json'), 'r', encoding='utf-8') as fp:
        constructor_params = json.load(fp)

    board_size = tuple(constructor_params.get('board_size', settings['board_size']))
    lifespan = constructor_params.get('lifespan', settings['lifespan'])

    return Snake(
        board_size,
        chromosome=params,
        start_pos=Point.from_dict(constructor_params['start_pos']),
        apple_seed=constructor_params['apple_seed'],
        initial_velocity=constructor_params['initial_velocity'],
        starting_direction=constructor_params['starting_direction'],
        hidden_layer_architecture=settings['hidden_network_architecture'],
        hidden_activation=settings['hidden_layer_activation'],
        output_activation=settings['output_layer_activation'],
        lifespan=lifespan,
        apple_and_self_vision=settings['apple_and_self_vision'],
        starvation_limit=settings.get('starvation_limit', 100),
    )
