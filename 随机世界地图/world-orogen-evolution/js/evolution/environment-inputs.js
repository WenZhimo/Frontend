const ENVIRONMENT_SCHEMA = 'world-orogen-environment-inputs';
const ENVIRONMENT_VERSION = 1;

function clamp01(value) {
    return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function averageClimateField(a, b, index, fallback = 0) {
    const av = a ? a[index] : NaN;
    const bv = b ? b[index] : NaN;
    if (Number.isFinite(av) && Number.isFinite(bv)) return (av + bv) / 2;
    if (Number.isFinite(av)) return av;
    if (Number.isFinite(bv)) return bv;
    return fallback;
}

function computeSlope(mesh, r_elevation) {
    const n = mesh.numRegions;
    const slope = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        let maxDiff = 0;
        const base = r_elevation[r];
        for (let ni = mesh.adjOffset[r], end = mesh.adjOffset[r + 1]; ni < end; ni++) {
            const diff = Math.abs(base - r_elevation[mesh.adjList[ni]]);
            if (diff > maxDiff) maxDiff = diff;
        }
        slope[r] = clamp01(maxDiff / 0.18);
    }
    return slope;
}

function computeWaterDistance(mesh, waterMask, maxDistance = 32) {
    const n = mesh.numRegions;
    const dist = new Int32Array(n);
    dist.fill(-1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    for (let r = 0; r < n; r++) {
        if (!waterMask[r]) continue;
        dist[r] = 0;
        queue[tail++] = r;
    }

    while (head < tail) {
        const r = queue[head++];
        const next = dist[r] + 1;
        if (next > maxDistance) continue;
        for (let ni = mesh.adjOffset[r], end = mesh.adjOffset[r + 1]; ni < end; ni++) {
            const nb = mesh.adjList[ni];
            if (dist[nb] !== -1) continue;
            dist[nb] = next;
            queue[tail++] = nb;
        }
    }

    return dist;
}

function climateScores(input, r, sinLat) {
    const hasTemperature = !!(input.r_temperature_summer || input.r_temperature_winter);
    const hasPrecip = !!(input.r_precip_summer || input.r_precip_winter);
    const tempAvg = averageClimateField(input.r_temperature_summer, input.r_temperature_winter, r, 18);
    const precipAvg = averageClimateField(input.r_precip_summer, input.r_precip_winter, r, 0.65);

    const latitudeFallback = clamp01(1 - Math.abs(sinLat) * 0.85);
    const tempScore = hasTemperature
        ? clamp01(1 - Math.abs(tempAvg - 18) / 32)
        : latitudeFallback;
    const wetScore = hasPrecip
        ? clamp01((precipAvg - 0.15) / 1.1)
        : clamp01(0.55 + latitudeFallback * 0.25);

    return { tempScore, wetScore, climateEnhanced: hasTemperature || hasPrecip };
}

export function createEnvironmentInputDiagnostics(input = {}) {
    const { mesh, r_xyz, r_elevation, debugLayers = {} } = input;
    const n = mesh?.numRegions || r_elevation?.length || 0;
    const waterMask = new Uint8Array(n);
    for (let r = 0; r < n; r++) waterMask[r] = r_elevation[r] <= 0 ? 1 : 0;

    const slope = computeSlope(mesh, r_elevation);
    const waterDist = computeWaterDistance(mesh, waterMask);
    const habitability = new Float32Array(n);
    const freshwaterAccess = new Float32Array(n);
    const agriculturePotential = new Float32Array(n);
    const mobilityCost = new Float32Array(n);
    const seaTravel = new Float32Array(n);
    const riverTravel = new Float32Array(n);
    const naturalBarrier = new Float32Array(n);
    const resourceAttraction = new Float32Array(n);

    const oldOrogeny = debugLayers.oldOrogeny || null;
    const riftStage = debugLayers.riftStage || null;
    const sedimentMemory = debugLayers.sedimentMemory || null;
    const oceanConnectivity = debugLayers.oceanConnectivity || null;
    let climateEnhancedCells = 0;
    let landCells = 0;

    for (let r = 0; r < n; r++) {
        const elevation = r_elevation[r];
        const isWater = waterMask[r] === 1;
        const sinLat = r_xyz ? r_xyz[3 * r + 1] : 0;
        const { tempScore, wetScore, climateEnhanced } = climateScores(input, r, sinLat);
        if (climateEnhanced) climateEnhancedCells++;
        if (!isWater) landCells++;

        const dWater = waterDist[r] >= 0 ? waterDist[r] : 99;
        const waterProximity = isWater ? 0.15 : Math.exp(-dWater / 8);
        const lowland = clamp01((0.35 - Math.max(0, elevation)) / 0.35);
        const gentle = 1 - slope[r];
        const coastal = !isWater && dWater <= 1 ? 1 : 0;
        const shallowSea = isWater ? clamp01((elevation + 0.25) / 0.25) : 0;
        const sediment = clamp01(sedimentMemory?.[r] || 0);
        const tectonic = Math.max(clamp01(oldOrogeny?.[r] || 0), clamp01((riftStage?.[r] || 0) / 5));

        freshwaterAccess[r] = isWater
            ? clamp01(0.1 + wetScore * 0.15)
            : clamp01(waterProximity * 0.55 + wetScore * 0.35 + lowland * 0.10);
        agriculturePotential[r] = isWater ? 0 : clamp01(
            tempScore * 0.32 +
            wetScore * 0.24 +
            freshwaterAccess[r] * 0.22 +
            gentle * 0.14 +
            lowland * 0.08
        );
        mobilityCost[r] = clamp01(
            (isWater ? 0.68 : 0.18) +
            slope[r] * 0.42 +
            Math.max(0, elevation - 0.22) * 0.85 -
            coastal * 0.08
        );
        seaTravel[r] = clamp01((isWater ? 0.75 : coastal * 0.55) + (oceanConnectivity?.[r] || 0) * 0.25 + shallowSea * 0.10);
        riverTravel[r] = isWater ? 0 : clamp01(freshwaterAccess[r] * lowland * gentle);
        naturalBarrier[r] = clamp01(slope[r] * 0.45 + Math.max(0, elevation - 0.28) * 1.1 + (isWater ? 0.25 : 0));
        resourceAttraction[r] = clamp01(tectonic * 0.38 + sediment * 0.26 + coastal * 0.12 + agriculturePotential[r] * 0.24);
        habitability[r] = isWater ? 0 : clamp01(
            agriculturePotential[r] * 0.45 +
            freshwaterAccess[r] * 0.22 +
            (1 - mobilityCost[r]) * 0.18 +
            resourceAttraction[r] * 0.10 +
            (1 - naturalBarrier[r]) * 0.05
        );
    }

    return {
        schema: ENVIRONMENT_SCHEMA,
        version: ENVIRONMENT_VERSION,
        layers: {
            habitability,
            freshwaterAccess,
            agriculturePotential,
            mobilityCost,
            seaTravel,
            riverTravel,
            naturalBarrier,
            resourceAttraction,
        },
        metrics: {
            climateEnhanced: climateEnhancedCells > 0,
            climateEnhancedCells,
            landCells,
        },
    };
}

export function attachEnvironmentInputDebugLayers(targetDebugLayers, input = {}) {
    const diagnostics = createEnvironmentInputDiagnostics(input);
    Object.assign(targetDebugLayers, diagnostics.layers);
    return {
        schema: diagnostics.schema,
        version: diagnostics.version,
        layers: Object.keys(diagnostics.layers),
        metrics: diagnostics.metrics,
    };
}
