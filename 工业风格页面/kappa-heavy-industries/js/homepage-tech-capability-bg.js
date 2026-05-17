import { getLocalPoint, subscribePointer } from './pointer-service.js';

const PAGE_SELECTOR = '.page--tech-capability';
const HOST_SELECTOR = '.homepage-bg-animation-host[data-homepage-bg-animation="tech-capability"]';
const CELL_SIZE = 52;
const INITIAL_SNAKE_LENGTH = 1;
const GROWTH_STEP = 1;

let host = null;
let page = null;
let canvas = null;
let ctx = null;
let resizeObserver = null;
let animationFrameId = null;
let isRunning = false;

let columns = 0;
let rows = 0;
let pointerInside = false;
let snakeLength = INITIAL_SNAKE_LENGTH;
let snakeBody = [];
let foodCell = null;
let targetCell = null;

function getCellKey(cell) {
    return `${cell.x},${cell.y}`;
}

function randomCell() {
    return {
        x: Math.floor(Math.random() * columns),
        y: Math.floor(Math.random() * rows),
    };
}

function spawnFood() {
    if (!columns || !rows) {
        foodCell = null;
        return;
    }

    const occupied = new Set(snakeBody.map(getCellKey));
    const maxAttempts = columns * rows;

    for (let i = 0; i < maxAttempts; i += 1) {
        const nextFood = randomCell();
        if (!occupied.has(getCellKey(nextFood))) {
            foodCell = nextFood;
            return;
        }
    }

    foodCell = null;
}

function resetGameState() {
    snakeLength = INITIAL_SNAKE_LENGTH;
    snakeBody = [];
    pointerInside = false;
    targetCell = null;
    spawnFood();
}

function stopLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    isRunning = false;
}

function isPageActive() {
    return !!page && page.classList.contains('active');
}

function getHostSize() {
    const rect = host.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
    };
}

function syncCanvasSize() {
    if (!canvas || !host) return;

    const { width, height } = getHostSize();
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    columns = Math.max(1, Math.floor(width / CELL_SIZE));
    rows = Math.max(1, Math.floor(height / CELL_SIZE));

    resetGameState();
    drawFrame();
}

function drawGrid() {
    const { width, height } = canvas;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= columns; x += 1) {
        const px = Math.round(x * CELL_SIZE) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
    }

    for (let y = 0; y <= rows; y += 1) {
        const py = Math.round(y * CELL_SIZE) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
    }
}

function drawFood() {
    if (!foodCell) return;

    const x = foodCell.x * CELL_SIZE;
    const y = foodCell.y * CELL_SIZE;
    const padding = Math.max(6, CELL_SIZE * 0.18);

    ctx.fillStyle = 'rgba(110, 24, 18, 0.96)';
    ctx.shadowColor = 'rgba(145, 38, 28, 0.38)';
    ctx.shadowBlur = 12;
    ctx.fillRect(x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
    ctx.shadowBlur = 0;
}

function drawSnake() {
    snakeBody.forEach((cell, index) => {
        const ratio = snakeBody.length <= 1 ? 1 : (index + 1) / snakeBody.length;
        const alpha = 0.16 + ratio * 0.5;
        const x = cell.x * CELL_SIZE;
        const y = cell.y * CELL_SIZE;
        const padding = Math.max(4, CELL_SIZE * 0.12);

        ctx.fillStyle = `rgba(196, 138, 28, ${alpha.toFixed(3)})`;
        ctx.strokeStyle = `rgba(255, 196, 72, ${(alpha + 0.08).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.fillRect(x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
        ctx.strokeRect(x + padding, y + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
    });
}

function drawFrame() {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawSnake();
    drawFood();
}

function getSnakeHead() {
    return snakeBody[snakeBody.length - 1] || null;
}

function moveSnakeTowardsTarget() {
    if (!pointerInside || !targetCell) return;

    const head = getSnakeHead();
    if (!head) {
        appendSnakeCell({ ...targetCell });
        return;
    }

    if (head.x === targetCell.x && head.y === targetCell.y) {
        return;
    }

    const nextCell = { ...head };

    if (head.x !== targetCell.x) {
        nextCell.x += Math.sign(targetCell.x - head.x);
    } else if (head.y !== targetCell.y) {
        nextCell.y += Math.sign(targetCell.y - head.y);
    }

    appendSnakeCell(nextCell);
}

function renderLoop() {
    if (!isRunning) return;
    moveSnakeTowardsTarget();
    drawFrame();
    animationFrameId = requestAnimationFrame(renderLoop);
}

function startLoop() {
    if (isRunning || !isPageActive()) return;
    isRunning = true;
    renderLoop();
}

function appendSnakeCell(cell) {
    const head = getSnakeHead();
    if (head && head.x === cell.x && head.y === cell.y) return;

    snakeBody.push(cell);

    if (foodCell && cell.x === foodCell.x && cell.y === foodCell.y) {
        snakeLength += GROWTH_STEP;
        spawnFood();
    }

    if (snakeBody.length > snakeLength) {
        snakeBody = snakeBody.slice(snakeBody.length - snakeLength);
    }
}

function getCellFromPointerState(state) {
    const { x: localX, y: localY, inside } = getLocalPoint(host, state);

    if (!inside) {
        return null;
    }

    const x = Math.min(columns - 1, Math.max(0, Math.floor(localX / CELL_SIZE)));
    const y = Math.min(rows - 1, Math.max(0, Math.floor(localY / CELL_SIZE)));

    return { x, y };
}

function handlePointerUpdate(state) {
    if (!host || !isPageActive()) return;

    const cell = getCellFromPointerState(state);
    if (!cell) {
        pointerInside = false;
        targetCell = null;
        return;
    }

    pointerInside = true;
    targetCell = cell;
}

function resetAndPause() {
    resetGameState();
    drawFrame();
    stopLoop();
}

function pauseWithoutReset() {
    stopLoop();
}

function resumeIfNeeded() {
    if (!page || !host) return;
    if (!isPageActive() || document.hidden) return;
    startLoop();
}

function handlePagerChange() {
    if (!page || !host) return;

    if (isPageActive()) {
        resetGameState();
        drawFrame();
        resumeIfNeeded();
    } else {
        resetAndPause();
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        pauseWithoutReset();
    } else {
        resumeIfNeeded();
    }
}

function syncLoopState() {
    if (!page || !host || !canvas || !ctx) return;

    if (document.hidden || !isPageActive()) {
        resetAndPause();
        return;
    }

    resetGameState();
    drawFrame();
    startLoop();
}

function initTechCapabilityBackground() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    page = document.querySelector(PAGE_SELECTOR);
    host = document.querySelector(HOST_SELECTOR);

    if (!page || !host) return;
    if (canvas) return;

    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    subscribePointer(handlePointerUpdate);
    window.addEventListener('kappa:pager-change', handlePagerChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', syncCanvasSize);

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(syncCanvasSize);
        resizeObserver.observe(host);
    }

    syncCanvasSize();
    syncLoopState();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTechCapabilityBackground, { once: true });
} else {
    initTechCapabilityBackground();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        initTechCapabilityBackground();
        syncLoopState();
    }
});
