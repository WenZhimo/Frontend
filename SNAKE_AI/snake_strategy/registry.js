import { createAStarSafeStrategy } from './astar-safe.js';
import { createHamiltonianCycleStrategy } from './hamiltonian-cycle.js';
import { createHamiltonianShortcutStrategy } from './hamiltonian-shortcuts.js';
import { createSnakeAIStrategy } from './snakeai-nn.js';

export const STRATEGY_MANIFEST = {
    'astar-safe': {
        label: 'A* SAFE',
        description: '使用最短路径去苹果，虚拟模拟吃完后的未来状态，并检查蛇头是否仍能到达蛇尾；若不安全则转入追尾保命模式。',
        factory: createAStarSafeStrategy,
    },
    'hamiltonian-cycle': {
        label: 'HAMILTONIAN',
        description: '严格沿哈密尔顿环巡航，绝对稳定，但遇到近处苹果也不会主动抄近路。',
        factory: createHamiltonianCycleStrategy,
    },
    'hamiltonian-shortcuts': {
        label: 'HAMILTONIAN+',
        description: '在哈密尔顿环基础上尝试安全抄近道，只要不会破坏拓扑安全，就会更积极地接近苹果。',
        factory: createHamiltonianShortcutStrategy,
    },
    'snakeai-nn': {
        label: 'SNAKEAI NN',
        description: '使用 SnakeAI 风格的 32 维观察输入与前馈神经网络打分动作，再叠加保命兜底，作为可训练的神经决策策略。',
        factory: createSnakeAIStrategy,
    },
};

export function listStrategies() {
    return Object.entries(STRATEGY_MANIFEST).map(([id, meta]) => ({ id, ...meta }));
}

export function pickRandomStrategy(ids = Object.keys(STRATEGY_MANIFEST)) {
    const available = ids.filter((id) => STRATEGY_MANIFEST[id]);
    if (available.length === 0) {
        throw new Error('No available snake strategies');
    }
    const index = Math.floor(Math.random() * available.length);
    return available[index];
}

export async function createStrategyById(id, engine, options = {}) {
    const meta = STRATEGY_MANIFEST[id];
    if (!meta) {
        throw new Error(`Unknown snake strategy: ${id}`);
    }

    return {
        id,
        label: meta.label,
        description: meta.description,
        runner: meta.factory(engine, options),
    };
}
