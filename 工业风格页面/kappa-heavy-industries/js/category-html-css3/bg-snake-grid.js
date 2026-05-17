import { createSnakeEngine } from './snake_core/engine.js';
import { createStrategyById, pickRandomStrategy } from './snake_strategy/registry.js';

const HOST_SELECTOR = '.category-html-bg-host[data-html-bg="snake-grid"]';
const SHELL_SELECTOR = '.category-html-shell';
const BASE_DPR_CAP = 1.4;
const TARGET_CELL_SIZE = 52;
const MIN_COLUMNS = 10;
const MIN_ROWS = 8;
const GROWTH_STEP = 1;
const TICK_INTERVAL = 150;
const STRATEGY_POOL = ['astar-safe', 'hamiltonian-cycle', 'hamiltonian-shortcuts'];

let shell = null;
let host = null;
let canvas = null;
let ctx = null;
let resizeObserver = null;
let frameId = null;
let running = false;
let tickAccumulator = 0;
let lastFrameTime = 0;
let engine = null;
let strategy = null;
let cellSize = TARGET_CELL_SIZE;

function getHostSize() {
    const rect = host.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
    };
}

function computeGrid(width, height) {
    const columns = Math.max(MIN_COLUMNS, Math.floor(width / TARGET_CELL_SIZE));
    const rows = Math.max(MIN_ROWS, Math.floor(height / TARGET_CELL_SIZE));
    const derivedCellSize = Math.max(24, Math.floor(Math.min(width / columns, height / rows)));
    return { columns, rows, cellSize: derivedCellSize };
}

function syncCanvasSize() {
    if (!canvas || !host || !ctx) return;

    const { width, height } = getHostSize();
    const dpr = Math.min(window.devicePixelRatio || 1, BASE_DPR_CAP);

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const grid = computeGrid(width, height);
    cellSize = grid.cellSize;
    if (engine) {
        engine.resize(grid.columns, grid.rows);
    }
}

function drawGrid(columns, rows) {
    const width = columns * cellSize;
    const height = rows * cellSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= columns; x += 1) {
        const px = Math.round(x * cellSize) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
    }

    for (let y = 0; y <= rows; y += 1) {
        const py = Math.round(y * cellSize) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
    }

    ctx.restore();
}

function drawFood(food) {
    if (!food) return;

    const x = food.x * cellSize;
    const y = food.y * cellSize;
    const padding = Math.max(5, cellSize * 0.2);

    ctx.save();
    ctx.fillStyle = 'rgba(110, 24, 18, 0.92)';
    ctx.shadowColor = 'rgba(145, 38, 28, 0.34)';
    ctx.shadowBlur = 12;
    ctx.fillRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
    ctx.restore();
}

function drawSnake(body) {
    body.forEach((cell, index) => {
        const ratio = body.length <= 1 ? 1 : (index + 1) / body.length;
        const alpha = 0.18 + ratio * 0.48;
        const x = cell.x * cellSize;
        const y = cell.y * cellSize;
        const padding = Math.max(4, cellSize * 0.12);

        ctx.save();
        ctx.fillStyle = `rgba(196, 138, 28, ${alpha.toFixed(3)})`;
        ctx.strokeStyle = `rgba(255, 196, 72, ${(alpha + 0.08).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.fillRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
        ctx.strokeRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
        ctx.restore();
    });
}

function drawFrame() {
    if (!canvas || !ctx || !engine) return;

    const state = engine.getState();
    const width = state.columns * cellSize;
    const height = state.rows * cellSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(state.columns, state.rows);
    drawSnake(state.body);
    drawFood(state.food);
}

function renderLoop(timestamp) {
    if (!running) return;

    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    tickAccumulator += delta;

    while (tickAccumulator >= TICK_INTERVAL) {
        strategy.tick();
        tickAccumulator -= TICK_INTERVAL;
    }

    drawFrame();
    frameId = requestAnimationFrame(renderLoop);
}

function startLoop() {
    if (running || document.hidden || !engine || !strategy) return;
    running = true;
    lastFrameTime = 0;
    tickAccumulator = 0;
    frameId = requestAnimationFrame(renderLoop);
}

function stopLoop() {
    running = false;
    if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopLoop();
    } else {
        startLoop();
    }
}

function initCategoryHtmlSnakeBackground() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    shell = document.querySelector(SHELL_SELECTOR);
    host = document.querySelector(HOST_SELECTOR);

    if (!shell || !host || canvas) return;

    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = getHostSize();
    const grid = computeGrid(width, height);
    cellSize = grid.cellSize;
    engine = createSnakeEngine({
        columns: grid.columns,
        rows: grid.rows,
        growthStep: GROWTH_STEP,
    });
    const strategyId = pickRandomStrategy(STRATEGY_POOL);
    strategy = createStrategyById(strategyId, engine);
    const strategyHud = shell.querySelector('[data-html-strategy-name]');
    if (strategyHud) {
        strategyHud.textContent = strategyId;
    }
    console.info(`[category-html-css3] active snake strategy: ${strategyId}`);

    syncCanvasSize();
    drawFrame();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', syncCanvasSize);

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(syncCanvasSize);
        resizeObserver.observe(host);
    }

    startLoop();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCategoryHtmlSnakeBackground, { once: true });
} else {
    initCategoryHtmlSnakeBackground();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        if (!canvas) {
            initCategoryHtmlSnakeBackground();
            return;
        }
        syncCanvasSize();
        startLoop();
    }
});
