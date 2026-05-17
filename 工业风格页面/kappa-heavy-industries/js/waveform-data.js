export const DEFAULT_WINDOW_SAMPLES = 2048;

let waveformModuleReadyEventSent = false;

export function dispatchWaveformModuleReady() {
    if (waveformModuleReadyEventSent) return;
    waveformModuleReadyEventSent = true;
    window.dispatchEvent(new CustomEvent('kappa:home-ready-waveform-module'));
}

export async function loadWaveformPayload(waveformSrc) {
    if (!waveformSrc) {
        dispatchWaveformModuleReady();
        return null;
    }

    try {
        const response = await fetch(waveformSrc);
        const payload = await response.json();
        dispatchWaveformModuleReady();
        return payload;
    } catch (error) {
        console.warn('waveform payload load failed', error);
        dispatchWaveformModuleReady();
        return null;
    }
}

export function buildWaveformState(payload) {
    if (!payload || !Array.isArray(payload.samples) || payload.samples.length === 0) {
        return {
            samples: null,
            durationSeconds: 0,
            windowSamples: DEFAULT_WINDOW_SAMPLES,
        };
    }

    return {
        samples: Float32Array.from(payload.samples),
        durationSeconds: Number(payload.durationSeconds || 0),
        windowSamples: Number(payload.windowSamples || DEFAULT_WINDOW_SAMPLES),
    };
}

export function getInterpolatedWaveSample(samples, position) {
    if (!samples || samples.length === 0) return 0;

    const length = samples.length;
    const wrapped = ((position % length) + length) % length;
    const index = Math.floor(wrapped);
    const nextIndex = (index + 1) % length;
    const ratio = wrapped - index;

    return samples[index] + (samples[nextIndex] - samples[index]) * ratio;
}

export function buildWindowPoints({ samples, durationSeconds, windowSamples, pointCount, timeFactor }) {
    const points = [];
    let peak = 0;
    const sampleLength = samples?.length || 1;
    const audioProgress = durationSeconds > 0 ? ((timeFactor % durationSeconds) / durationSeconds) : ((timeFactor * 0.1) % 1);
    const startSample = audioProgress * sampleLength;

    for (let i = 0; i <= pointCount; i += 1) {
        const t = i / pointCount;
        const samplePosition = startSample + t * windowSamples;
        const sample = getInterpolatedWaveSample(samples, samplePosition);
        points.push(sample);
        peak = Math.max(peak, Math.abs(sample));
    }

    return { points, peak, startSample };
}

export function buildSpectrumLevelsFromWindowPoints({ points, barCount, bandWeights, intensity }) {
    const levels = new Array(barCount).fill(0);
    if (!points || points.length === 0) {
        return levels;
    }

    const binSampleCount = Math.min(256, points.length);
    const sampled = new Array(binSampleCount).fill(0);
    for (let i = 0; i < binSampleCount; i += 1) {
        const idx = Math.min(points.length - 1, Math.floor((i / binSampleCount) * points.length));
        sampled[i] = points[idx];
    }

    let mean = 0;
    for (let i = 0; i < binSampleCount; i += 1) {
        mean += sampled[i];
    }
    mean /= binSampleCount;

    for (let i = 0; i < binSampleCount; i += 1) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, binSampleCount - 1));
        sampled[i] = (sampled[i] - mean) * window;
    }

    const rawEnergies = new Array(barCount).fill(0);
    let frameMaxEnergy = 0;

    for (let band = 0; band < barCount; band += 1) {
        const ratio = band / Math.max(1, barCount - 1);
        const startK = Math.max(1, Math.floor(1 + ratio * ratio * 38));
        const endK = Math.max(startK + 1, Math.floor(3 + ratio * ratio * 72));
        let energy = 0;
        let count = 0;

        for (let k = startK; k <= endK; k += 1) {
            let real = 0;
            let imag = 0;
            for (let n = 0; n < binSampleCount; n += 1) {
                const angle = (2 * Math.PI * k * n) / binSampleCount;
                real += sampled[n] * Math.cos(angle);
                imag -= sampled[n] * Math.sin(angle);
            }
            const magnitude = Math.sqrt(real * real + imag * imag) / binSampleCount;
            energy += magnitude;
            count += 1;
        }

        const averageEnergy = count > 0 ? energy / count : 0;
        rawEnergies[band] = averageEnergy;
        frameMaxEnergy = Math.max(frameMaxEnergy, averageEnergy);
    }

    const safeFrameMax = Math.max(frameMaxEnergy, 0.0001);

    for (let band = 0; band < barCount; band += 1) {
        const normalized = rawEnergies[band] / safeFrameMax;
        const weighted = Math.min(1, normalized * bandWeights[band] * (0.92 + intensity * 0.18));
        levels[band] = Math.pow(weighted, 1.12);
    }

    return levels;
}

export function buildSpectrumLevelsFromWaveform({ samples, durationSeconds, windowSamples, timeFactor, barCount, bandWeights, intensity }) {
    const levels = new Array(barCount).fill(0);
    const sampleLength = samples?.length || 1;
    const audioProgress = durationSeconds > 0 ? ((timeFactor % durationSeconds) / durationSeconds) : ((timeFactor * 0.1) % 1);
    const startSample = audioProgress * sampleLength;

    for (let i = 0; i < barCount; i += 1) {
        const ratio = i / Math.max(1, barCount - 1);
        const segmentStart = startSample + ratio * windowSamples;
        const segmentSize = Math.max(8, Math.floor(windowSamples / barCount));
        let peak = 0;

        for (let j = 0; j < segmentSize; j += 1) {
            peak = Math.max(peak, Math.abs(getInterpolatedWaveSample(samples, segmentStart + j)));
        }

        const weighted = Math.min(1, peak * bandWeights[i] * (0.92 + intensity * 0.18));
        levels[i] = Math.pow(weighted, 1.08);
    }

    return levels;
}
