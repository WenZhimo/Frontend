import { buildSnakeAIFeatures } from '../snake_inference/features.js';
import { rankOutputDirections, runModel, validateModel } from '../snake_inference/model.js';

async function loadModel(modelUrl) {
    return fetch(modelUrl, { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load SnakeAI model: ${response.status}`);
            }
            return response.json();
        })
        .then((model) => validateModel(model));
}

export function createSnakeAIStrategy(engine, options = {}) {
    const modelUrl = options.modelUrl || './snake_models/profiles/pc.json';
    const profileId = options.profileId || 'pc';
    let model = null;
    let modelError = null;
    let pending = null;

    async function ensureModel() {
        if (model) return model;
        if (pending) return pending;
        pending = loadModel(modelUrl)
            .then((loaded) => {
                model = loaded;
                modelError = null;
                return loaded;
            })
            .catch((error) => {
                modelError = error;
                throw error;
            });
        return pending;
    }

    return {
        tick() {
            const state = engine.getState();
            const head = state.head || state.body[state.body.length - 1];
            if (!head) {
                engine.step();
                return;
            }

            if (!model) {
                ensureModel().catch(() => null);
                return;
            }

            try {
                const features = buildSnakeAIFeatures(state, model);
                const { output } = runModel(model, features);
                const rankedDirections = rankOutputDirections(model, output);

                for (const candidate of rankedDirections) {
                    if (!engine.canMove(candidate.direction)) continue;
                    if (!engine.setDirection(candidate.direction)) continue;
                    if (engine.step()) {
                        return;
                    }
                }
            } catch (error) {
                console.error('[SNAKE_AI] SnakeAI inference failed', error);
                modelError = error;
            }

            engine.reset();
        },
        getMeta() {
            return {
                strategy: 'snakeai-nn',
                modelUrl,
                profileId,
                loaded: Boolean(model),
                loading: Boolean(pending && !model),
                error: modelError ? modelError.message : null,
            };
        },
    };
}
