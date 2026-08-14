const MEMORY_SCHEMA = 'world-orogen-geology-memory';
const MEMORY_VERSION = 1;

function asPlateSet(plateIsOcean) {
    if (plateIsOcean instanceof Set) return plateIsOcean;
    if (plateIsOcean && typeof plateIsOcean[Symbol.iterator] === 'function') return new Set(plateIsOcean);
    return new Set();
}

function clamp01(value) {
    return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function buildMaskDistance(mesh, seedMask, passMask = null, maxDistance = 64) {
    const n = mesh.numRegions;
    const dist = new Int32Array(n);
    dist.fill(-1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    for (let r = 0; r < n; r++) {
        if (!seedMask[r]) continue;
        if (passMask && !passMask[r]) continue;
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
            if (passMask && !passMask[nb]) continue;
            dist[nb] = next;
            queue[tail++] = nb;
        }
    }

    return dist;
}

function computeOceanConnectivity(mesh, waterMask) {
    const n = mesh.numRegions;
    const component = new Int32Array(n);
    component.fill(-1);
    const sizes = [];
    const queue = new Int32Array(n);
    let componentId = 0;
    let largestId = -1;
    let largestSize = 0;

    for (let r = 0; r < n; r++) {
        if (!waterMask[r] || component[r] !== -1) continue;
        let head = 0;
        let tail = 0;
        let size = 0;
        component[r] = componentId;
        queue[tail++] = r;

        while (head < tail) {
            const cur = queue[head++];
            size++;
            for (let ni = mesh.adjOffset[cur], end = mesh.adjOffset[cur + 1]; ni < end; ni++) {
                const nb = mesh.adjList[ni];
                if (!waterMask[nb] || component[nb] !== -1) continue;
                component[nb] = componentId;
                queue[tail++] = nb;
            }
        }

        sizes[componentId] = size;
        if (size > largestSize) {
            largestSize = size;
            largestId = componentId;
        }
        componentId++;
    }

    const oceanConnectivity = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        if (!waterMask[r]) continue;
        oceanConnectivity[r] = component[r] === largestId ? 1 : 0.45;
    }

    return {
        oceanConnectivity,
        componentCount: componentId,
        largestOceanCells: largestSize,
    };
}

export function createGeologyMemoryDiagnostics({
    mesh,
    r_elevation,
    r_plate,
    plateIsOcean,
    debugLayers = {},
    seaLevel = 0,
} = {}) {
    const n = mesh?.numRegions || r_elevation?.length || 0;
    const oceanPlateIds = asPlateSet(plateIsOcean);
    const waterMask = new Uint8Array(n);
    const oceanicCrustMask = new Uint8Array(n);
    const landMask = new Uint8Array(n);
    const divergentSeed = new Uint8Array(n);
    const convergentSeed = new Uint8Array(n);
    const transformSeed = new Uint8Array(n);

    const boundaryKind = debugLayers.boundaryKind || null;
    const boundaryConfidence = debugLayers.boundaryConfidence || null;

    for (let r = 0; r < n; r++) {
        const isWater = r_elevation && r_elevation[r] <= seaLevel;
        const isOceanicPlate = oceanPlateIds.has(r_plate?.[r]);
        waterMask[r] = isWater ? 1 : 0;
        landMask[r] = isWater ? 0 : 1;
        oceanicCrustMask[r] = (isWater || isOceanicPlate) ? 1 : 0;

        const kind = boundaryKind ? boundaryKind[r] : 0;
        const confidence = boundaryConfidence ? boundaryConfidence[r] : 1;
        if (confidence <= 0) continue;
        if (kind < -0.25) divergentSeed[r] = 1;
        else if (kind > 0.75) convergentSeed[r] = 1;
        else if (kind > 0.25) transformSeed[r] = 1;
    }

    const oceanRidgeDist = buildMaskDistance(mesh, divergentSeed, oceanicCrustMask, 96);
    const riftDist = buildMaskDistance(mesh, divergentSeed, landMask, 36);
    const transformDist = buildMaskDistance(mesh, transformSeed, null, 40);
    const convergentDist = buildMaskDistance(mesh, convergentSeed, null, 56);
    const connectivity = computeOceanConnectivity(mesh, waterMask);

    const crustAge = new Float32Array(n);
    const riftStage = new Float32Array(n);
    const oldOrogeny = new Float32Array(n);
    const transformMemory = new Float32Array(n);
    const fractureZoneMemory = new Float32Array(n);
    const sedimentMemory = new Float32Array(n);

    const orogenicPower = debugLayers.orogenicPower || null;
    const basinWeight = debugLayers.basinWeight || null;

    for (let r = 0; r < n; r++) {
        if (oceanicCrustMask[r]) {
            const d = oceanRidgeDist[r];
            crustAge[r] = d >= 0 ? Math.min(220, d * 2.5) : 220;
        }

        if (landMask[r]) {
            const d = riftDist[r];
            riftStage[r] = d >= 0 ? Math.max(0, 5 - d / 4) : 0;
        }

        const td = transformDist[r];
        if (td >= 0) {
            const active = Math.exp(-td / 8);
            transformMemory[r] = active;
            fractureZoneMemory[r] = oceanicCrustMask[r] ? active * (0.4 + 0.6 * clamp01(crustAge[r] / 220)) : active * 0.25;
        }

        const cd = convergentDist[r];
        if (cd >= 0) {
            const source = orogenicPower ? clamp01(orogenicPower[r] + 0.5) : 0.65;
            oldOrogeny[r] = source * Math.exp(-cd / 14);
        }

        const basin = basinWeight ? clamp01(basinWeight[r]) : 0;
        const lowland = r_elevation ? clamp01((0.08 - r_elevation[r]) / 0.25) : 0;
        const waterBonus = waterMask[r] ? 0.35 : 0;
        sedimentMemory[r] = clamp01(0.55 * basin + 0.35 * lowland + waterBonus);
    }

    return {
        schema: MEMORY_SCHEMA,
        version: MEMORY_VERSION,
        layers: {
            crustAge,
            riftStage,
            oldOrogeny,
            transformMemory,
            fractureZoneMemory,
            sedimentMemory,
            oceanConnectivity: connectivity.oceanConnectivity,
        },
        metrics: {
            oceanComponentCount: connectivity.componentCount,
            largestOceanCells: connectivity.largestOceanCells,
        },
    };
}

export function attachGeologyMemoryDebugLayers(targetDebugLayers, input = {}) {
    const diagnostics = createGeologyMemoryDiagnostics(input);
    Object.assign(targetDebugLayers, diagnostics.layers);
    return {
        schema: diagnostics.schema,
        version: diagnostics.version,
        metrics: diagnostics.metrics,
    };
}
