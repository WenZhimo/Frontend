from __future__ import annotations

import json
from pathlib import Path


def snake_to_browser_payload(snake, settings, metadata):
    weights = {}
    for layer in range(1, len(snake.network.layer_nodes)):
        weights[f'W{layer}'] = snake.network.params[f'W{layer}'].T.tolist()
        weights[f'b{layer}'] = snake.network.params[f'b{layer}'].reshape(-1).tolist()

    return {
        'inputSize': snake.network.layer_nodes[0],
        'hiddenSizes': list(settings['hidden_network_architecture']),
        'outputSize': snake.network.layer_nodes[-1],
        'hiddenActivation': settings['hidden_layer_activation'],
        'outputActivation': settings['output_layer_activation'],
        'rayOrder': [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]],
        'featureOrder': ['wall', 'apple', 'self'],
        'directionOrder': ['north', 'south', 'west', 'east'],
        'outputDirectionOrder': ['north', 'south', 'west', 'east'],
        'metadata': metadata,
        'weights': weights,
    }


def write_browser_model(snake, settings, metadata, export_path):
    export_file = Path(export_path)
    export_file.parent.mkdir(parents=True, exist_ok=True)
    payload = snake_to_browser_payload(snake, settings, metadata)
    export_file.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    return export_file
