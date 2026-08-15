const EVOLUTION_SCHEMA = 'world-orogen-evolution-state';
const EVOLUTION_VERSION = 1;

function clonePlain(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clonePlain);
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = clonePlain(item);
    return out;
}

function defaultTime(previousTime = {}) {
    return {
        scale: previousTime.scale || 'geology',
        timeMyr: Number.isFinite(previousTime.timeMyr) ? previousTime.timeMyr : 0,
        timeYear: Number.isFinite(previousTime.timeYear) ? previousTime.timeYear : 0,
        stepIndex: Number.isFinite(previousTime.stepIndex) ? previousTime.stepIndex : 0,
        dtMyr: Number.isFinite(previousTime.dtMyr) ? previousTime.dtMyr : 1,
        dtYear: Number.isFinite(previousTime.dtYear) ? previousTime.dtYear : 100,
    };
}

export function createEvolutionState({
    previous = null,
    seed = '',
    mode,
    time = null,
    snapshotId = null,
    parentId = null,
    label = '',
    source = 'manual',
    climateComputed = false,
} = {}) {
    const prev = previous || {};
    const prevTime = prev.time || {};
    const nextTime = { ...defaultTime(prevTime), ...(time || {}) };
    const now = new Date().toISOString();

    return {
        schema: EVOLUTION_SCHEMA,
        version: EVOLUTION_VERSION,
        mode: mode || prev.mode || 'geology',
        seed: seed || prev.seed || '',
        time: nextTime,
        snapshot: {
            id: snapshotId,
            parentId,
            label: label || formatEvolutionLabel({ time: nextTime }),
            createdAt: now,
            source,
        },
        dependencies: {
            plateMotionModelId: prev.dependencies?.plateMotionModelId || null,
            climateComputed: !!climateComputed,
            environmentInputsComputed: !!prev.dependencies?.environmentInputsComputed,
            civilizationComputed: !!prev.dependencies?.civilizationComputed,
        },
        diagnostics: {
            warnings: Array.isArray(prev.diagnostics?.warnings) ? [...prev.diagnostics.warnings] : [],
            metricsVersion: prev.diagnostics?.metricsVersion || 1,
        },
    };
}

export function ensureEvolutionState(curData, options = {}) {
    if (!curData) return null;
    if (curData.evolutionState?.schema === EVOLUTION_SCHEMA) {
        return curData.evolutionState;
    }
    curData.evolutionState = createEvolutionState({
        seed: curData.seed,
        climateComputed: !!options.climateComputed,
        source: options.source || 'generate',
        label: options.label || '0 Myr',
    });
    return curData.evolutionState;
}

export function advanceEvolutionState(baseState, { dtMyr = 1, dtYear = 100 } = {}) {
    const base = baseState || createEvolutionState();
    const baseTime = defaultTime(base.time);
    const scale = baseTime.scale || 'geology';
    const time = {
        ...baseTime,
        stepIndex: baseTime.stepIndex + 1,
        dtMyr,
        dtYear,
    };
    if (scale === 'civilization') {
        time.timeYear = baseTime.timeYear + dtYear;
    } else {
        time.scale = 'geology';
        time.timeMyr = baseTime.timeMyr + dtMyr;
    }
    return createEvolutionState({
        previous: base,
        seed: base.seed,
        mode: base.mode || 'geology',
        time,
        source: 'evolution-step',
        climateComputed: !!base.dependencies?.climateComputed,
    });
}

export function formatEvolutionLabel(evolutionState) {
    const time = evolutionState?.time || {};
    if (time.scale === 'civilization') {
        const year = Number.isFinite(time.timeYear) ? time.timeYear : 0;
        return `第 ${year} 年`;
    }
    const myr = Number.isFinite(time.timeMyr) ? time.timeMyr : 0;
    return `${myr.toLocaleString(undefined, { maximumFractionDigits: 2 })} Myr`;
}

export function cloneEvolutionState(evolutionState) {
    return clonePlain(evolutionState);
}
