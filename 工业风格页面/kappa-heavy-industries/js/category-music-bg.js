import { subscribePointer } from './pointer-service.js';
import {
    DEFAULT_WINDOW_SAMPLES,
    loadWaveformPayload,
    buildWaveformState,
    buildWindowPoints,
    buildSpectrumLevelsFromWindowPoints,
    dispatchWaveformModuleReady,
} from './waveform-data.js';

const HOST_SELECTOR = '.music-category-bg-host[data-music-bg="wave-spectrum"]';
const SHELL_SELECTOR = '.category-music-shell';
const BAR_COUNT = 42;
const WAVE_POINTS = 480;
const BASE_DPR_CAP = 1.6;
const LOW_HUE = 40;
const HIGH_HUE = 190;

let host = null;
let shell = null;
let canvas = null;
let ctx = null;
let resizeObserver = null;
let frameId = null;
let running = false;
let phase = 0;
let pointerEnergy = 0;
let pointerTargetEnergy = 0;
let bandWeights = [];
let spectrumSmoothed = [];
let spectrumPeaks = [];
let currentHue = LOW_HUE;
let targetHue = LOW_HUE;
let currentAccentHue = HIGH_HUE;
let targetAccentHue = HIGH_HUE;
let waveformSamples = null;
let waveformDuration = 0;
let waveformWindowSamples = DEFAULT_WINDOW_SAMPLES;

function createSignalProfile() {
    bandWeights = [];
    spectrumSmoothed = new Array(BAR_COUNT).fill(0);
    spectrumPeaks = new Array(BAR_COUNT).fill(0);

    for (let i = 0; i < BAR_COUNT; i += 1) {
        const ratio = i / Math.max(1, BAR_COUNT - 1);
        const lowLift = 1.34 - ratio * 0.48;
        const highTaper = 0.92 + Math.sin(ratio * Math.PI) * 0.14;
        bandWeights.push(lowLift * highTaper);
    }
}

function getHostSize() {
    const rect = host.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
    };
}

function getScrollRatio() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(Math.max(scrollTop / scrollMax, 0), 1);
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

function drawGrid(width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    const gapX = Math.max(42, width / 18);
    const gapY = Math.max(42, height / 10);

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

function drawWave(width, height, points, peak, intensity) {
    if (!points || points.length === 0) return;

    const centerY = height * 0.46;
    const normalizedPeak = Math.max(0.1, peak);
    const gain = Math.min(2.2, 0.82 / normalizedPeak) * (0.96 + intensity * 0.18);
    const amplitude = height * (0.12 + intensity * 0.08);
    const primaryColor = `hsla(${currentHue.toFixed(2)}, 90%, 70%, 0.82)`;
    const accentColor = `hsla(${currentAccentHue.toFixed(2)}, 95%, 68%, 0.34)`;

    ctx.save();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = primaryColor;
    ctx.shadowColor = `hsla(${currentHue.toFixed(2)}, 92%, 60%, 0.28)`;
    ctx.shadowBlur = 18;
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

    ctx.lineWidth = 1.1;
    ctx.strokeStyle = accentColor;
    ctx.shadowBlur = 0;
    ctx.beginPath();

    for (let i = 0; i <= WAVE_POINTS; i += 1) {
        const x = (i / WAVE_POINTS) * width;
        const mirroredIndex = Math.min(WAVE_POINTS, i + 6);
        const y = centerY + points[mirroredIndex] * gain * amplitude * 0.78;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();

    ctx.strokeStyle = `hsla(${currentHue.toFixed(2)}, 90%, 74%, 0.08)`;
    ctx.lineWidth = Math.max(12, amplitude * 0.08);
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

function updateSpectrumState(rawLevels, intensity) {
    for (let i = 0; i < BAR_COUNT; i += 1) {
        const attack = 0.24 + intensity * 0.09;
        const decay = 0.052 + intensity * 0.018;
        const current = spectrumSmoothed[i];
        const target = rawLevels[i];
        const easing = target > current ? attack : decay;

        spectrumSmoothed[i] = current + (target - current) * easing;

        if (spectrumSmoothed[i] >= spectrumPeaks[i]) {
            spectrumPeaks[i] = spectrumSmoothed[i];
        } else {
            spectrumPeaks[i] = Math.max(0, spectrumPeaks[i] - (0.012 + intensity * 0.014));
        }
    }
}

function drawSpectrum(width, height, rawLevels, intensity) {
    const baseY = height - 16;
    const bandHeight = height * (0.17 + intensity * 0.07);
    const gap = 4;
    const barWidth = Math.max(6, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);

    updateSpectrumState(rawLevels, intensity);

    ctx.save();

    for (let i = 0; i < BAR_COUNT; i += 1) {
        const x = i * (barWidth + gap);
        const value = spectrumSmoothed[i];
        const peak = spectrumPeaks[i];
        const barHeight = Math.max(2, value * bandHeight);
        const peakY = baseY - Math.max(8, peak * bandHeight);
        const hueShift = currentAccentHue - 16 + (i / BAR_COUNT) * 10;

        const gradient = ctx.createLinearGradient(0, baseY - barHeight, 0, baseY);
        gradient.addColorStop(0, `hsla(${hueShift.toFixed(2)}, 96%, 74%, 0.76)`);
        gradient.addColorStop(0.58, `hsla(${currentHue.toFixed(2)}, 88%, 62%, 0.44)`);
        gradient.addColorStop(1, 'rgba(255, 176, 0, 0.12)');

        ctx.fillStyle = gradient;
        ctx.shadowColor = `hsla(${currentAccentHue.toFixed(2)}, 88%, 62%, 0.14)`;
        ctx.shadowBlur = 10;
        ctx.fillRect(x, baseY - barHeight, barWidth, barHeight);

        ctx.shadowBlur = 0;
        ctx.fillStyle = `hsla(${currentAccentHue.toFixed(2)}, 95%, 78%, 0.76)`;
        ctx.fillRect(x, peakY, barWidth, 2);
    }

    ctx.restore();
}

function updateColorTargets() {
    const scrollRatio = getScrollRatio();
    const scrollHueOffset = (scrollRatio - 0.5) * 18;
    targetHue = LOW_HUE + scrollHueOffset + pointerTargetEnergy * 6;
    targetAccentHue = HIGH_HUE - scrollHueOffset * 0.42 - pointerTargetEnergy * 10;

    currentHue += (targetHue - currentHue) * 0.045;
    currentAccentHue += (targetAccentHue - currentAccentHue) * 0.04;
}

function drawFrame() {
    if (!canvas || !ctx || !host) return;
    if (!waveformSamples || waveformSamples.length === 0) return;

    const { width, height } = getHostSize();
    clearFrame(width, height);

    pointerEnergy += (pointerTargetEnergy - pointerEnergy) * 0.06;
    const intensity = 0.26 + pointerEnergy * 0.86;
    const timeFactor = phase * (0.86 + intensity * 0.44);
    const { points, peak } = buildWindowPoints({
        samples: waveformSamples,
        durationSeconds: waveformDuration,
        windowSamples: waveformWindowSamples,
        pointCount: WAVE_POINTS,
        timeFactor,
    });
    const rawLevels = buildSpectrumLevelsFromWindowPoints({
        points,
        barCount: BAR_COUNT,
        bandWeights,
        intensity,
    });

    updateColorTargets();
    drawGrid(width, height);
    drawWave(width, height, points, peak, intensity);
    drawSpectrum(width, height, rawLevels, intensity);

    phase += 0.013;
}

function renderLoop() {
    if (!running) return;
    drawFrame();
    frameId = requestAnimationFrame(renderLoop);
}

function startLoop() {
    if (running || !canvas || !ctx || document.hidden) return;
    running = true;
    renderLoop();
}

function stopLoop() {
    running = false;
    if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }
}

function handlePointerUpdate(state) {
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const x = state.x - rect.left;
    const y = state.y - rect.top;
    const inside = state.insideViewport && rect.width > 0 && rect.height > 0 && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

    if (!inside) {
        pointerTargetEnergy = 0;
        return;
    }

    const ratioX = Math.min(Math.max(x / Math.max(1, rect.width), 0), 1);
    const ratioY = Math.min(Math.max(y / Math.max(1, rect.height), 0), 1);
    const horizontalBias = Math.abs(ratioX - 0.5) * 0.6;
    const verticalBias = 1 - ratioY;

    pointerTargetEnergy = Math.min(1, 0.28 + verticalBias * 0.76 + horizontalBias * 0.3);
    targetHue = LOW_HUE + (ratioX - 0.5) * 14 + pointerTargetEnergy * 6;
    targetAccentHue = HIGH_HUE - ratioY * 18 - horizontalBias * 10;
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopLoop();
    } else {
        startLoop();
    }
}

async function loadWaveformData() {
    const waveformSrc = host?.dataset.waveformSrc;
    const payload = await loadWaveformPayload(waveformSrc);
    const state = buildWaveformState(payload);
    waveformSamples = state.samples;
    waveformDuration = state.durationSeconds;
    waveformWindowSamples = state.windowSamples;
}

async function initMusicCategoryBackground() {
    dispatchWaveformModuleReady();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    shell = document.querySelector(SHELL_SELECTOR);
    host = document.querySelector(HOST_SELECTOR);

    if (!shell || !host || canvas) return;

    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    createSignalProfile();
    syncCanvasSize();
    subscribePointer(handlePointerUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', syncCanvasSize);

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(syncCanvasSize);
        resizeObserver.observe(host);
    }

    await loadWaveformData();
    drawFrame();
    startLoop();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicCategoryBackground, { once: true });
} else {
    initMusicCategoryBackground();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        if (!canvas) {
            initMusicCategoryBackground();
            return;
        }

        syncCanvasSize();
        startLoop();
    }
});
