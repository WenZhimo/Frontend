import { buildCycleCache, chooseFallbackDirection, getDirectionFromTo } from './hamiltonian-core.js';

export function createHamiltonianCycleStrategy(engine) {
    let cache = null;

    function ensureCache(state) {
        const signature = `${state.columns}x${state.rows}`;
        if (cache && cache.signature === signature) return cache;
        cache = buildCycleCache(state.columns, state.rows);
        return cache;
    }

    function tick() {
        const state = engine.getState();
        const head = state.head || state.body[state.body.length - 1];
        if (!head) {
            engine.step();
            return;
        }

        const cycleCache = ensureCache(state);
        if (!cycleCache) {
            console.warn('[SNAKE_AI] Hamiltonian cycle unavailable for current grid, using fallback direction');
            const fallbackDirection = chooseFallbackDirection(engine, state);
            if (fallbackDirection && engine.setDirection(fallbackDirection) && engine.step()) {
                return;
            }
            engine.reset();
            return;
        }

        const nextCell = cycleCache.nextMap.get(`${head.x},${head.y}`);
        const nextDirection = getDirectionFromTo(head, nextCell);
        if (nextDirection && engine.setDirection(nextDirection) && engine.step()) {
            return;
        }

        engine.reset();
    }

    return {
        tick,
        getMeta() {
            return { strategy: 'hamiltonian-cycle' };
        },
    };
}
