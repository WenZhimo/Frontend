const MODEL_SCHEMA = 'world-orogen-plate-motion-model';
const MODEL_VERSION = 1;

const KIND_CODES = {
    passive: 0,
    convergent: 1,
    divergent: -1,
    transform: 0.5,
    unknown: 0,
};

function isTypedArray(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function length3(a) {
    return Math.sqrt(dot(a, a));
}

function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(a, fallback = [0, 1, 0]) {
    const len = length3(a);
    return len > 1e-12 ? scale(a, 1 / len) : fallback.slice();
}

function plateIdsFromAssignment(rPlate) {
    const ids = new Set();
    if (!rPlate) return [];
    for (let i = 0; i < rPlate.length; i++) {
        if (Number.isFinite(rPlate[i]) && rPlate[i] >= 0) ids.add(rPlate[i]);
    }
    return Array.from(ids).sort((a, b) => a - b);
}

function readPlateIds(plateSeeds, rPlate, plateVec) {
    if (plateSeeds && typeof plateSeeds[Symbol.iterator] === 'function') {
        return Array.from(plateSeeds).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    }
    const fromAssignment = plateIdsFromAssignment(rPlate);
    if (fromAssignment.length) return fromAssignment;
    return Object.keys(plateVec || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

function readRotation(entry) {
    if (!entry) return { pole: [0, 1, 0], omega: 0, valid: false };
    if (entry.pole && Number.isFinite(entry.omega)) {
        return {
            pole: normalize(entry.pole),
            omega: entry.omega,
            valid: true,
        };
    }
    if ((Array.isArray(entry) || isTypedArray(entry)) && entry.length >= 3) {
        const raw = [Number(entry[0]) || 0, Number(entry[1]) || 0, Number(entry[2]) || 0];
        return {
            pole: normalize(raw),
            omega: length3(raw),
            valid: length3(raw) > 1e-12,
        };
    }
    return { pole: [0, 1, 0], omega: 0, valid: false };
}

export function createPlateMotionModelFromPlateVec({
    plateVec,
    r_plate,
    plateSeeds,
    timeMyr = 0,
    anchorPlateId = null,
} = {}) {
    const plateIds = readPlateIds(plateSeeds, r_plate, plateVec);
    const poleByPlateId = {};
    const omegaByPlateId = {};
    const warnings = [];
    let invalidRotationCount = 0;

    for (const plateId of plateIds) {
        const rotation = readRotation(plateVec?.[plateId]);
        poleByPlateId[plateId] = rotation.pole;
        omegaByPlateId[plateId] = rotation.omega;
        if (!rotation.valid) {
            invalidRotationCount++;
            if (warnings.length < 5) warnings.push(`板块 ${plateId} 没有可用欧拉旋转；速度已设为零。`);
        }
    }
    if (invalidRotationCount > warnings.length) {
        warnings.push(`另有 ${invalidRotationCount - warnings.length} 个板块没有可用欧拉旋转。`);
    }

    const resolvedAnchor = anchorPlateId ?? plateIds[0] ?? null;
    return {
        schema: MODEL_SCHEMA,
        version: MODEL_VERSION,
        id: `pmm_v${MODEL_VERSION}_${plateIds.length}_${Number(timeMyr).toFixed(3)}`,
        timeMyr,
        plateIds,
        plateIdByCellField: 'r_plate',
        anchorPlateId: resolvedAnchor,
        rotations: {
            type: 'stage-euler',
            poleByPlateId,
            omegaByPlateId,
            units: 'world-orogen-v1',
        },
        diagnostics: {
            velocityScale: 1,
            source: 'plateVec',
            warnings,
        },
    };
}

export function velocityAtPoint(model, position3, plateId) {
    const pole = model?.rotations?.poleByPlateId?.[plateId];
    const omega = model?.rotations?.omegaByPlateId?.[plateId] || 0;
    if (!pole || !Number.isFinite(omega)) return [0, 0, 0];
    return scale(cross(pole, position3), omega);
}

function classifyComponents(normalSpeed, shearSpeed, relativeSpeed) {
    const activeEpsilon = 1e-5;
    if (!Number.isFinite(relativeSpeed) || relativeSpeed <= activeEpsilon) {
        return { kind: 'passive', code: KIND_CODES.passive, confidence: 0 };
    }

    const normalAbs = Math.abs(normalSpeed);
    if (normalAbs > activeEpsilon && normalAbs >= shearSpeed * 0.65) {
        const kind = normalSpeed > 0 ? 'divergent' : 'convergent';
        return {
            kind,
            code: KIND_CODES[kind],
            confidence: normalAbs / Math.max(relativeSpeed, activeEpsilon),
        };
    }

    if (shearSpeed > activeEpsilon) {
        return {
            kind: 'transform',
            code: KIND_CODES.transform,
            confidence: shearSpeed / Math.max(relativeSpeed, activeEpsilon),
        };
    }

    return { kind: 'unknown', code: KIND_CODES.unknown, confidence: 0 };
}

function midpointOnSphere(a, b) {
    const mid = normalize(add(a, b), a);
    return mid;
}

function tangentNormalTowardNeighbor(midpoint, neighborPoint, fallback) {
    const projected = sub(neighborPoint, scale(midpoint, dot(neighborPoint, midpoint)));
    return normalize(projected, fallback);
}

export function classifyBoundary(model, r_xyz, r_plate, cellA, cellB) {
    const plateA = r_plate[cellA];
    const plateB = r_plate[cellB];
    if (plateA === plateB || plateA == null || plateB == null) {
        return {
            kind: 'passive',
            code: KIND_CODES.passive,
            plateA,
            plateB,
            normalSpeed: 0,
            shearSpeed: 0,
            relativeSpeed: 0,
            confidence: 0,
        };
    }

    const a3 = cellA * 3;
    const b3 = cellB * 3;
    const pointA = [r_xyz[a3], r_xyz[a3 + 1], r_xyz[a3 + 2]];
    const pointB = [r_xyz[b3], r_xyz[b3 + 1], r_xyz[b3 + 2]];
    const midpoint = midpointOnSphere(pointA, pointB);
    const fallbackNormal = normalize(sub(pointB, pointA), [1, 0, 0]);
    const tangentNormal = tangentNormalTowardNeighbor(midpoint, pointB, fallbackNormal);
    const vA = velocityAtPoint(model, midpoint, plateA);
    const vB = velocityAtPoint(model, midpoint, plateB);
    const relative = sub(vB, vA);
    const normalSpeed = dot(relative, tangentNormal);
    const normalVector = scale(tangentNormal, normalSpeed);
    const shear = sub(relative, normalVector);
    const shearSpeed = length3(shear);
    const relativeSpeed = length3(relative);
    const classified = classifyComponents(normalSpeed, shearSpeed, relativeSpeed);

    return {
        ...classified,
        plateA,
        plateB,
        normalSpeed,
        shearSpeed,
        relativeSpeed,
        midpoint,
        tangentNormal,
    };
}

export function buildPlateMotionDebugLayers(model, mesh, r_xyz, r_plate) {
    const n = mesh?.numRegions || r_plate?.length || 0;
    const plateVelocity = new Float32Array(n);
    const boundaryKind = new Float32Array(n);
    const boundaryNormalSpeed = new Float32Array(n);
    const boundaryShearSpeed = new Float32Array(n);
    const boundaryRelativeSpeed = new Float32Array(n);
    const boundaryConfidence = new Float32Array(n);

    for (let r = 0; r < n; r++) {
        const ri3 = r * 3;
        const pos = [r_xyz[ri3], r_xyz[ri3 + 1], r_xyz[ri3 + 2]];
        plateVelocity[r] = length3(velocityAtPoint(model, pos, r_plate[r]));

        let best = null;
        for (let ni = mesh.adjOffset[r], niEnd = mesh.adjOffset[r + 1]; ni < niEnd; ni++) {
            const nb = mesh.adjList[ni];
            if (r_plate[nb] === r_plate[r]) continue;
            const candidate = classifyBoundary(model, r_xyz, r_plate, r, nb);
            if (!best || candidate.relativeSpeed > best.relativeSpeed) best = candidate;
        }

        if (!best) continue;
        boundaryKind[r] = best.code;
        boundaryNormalSpeed[r] = best.normalSpeed;
        boundaryShearSpeed[r] = best.shearSpeed;
        boundaryRelativeSpeed[r] = best.relativeSpeed;
        boundaryConfidence[r] = best.confidence;
    }

    return {
        plateVelocity,
        boundaryKind,
        boundaryNormalSpeed,
        boundaryShearSpeed,
        boundaryRelativeSpeed,
        boundaryConfidence,
    };
}

export function createPlateMotionDiagnostics(input = {}) {
    const model = createPlateMotionModelFromPlateVec(input);
    const debugLayers = buildPlateMotionDebugLayers(model, input.mesh, input.r_xyz, input.r_plate);
    return { model, debugLayers };
}

export function attachPlateMotionDebugLayers(targetDebugLayers, input = {}) {
    const { model, debugLayers } = createPlateMotionDiagnostics(input);
    Object.assign(targetDebugLayers, debugLayers);
    return model;
}
