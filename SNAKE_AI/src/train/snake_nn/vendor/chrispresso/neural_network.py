from __future__ import annotations

import numpy as np


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def tanh(x):
    return np.tanh(x)


def relu(x):
    return np.maximum(0.0, x)


def leaky_relu(x):
    return np.where(x > 0, x, x * 0.01)


def linear(x):
    return x


class FeedForwardNetwork:
    def __init__(self, layer_nodes, hidden_activation='relu', output_activation='sigmoid', seed=None):
        if seed is not None:
            np.random.seed(seed)
        self.layer_nodes = list(layer_nodes)
        self.hidden_activation = get_activation_by_name(hidden_activation)
        self.output_activation = get_activation_by_name(output_activation)
        self.params = {}
        self.out = None

        for layer in range(1, len(self.layer_nodes)):
            rows = self.layer_nodes[layer]
            cols = self.layer_nodes[layer - 1]
            self.params[f'W{layer}'] = np.random.uniform(-1, 1, (rows, cols))
            self.params[f'b{layer}'] = np.random.uniform(-1, 1, (rows, 1))

    def feed_forward(self, X):
        activation = np.asarray(X, dtype=np.float64).reshape((-1, 1))
        last_index = len(self.layer_nodes) - 1
        for layer in range(1, len(self.layer_nodes)):
            weights = self.params[f'W{layer}']
            bias = self.params[f'b{layer}']
            z = weights @ activation + bias
            if layer == last_index:
                activation = self.output_activation(z)
            else:
                activation = self.hidden_activation(z)
            self.params[f'A{layer}'] = activation
        self.out = activation
        return activation


def get_activation_by_name(name):
    table = {
        'sigmoid': sigmoid,
        'tanh': tanh,
        'relu': relu,
        'leaky_relu': leaky_relu,
        'linear': linear,
    }
    if name not in table:
        raise KeyError(f'Unknown activation: {name}')
    return table[name]
