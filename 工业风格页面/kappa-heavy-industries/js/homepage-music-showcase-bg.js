import {
    DEFAULT_WINDOW_SAMPLES,
    loadWaveformPayload,
    buildWaveformState,
    buildWindowPoints,
    dispatchWaveformModuleReady,
} from './waveform-data.js';

const PAGE_SELECTOR = '.page--music-showcase';
const HOST_SELECTOR = '.music-showcase-bg-host[data-homepage-bg-animation="music-showcase"]';
const WAVE_POINTS = 480;
const BASE_DPR_CAP = 1.5;

let page = null;
let host = null;
let canvas = null;
let ctx = null;
let resizeObserver = null;
let frameId = null;
let running = false;
let fallbackPhase = 0;
let audioReadyEventSent = false;
let waveformSamples = null;
let waveformDuration = 0;
let waveformWindowSamples = DEFAULT_WINDOW_SAMPLES;

function dispatchAudioReady() {
    if (audioReadyEventSent) return;
    audioReadyEventSent = true;
    window.dispatchEvent(new CustomEvent('kappa:home-ready-audio'));
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
    const dpr = Math.min(window.devicePixelRatio || 1, BASE_DPR_CAP);

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}

function clearFrame(width, height) {
    ctx.clearRect(0, 0, width, height);
}

function fract(value) {
    return value - Math.floor(value);
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function hash(value) {
    return fract(Math.sin(value * 127.1 + 17.3) * 43758.5453123);
}

function noise1d(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = smoothstep(f);
    return (1 - u) * hash(i) + u * hash(i + 1);
}

function fractalNoise1d(x) {
    let sum = 0;
    let amplitude = 0.62;
    let frequency = 1;
    let norm = 0;

    for (let octave = 0; octave < 4; octave += 1) {
        sum += noise1d(x * frequency + octave * 17.3) * amplitude;
        norm += amplitude;
        amplitude *= 0.52;
        frequency *= 2.06;
    }

    return norm > 0 ? sum / norm : 0;
}

function createFallbackSignal(normalizedX, timeSeconds) {
    const harmonicA = Math.sin(normalizedX * Math.PI * 5.6 + timeSeconds * 1.2) * 0.42;
    const harmonicB = Math.sin(normalizedX * Math.PI * 15.4 + timeSeconds * 2.05) * 0.18;
    const roughNoise = (fractalNoise1d(normalizedX * 8.8 + timeSeconds * 0.84) - 0.5) * 0.64;
    const microNoise = (fractalNoise1d(normalizedX * 24 + timeSeconds * 1.66) - 0.5) * 0.2;
    return harmonicA + harmonicB + roughNoise + microNoise;
}

function drawGrid(width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1;

    const gapX = Math.max(56, width / 18);
    const gapY = Math.max(44, height / 9);

    for (let x = 0; x <= width; x += gapX) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
        ctx.stroke();
    }

    for (let y = 0; y <= height; y += gapY) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
        ctx.stroke();
    }

    ctx.restore();
}

function drawWaveFromSamples(width, height, timeSeconds) {
    const centerY = height * 0.46;
    const { points, peak } = buildWindowPoints({
        samples: waveformSamples,
        durationSeconds: waveformDuration,
        windowSamples: waveformWindowSamples,
        pointCount: WAVE_POINTS,
        timeFactor: timeSeconds,
    });
    const normalizedPeak = Math.max(0.1, peak);
    const gain = Math.min(2.2, 0.82 / normalizedPeak);
    const amplitude = height * 0.23;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#00c6ff');
    gradient.addColorStop(0.5, '#ffb700');
    gradient.addColorStop(1, '#00ff88');

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 198, 255, 0.5)';
    ctx.beginPath();

    for (let i = 0; i <= WAVE_POINTS; i += 1) {
        const x = (i / WAVE_POINTS) * width;
        const y = centerY + points[i] * gain * amplitude;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 10;
    ctx.beginPath();

    for (let i = 0; i <= WAVE_POINTS; i += 1) {
        const x = (i / WAVE_POINTS) * width;
        const y = centerY + points[i] * gain * amplitude;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.restore();
}

function drawFallbackWave(width, height, timeSeconds) {
    const centerY = height * 0.46;
    const amplitude = height * 0.22;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#00c6ff');
    gradient.addColorStop(0.5, '#ffb700');
    gradient.addColorStop(1, '#00ff88');

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 198, 255, 0.4)';
    ctx.beginPath();

    for (let i = 0; i <= WAVE_POINTS; i += 1) {
        const t = i / WAVE_POINTS;
        const x = t * width;
        const y = centerY + createFallbackSignal(t, timeSeconds) * amplitude;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 10;
    ctx.beginPath();

    for (let i = 0; i <= WAVE_POINTS; i += 1) {
        const t = i / WAVE_POINTS;
        const x = t * width;
        const y = centerY + createFallbackSignal(t, timeSeconds) * amplitude;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.restore();
}

function drawFrame(timeSeconds) {
    if (!canvas || !ctx || !host) return;

    const { width, height } = getHostSize();
    clearFrame(width, height);
    drawGrid(width, height);

    if (waveformSamples && waveformSamples.length > 0) {
        drawWaveFromSamples(width, height, timeSeconds);
        return;
    }

    drawFallbackWave(width, height, timeSeconds);
}

function renderLoop(timestamp) {
    if (!running) return;

    const timeSeconds = timestamp / 1000;
    drawFrame(timeSeconds + fallbackPhase);
    frameId = requestAnimationFrame(renderLoop);
}

function startLoop() {
    if (running || !canvas || !ctx || !isPageActive() || document.hidden) return;
    running = true;
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

function handlePagerChange() {
    if (isPageActive()) {
        startLoop();
    } else {
        stopLoop();
    }
}

async function loadWaveformData() {
    const waveformSrc = host?.dataset.waveformSrc;
    const payload = await loadWaveformPayload(waveformSrc);
    const state = buildWaveformState(payload);
    waveformSamples = state.samples;
    waveformDuration = state.durationSeconds;
    waveformWindowSamples = state.windowSamples;
    dispatchAudioReady();
}

function initMusicShowcaseBackground() {
    dispatchWaveformModuleReady();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dispatchAudioReady();
        return;
    }

    page = document.querySelector(PAGE_SELECTOR);
    host = document.querySelector(HOST_SELECTOR);

    if (!page || !host || canvas) {
        if (host) {
            dispatchAudioReady();
        }
        return;
    }

    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    ctx = canvas.getContext('2d');
    if (!ctx) {
        dispatchAudioReady();
        return;
    }

    syncCanvasSize();
    drawFrame(0);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('kappa:pager-change', handlePagerChange);
    window.addEventListener('resize', syncCanvasSize);

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(syncCanvasSize);
        resizeObserver.observe(host);
    }

    loadWaveformData();
    startLoop();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicShowcaseBackground, { once: true });
} else {
    initMusicShowcaseBackground();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        if (!canvas) {
            initMusicShowcaseBackground();
            return;
        }

        syncCanvasSize();
        if (isPageActive()) {
            startLoop();
        }
    }
});
