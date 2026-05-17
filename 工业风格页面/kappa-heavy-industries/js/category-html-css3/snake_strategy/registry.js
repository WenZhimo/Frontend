import { createAStarSafeStrategy } from './astar-safe.js';
import { createHamiltonianCycleStrategy } from './hamiltonian-cycle.js';
import { createHamiltonianShortcutStrategy } from './hamiltonian-shortcuts.js';

const registry = {
    'astar-safe': createAStarSafeStrategy,
    'hamiltonian-cycle': createHamiltonianCycleStrategy,
    'hamiltonian-shortcuts': createHamiltonianShortcutStrategy,
};

export function createStrategyById(id, engine, options = {}) {
    const factory = registry[id];
    if (!factory) {
        throw new Error(`Unknown snake strategy: ${id}`);
    }
    return factory(engine, options);
}

export function pickRandomStrategy(ids = Object.keys(registry)) {
    const available = ids.filter((id) => registry[id]);
    if (available.length === 0) {
        throw new Error('No available snake strategies');
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index];
}

export function listStrategies() {
    return Object.keys(registry);
}
