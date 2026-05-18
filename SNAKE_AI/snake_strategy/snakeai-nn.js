import { DIRECTIONS } from '../snake_core/engine.js';
import { buildSnakeAIFeatures } from '../snake_inference/features.js';
import { rankOutputDirections, runModel, validateModel } from '../snake_inference/model.js';

const DEFAULT_MODEL_URL = './snake_models/snakeai-default.json';
const modelCache = new Map();

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findPath(snapshot, start, target, engine, isTargetTail = false) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return null;
    }

    const open = [{ cell: start, g: 0, h: manhattan(start, target), parent: null, dir: null }];
    const closed = new Set();
    const getKey = (cell) => `${cell.x},${cell.y}`;

    while (open.length > 0) {
        open.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.h - b.h);
        const current = open.shift();
        const key = getKey(current.cell);
        if (current.cell.x === target.x && current.cell.y === target.y) {
            const path = [];
            let cursor = current;
            while (cursor.parent) {
                path.unshift(cursor.dir);
                cursor = cursor.parent;
            }
            return path;
        }

        if (closed.has(key)) continue;
        closed.add(key);

        for (const dir of Object.values(DIRECTIONS)) {
            const vector = engine.getDirectionVector(dir);
            const nextCell = { x: current.cell.x + vector.x, y: current.cell.y + vector.y };
            const nextKey = getKey(nextCell);
            if (closed.has(nextKey)) continue;

            let walkable = engine.isCellWalkable(nextCell, snapshot, { allowTail: true });
            if (!walkable && isTargetTail && snapshot.body.length > 0) {
                const tail = snapshot.body[0];
                if (tail.x === nextCell.x && tail.y === nextCell.y) {
                    walkable = true;
                }
            }

            if (walkable) {
                open.push({
                    cell: nextCell,
                    g: current.g + 1,
                    h: manhattan(nextCell, target),
                    parent: current,
                    dir,
                });
            }
        }
    }

    return null;
}

function getSafeFallbackMove(snapshot, engine) {
    const head = snapshot.head || snapshot.body[snapshot.body.length - 1];
    if (!head) return null;

    let bestMove = null;
    let maxSpace = -1;

    for (const dir of Object.values(DIRECTIONS)) {
        const vector = engine.getDirectionVector(dir);
        const next = { x: head.x + vector.x, y: head.y + vector.y };
        if (!engine.isCellWalkable(next, snapshot, { allowTail: true })) continue;

        const simulated = engine.simulateStep(snapshot, dir);
        if (!simulated.ok) continue;

        const simHead = simulated.snapshot.body[simulated.snapshot.body.length - 1];
        const simTail = simulated.snapshot.body[0];
        const pathToTail = findPath(simulated.snapshot, simHead, simTail, engine, true);
        if (simulated.snapshot.length <= 2 || pathToTail) {
            const space = pathToTail ? pathToTail.length : 1;
            if (space > maxSpace) {
                maxSpace = space;
                bestMove = dir;
            }
        }
    }

    if (bestMove) return bestMove;

    for (const dir of Object.values(DIRECTIONS)) {
        const vector = engine.getDirectionVector(dir);
        const next = { x: head.x + vector.x, y: head.y + vector.y };
        if (engine.isCellWalkable(next, snapshot, { allowTail: true })) {
            return dir;
        }
    }

    return null;
}

async function loadModel(modelUrl) {
    if (!modelCache.has(modelUrl)) {
        const promise = fetch(modelUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load SnakeAI model: ${response.status}`);
                }
                return response.json();
            })
            .then((model) => validateModel(model));
        modelCache.set(modelUrl, promise);
    }
    return modelCache.get(modelUrl);
}

export function createSnakeAIStrategy(engine, options = {}) {
    const modelUrl = options.modelUrl || DEFAULT_MODEL_URL;
    let model = null;
    let modelError = null;
    let pending = loadModel(modelUrl)
        .then((loaded) => {
            model = loaded;
            modelError = null;
            return loaded;
        })
        .catch((error) => {
            modelError = error;
            throw error;
        });

    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];
            if (!head) {
                engine.step();
                return;
            }

            let nextDirection = null;

            if (model) {
                try {
                    const features = buildSnakeAIFeatures(state, model);
                    const { output } = runModel(model, features);
                    const rankedDirections = rankOutputDirections(model, output);

                    for (const candidate of rankedDirections) {
                        if (!engine.canMove(candidate.direction)) continue;
                        const simulated = engine.simulateStep(state, candidate.direction);
                        if (!simulated.ok) continue;
                        const followup = Object.values(DIRECTIONS).some((direction) => engine.simulateStep(simulated.snapshot, direction).ok);
                        if (followup || simulated.snapshot.length <= 2) {
                            nextDirection = candidate.direction;
                            break;
                        }
                    }
                } catch (error) {
                    console.error('[SNAKE_AI] SnakeAI inference failed', error);
                    modelError = error;
                }
            }

            if (!nextDirection) {
                nextDirection = getSafeFallbackMove(state, engine);
            }

            if (nextDirection && engine.setDirection(nextDirection) && engine.step()) {
                return;
            }

            engine.reset();
        },
        getMeta() {
            return {
                strategy: 'snakeai-nn',
                modelUrl,
                loaded: Boolean(model),
                loading: Boolean(pending && !model),
                error: modelError ? modelError.message : null,
            };
        },
    };
}
