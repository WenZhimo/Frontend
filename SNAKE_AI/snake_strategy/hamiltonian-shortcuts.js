import { DIRECTIONS } from '../snake_core/engine.js';
import { buildCycleCache, chooseFallbackDirection, cycleDistance, getDirectionFromTo } from './hamiltonian-core.js';

export function createHamiltonianShortcutStrategy(engine) {
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

        const headIndex = cycleCache.orderMap.get(`${head.x},${head.y}`);
        const tail = state.body[0];
        const tailIndex = cycleCache.orderMap.get(`${tail.x},${tail.y}`);
        const food = state.food;
        const foodIndex = food ? cycleCache.orderMap.get(`${food.x},${food.y}`) : null;
        const defaultNextCell = cycleCache.nextMap.get(`${head.x},${head.y}`);
        let chosenDirection = getDirectionFromTo(head, defaultNextCell);

        if (food && foodIndex !== undefined) {
            const freeSpan = cycleDistance(headIndex, tailIndex, cycleCache.total);
            const currentFoodDistance = cycleDistance(headIndex, foodIndex, cycleCache.total);
            let bestCandidate = null;

            for (const direction of Object.values(DIRECTIONS)) {
                if (!engine.canMove(direction)) continue;
                const vector = engine.getDirectionVector(direction);
                const next = { x: head.x + vector.x, y: head.y + vector.y };
                const nextIndex = cycleCache.orderMap.get(`${next.x},${next.y}`);
                if (nextIndex === undefined) continue;

                const advance = cycleDistance(headIndex, nextIndex, cycleCache.total);
                if (advance === 0 || advance >= freeSpan) continue;

                const distanceToFood = cycleDistance(nextIndex, foodIndex, cycleCache.total);
                if (distanceToFood > currentFoodDistance) continue;

                if (!bestCandidate || distanceToFood < bestCandidate.distanceToFood || (distanceToFood === bestCandidate.distanceToFood && advance > bestCandidate.advance)) {
                    bestCandidate = {
                        direction,
                        distanceToFood,
                        advance,
                    };
                }
            }

            if (bestCandidate) {
                chosenDirection = bestCandidate.direction;
            }
        }

        if (chosenDirection && engine.setDirection(chosenDirection) && engine.step()) {
            return;
        }

        engine.reset();
    }

    return {
        tick,
        getMeta() {
            return { strategy: 'hamiltonian-shortcuts' };
        },
    };
}
