const CIVILIZATION_SCHEMA = 'world-orogen-civilization-state';
const CIVILIZATION_VERSION = 1;
const CIV_LAYERS = [
    'populationDensity',
    'migrationPressure',
    'settlementRank',
    'cultureId',
    'languageId',
    'polityId',
    'subsistenceMode',
    'civilizationActivity',
];

function clamp01(value) {
    return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
}

function makeRng(seed) {
    let s = (Number(seed) || 1) >>> 0;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return ((s >>> 0) / 4294967296);
    };
}

function cellNoise(seed, cell, salt = 0) {
    let x = ((Number(seed) || 1) ^ Math.imul(cell + 1, 2654435761) ^ Math.imul(salt + 17, 1597334677)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 2246822507) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 3266489909) >>> 0;
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

function readLayer(debugLayers, key, n, fallback = 0) {
    const arr = debugLayers?.[key];
    if (arr && arr.length === n) return arr;
    const out = new Float32Array(n);
    if (fallback !== 0) out.fill(fallback);
    return out;
}

function environmentScore(env, cell) {
    return clamp01(
        env.habitability[cell] * 0.34 +
        env.freshwaterAccess[cell] * 0.18 +
        env.agriculturePotential[cell] * 0.22 +
        (1 - env.mobilityCost[cell]) * 0.12 +
        env.resourceAttraction[cell] * 0.10 +
        env.riverTravel[cell] * 0.04
    );
}

function makeEnvironment(curData) {
    const n = curData?.mesh?.numRegions || curData?.r_elevation?.length || 0;
    const debugLayers = curData?.debugLayers || {};
    return {
        n,
        habitability: readLayer(debugLayers, 'habitability', n),
        freshwaterAccess: readLayer(debugLayers, 'freshwaterAccess', n),
        agriculturePotential: readLayer(debugLayers, 'agriculturePotential', n),
        mobilityCost: readLayer(debugLayers, 'mobilityCost', n, 0.5),
        seaTravel: readLayer(debugLayers, 'seaTravel', n),
        riverTravel: readLayer(debugLayers, 'riverTravel', n),
        naturalBarrier: readLayer(debugLayers, 'naturalBarrier', n),
        resourceAttraction: readLayer(debugLayers, 'resourceAttraction', n),
        elevation: curData?.r_elevation || new Float32Array(n),
    };
}

function insertCandidate(candidates, item, limit) {
    if (item.score <= 0) return;
    let i = candidates.length;
    while (i > 0 && candidates[i - 1].score < item.score) i--;
    candidates.splice(i, 0, item);
    if (candidates.length > limit) candidates.length = limit;
}

function graphDistanceOk(mesh, selected, cell, minDistance) {
    if (!selected.length) return true;
    let minSeen = Infinity;
    for (const other of selected) {
        const ax = other.xyz[0], ay = other.xyz[1], az = other.xyz[2];
        const bx = other.r_xyz[3 * cell], by = other.r_xyz[3 * cell + 1], bz = other.r_xyz[3 * cell + 2];
        const dot = clamp(ax * bx + ay * by + az * bz, -1, 1);
        const dist = Math.acos(dot);
        if (dist < minSeen) minSeen = dist;
    }
    return minSeen >= minDistance;
}

function selectFounderCells(curData, env, count) {
    const { mesh, r_xyz } = curData;
    const candidates = [];
    const limit = Math.max(64, count * 18);
    for (let r = 0; r < env.n; r++) {
        if (env.elevation[r] <= 0) continue;
        const score = environmentScore(env, r) + cellNoise(curData.seed, r, 41) * 0.035;
        insertCandidate(candidates, { cell: r, score }, limit);
    }

    const selected = [];
    const minDistance = Math.max(0.16, 1.2 / Math.sqrt(Math.max(1, count)));
    for (const candidate of candidates) {
        if (selected.length >= count) break;
        if (!graphDistanceOk(mesh, selected, candidate.cell, minDistance)) continue;
        selected.push({
            cell: candidate.cell,
            score: candidate.score,
            xyz: [r_xyz[3 * candidate.cell], r_xyz[3 * candidate.cell + 1], r_xyz[3 * candidate.cell + 2]],
            r_xyz,
        });
    }
    for (const candidate of candidates) {
        if (selected.length >= count) break;
        if (selected.some(item => item.cell === candidate.cell)) continue;
        selected.push({
            cell: candidate.cell,
            score: candidate.score,
            xyz: [r_xyz[3 * candidate.cell], r_xyz[3 * candidate.cell + 1], r_xyz[3 * candidate.cell + 2]],
            r_xyz,
        });
    }
    return selected.map(item => item.cell);
}

function createSettlementForGroup(state, group, env, year) {
    const settlement = {
        id: state.nextSettlementId++,
        cell: group.cell,
        population: Math.round(group.population * 0.55),
        rank: 1,
        cultureId: group.cultureId,
        languageId: group.languageId,
        polityId: null,
        foundedYear: year,
    };
    state.settlements.push(settlement);
    group.settlementId = settlement.id;
    state.eventLog.push({ year, type: 'settlement-founded', groupId: group.id, settlementId: settlement.id, cell: group.cell });
    return settlement;
}

function polityById(state, id) {
    return state.polities.find(polity => polity.id === id) || null;
}

function activePolities(state) {
    return state.polities.filter(polity => polity.status !== 'collapsed');
}

function maybeCreatePolity(state, group, settlement, env, year) {
    const existing = polityById(state, settlement.polityId);
    if (existing && existing.status !== 'collapsed') return existing;
    if (settlement.lastPolityCollapseYear != null && year - settlement.lastPolityCollapseYear < 400) return null;

    const organizationScore = clamp01(
        settlement.population / 2600 * 0.42 +
        group.technologyLevel * 0.24 +
        group.tradeReach * 0.16 +
        env.agriculturePotential[settlement.cell] * 0.12 +
        env.resourceAttraction[settlement.cell] * 0.10
    );
    if (settlement.population < 1150 || organizationScore < 0.45) return null;

    const polity = {
        id: state.nextPolityId++,
        capitalCell: settlement.cell,
        cultureId: settlement.cultureId,
        population: settlement.population,
        formedYear: year,
        lastActiveYear: year,
        stability: clamp(0.46 + organizationScore * 0.48, 0.35, 0.92),
        status: 'chiefdom',
    };
    state.polities.push(polity);
    settlement.polityId = polity.id;
    state.eventLog.push({ year, type: 'polity-formed', polityId: polity.id, settlementId: settlement.id, cell: settlement.cell });
    return polity;
}

function updatePolityForSettlement(state, group, settlement, env, year) {
    const polity = maybeCreatePolity(state, group, settlement, env, year);
    if (!polity || polity.status === 'collapsed') return null;

    const cell = settlement.cell;
    const stress = clamp01(
        group.collapseRisk * 0.45 +
        group.conflictPressure * 0.30 +
        (1 - env.habitability[cell]) * 0.18 +
        env.naturalBarrier[cell] * 0.10 -
        group.tradeReach * 0.16
    );
    const resilience = clamp01(
        env.freshwaterAccess[cell] * 0.25 +
        env.agriculturePotential[cell] * 0.22 +
        group.technologyLevel * 0.20 +
        group.tradeReach * 0.18
    );
    polity.population = settlement.population;
    polity.capitalCell = cell;
    polity.cultureId = settlement.cultureId;
    polity.lastActiveYear = year;
    polity.stability = clamp01((polity.stability ?? 0.65) + (resilience - stress) * 0.06);
    polity.status = settlement.rank >= 3 && polity.population > 5200 && polity.stability > 0.42 ? 'state' : 'chiefdom';

    const age = year - polity.formedYear;
    const collapseRoll = cellNoise(state.seed, cell, polity.id * 97 + state.stepIndex * 13);
    if (age > 300 && polity.stability < 0.20 && collapseRoll > 0.58) {
        polity.status = 'collapsed';
        polity.collapsedYear = year;
        settlement.polityId = null;
        settlement.lastPolityCollapseYear = year;
        group.polityId = null;
        state.eventLog.push({ year, type: 'polity-collapsed', polityId: polity.id, settlementId: settlement.id, cell });
        return null;
    }
    return polity;
}

function civilizationMetrics(state) {
    const population = state.populationGroups.reduce((sum, group) => sum + group.population, 0);
    const livingGroups = state.populationGroups.filter(group => group.population > 1).length;
    const activePolityCount = activePolities(state).length;
    return {
        population: Math.round(population),
        livingGroups,
        settlements: state.settlements.length,
        cultures: state.cultures.length,
        languages: state.languages.length,
        polities: activePolityCount,
        collapsedPolities: state.polities.length - activePolityCount,
        events: state.eventLog.length,
    };
}

export function createCivilizationState(curData, { founderCount = 14, startYear = 0 } = {}) {
    const env = makeEnvironment(curData);
    const seed = (Number(curData?.seed) || 1) ^ 0x9e3779b9;
    const rng = makeRng(seed);
    const founderCells = selectFounderCells(curData, env, founderCount);
    const state = {
        schema: CIVILIZATION_SCHEMA,
        version: CIVILIZATION_VERSION,
        seed,
        timeYear: startYear,
        stepIndex: 0,
        nextGroupId: 1,
        nextCultureId: 1,
        nextLanguageId: 1,
        nextSettlementId: 1,
        nextPolityId: 1,
        populationGroups: [],
        settlements: [],
        cultures: [],
        languages: [],
        polities: [],
        eventLog: [],
        metrics: {},
    };

    for (const cell of founderCells) {
        const cultureId = state.nextCultureId++;
        const languageId = state.nextLanguageId++;
        state.cultures.push({ id: cultureId, parentId: null, originCell: cell, bornYear: startYear });
        state.languages.push({ id: languageId, parentId: null, originCell: cell, bornYear: startYear });
        state.populationGroups.push({
            id: state.nextGroupId++,
            cell,
            previousCell: cell,
            originCell: cell,
            population: Math.round(420 + rng() * 420 + environmentScore(env, cell) * 520),
            cultureId,
            languageId,
            settlementId: null,
            polityId: null,
            subsistenceMode: env.agriculturePotential[cell] > 0.58 ? 'horticultural' : 'foraging',
            migrationPressure: 0,
            technologyLevel: 0.08 + env.resourceAttraction[cell] * 0.08,
            tradeReach: 0.08 + Math.max(env.riverTravel[cell], env.seaTravel[cell]) * 0.18,
            conflictPressure: 0,
            collapseRisk: 0,
            path: [cell],
        });
        state.eventLog.push({ year: startYear, type: 'group-founded', groupId: state.nextGroupId - 1, cell });
    }

    state.metrics = civilizationMetrics(state);
    curData.civilizationState = state;
    attachCivilizationDebugLayers(curData);
    return state;
}

function bestNeighborForGroup(curData, env, group) {
    const { mesh } = curData;
    const currentScore = environmentScore(env, group.cell);
    let bestCell = group.cell;
    let bestScore = currentScore - env.mobilityCost[group.cell] * 0.08;
    for (let ni = mesh.adjOffset[group.cell], end = mesh.adjOffset[group.cell + 1]; ni < end; ni++) {
        const nb = mesh.adjList[ni];
        if (env.elevation[nb] <= 0 && env.seaTravel[group.cell] < 0.6) continue;
        const travel = Math.max(env.riverTravel[nb], env.seaTravel[nb] * 0.6);
        const score = environmentScore(env, nb)
            - env.mobilityCost[nb] * 0.20
            - env.naturalBarrier[nb] * 0.14
            + travel * 0.10
            + cellNoise(curData.seed, nb, group.id + group.path.length) * 0.03;
        if (score > bestScore) {
            bestScore = score;
            bestCell = nb;
        }
    }
    return { bestCell, bestScore, currentScore };
}

function settlementById(state, id) {
    return state.settlements.find(settlement => settlement.id === id) || null;
}

function splitIdentityIfNeeded(state, group, env, year) {
    const isolation = clamp01(env.naturalBarrier[group.cell] * 0.55 + env.mobilityCost[group.cell] * 0.35);
    const ageFactor = Math.min(1, state.stepIndex / 20);
    const roll = cellNoise(state.seed, group.cell, group.id + state.stepIndex * 31);
    if (isolation * ageFactor > 0.36 && roll > 0.64) {
        const cultureId = state.nextCultureId++;
        state.cultures.push({ id: cultureId, parentId: group.cultureId, originCell: group.cell, bornYear: year });
        group.cultureId = cultureId;
        state.eventLog.push({ year, type: 'culture-split', groupId: group.id, cultureId, cell: group.cell });
    }
    if (isolation * ageFactor > 0.34 && roll < 0.26) {
        const languageId = state.nextLanguageId++;
        state.languages.push({ id: languageId, parentId: group.languageId, originCell: group.cell, bornYear: year });
        group.languageId = languageId;
        state.eventLog.push({ year, type: 'language-split', groupId: group.id, languageId, cell: group.cell });
    }
}

export function stepCivilizationInPlace(curData, { dtYear = 100 } = {}) {
    const state = curData?.civilizationState?.schema === CIVILIZATION_SCHEMA
        ? curData.civilizationState
        : createCivilizationState(curData);
    const env = makeEnvironment(curData);
    const years = Math.max(1, Number(dtYear) || 100);
    const yearScale = years / 100;
    state.timeYear += years;
    state.stepIndex++;

    const newGroups = [];
    for (const group of state.populationGroups) {
        if (group.population <= 1) continue;
        const { bestCell, bestScore, currentScore } = bestNeighborForGroup(curData, env, group);
        const localCapacity = 500 + currentScore * 6200 + env.agriculturePotential[group.cell] * 4800;
        const crowding = clamp01(group.population / Math.max(1, localCapacity));
        const pressure = clamp01(crowding * 0.55 + Math.max(0, bestScore - currentScore) * 0.80 + (1 - currentScore) * 0.18);
        group.migrationPressure = pressure;
        group.previousCell = group.cell;
        if (bestCell !== group.cell && pressure > 0.20) {
            group.cell = bestCell;
            group.path.push(bestCell);
            if (group.path.length > 32) group.path.shift();
        }

        const ag = env.agriculturePotential[group.cell];
        const fresh = env.freshwaterAccess[group.cell];
        const habitat = env.habitability[group.cell];
        if (ag > 0.56 && fresh > 0.38 && group.population > 520) {
            group.subsistenceMode = 'agricultural';
        } else if (env.mobilityCost[group.cell] < 0.38 && ag < 0.42) {
            group.subsistenceMode = 'pastoral';
        }

        const growthBase = group.subsistenceMode === 'agricultural' ? 0.055 : (group.subsistenceMode === 'pastoral' ? 0.032 : 0.022);
        const growth = (growthBase * habitat + fresh * 0.014 - group.collapseRisk * 0.035 - crowding * 0.025) * yearScale;
        group.population = Math.max(0, Math.round(group.population * (1 + growth)));
        group.technologyLevel = clamp01(group.technologyLevel + (ag * 0.008 + env.resourceAttraction[group.cell] * 0.006) * yearScale);
        group.tradeReach = clamp01(group.tradeReach + Math.max(env.riverTravel[group.cell], env.seaTravel[group.cell]) * 0.010 * yearScale);
        group.conflictPressure = clamp01(crowding * 0.45 + env.resourceAttraction[group.cell] * 0.16 - group.tradeReach * 0.10);
        group.collapseRisk = clamp01((1 - habitat) * 0.32 + crowding * 0.28 + env.naturalBarrier[group.cell] * 0.12);

        if (!group.settlementId && group.subsistenceMode === 'agricultural' && group.population > 760) {
            createSettlementForGroup(state, group, env, state.timeYear);
        }
        const settlement = settlementById(state, group.settlementId);
        if (settlement) {
            settlement.population = Math.max(settlement.population, Math.round(settlement.population * (1 + (0.035 * habitat + ag * 0.025) * yearScale)));
            settlement.rank = 1 + (settlement.population > 1800 ? 1 : 0) + (settlement.population > 5200 ? 1 : 0) + (settlement.population > 12000 ? 1 : 0);
            settlement.cell = group.cell;
            settlement.cultureId = group.cultureId;
            settlement.languageId = group.languageId;
            updatePolityForSettlement(state, group, settlement, env, state.timeYear);
            group.polityId = settlement.polityId;
        }

        if (group.population > 4200 && pressure > 0.32) {
            const childPop = Math.round(group.population * 0.32);
            group.population -= childPop;
            const childCulture = group.cultureId;
            const childLanguage = group.languageId;
            const child = {
                ...group,
                id: state.nextGroupId++,
                previousCell: group.cell,
                population: childPop,
                cultureId: childCulture,
                languageId: childLanguage,
                settlementId: null,
                polityId: null,
                path: [group.cell],
            };
            const move = bestNeighborForGroup(curData, env, child);
            child.cell = move.bestCell;
            child.path.push(child.cell);
            newGroups.push(child);
            state.eventLog.push({ year: state.timeYear, type: 'group-split', parentGroupId: group.id, groupId: child.id, cell: child.cell });
        }

        splitIdentityIfNeeded(state, group, env, state.timeYear);
    }

    state.populationGroups.push(...newGroups);
    state.eventLog = state.eventLog.slice(-120);
    state.metrics = civilizationMetrics(state);
    attachCivilizationDebugLayers(curData);
    if (curData.evolutionState?.dependencies) curData.evolutionState.dependencies.civilizationComputed = true;
    return state;
}

function addInfluence(layer, mesh, cell, value, neighborFactor = 0.35) {
    layer[cell] += value;
    for (let ni = mesh.adjOffset[cell], end = mesh.adjOffset[cell + 1]; ni < end; ni++) {
        layer[mesh.adjList[ni]] += value * neighborFactor;
    }
}

export function attachCivilizationDebugLayers(curData) {
    const state = curData?.civilizationState;
    const mesh = curData?.mesh;
    if (!state || !mesh || !curData.debugLayers) return null;
    const n = mesh.numRegions;
    const populationDensity = new Float32Array(n);
    const migrationPressure = new Float32Array(n);
    const settlementRank = new Float32Array(n);
    const cultureId = new Float32Array(n);
    const languageId = new Float32Array(n);
    const polityId = new Float32Array(n);
    const subsistenceMode = new Float32Array(n);
    const civilizationActivity = new Float32Array(n);

    for (const group of state.populationGroups) {
        const popValue = clamp01(group.population / 9000);
        addInfluence(populationDensity, mesh, group.cell, popValue, 0.18);
        addInfluence(migrationPressure, mesh, group.cell, clamp01(group.migrationPressure), 0.20);
        addInfluence(civilizationActivity, mesh, group.cell, popValue * 0.7 + clamp01(group.technologyLevel) * 0.3, 0.22);
        cultureId[group.cell] = group.cultureId;
        languageId[group.cell] = group.languageId;
        const groupPolity = polityById(state, group.polityId);
        polityId[group.cell] = groupPolity && groupPolity.status !== 'collapsed' ? groupPolity.id + 1 : 0;
        subsistenceMode[group.cell] = group.subsistenceMode === 'agricultural' ? 1 : (group.subsistenceMode === 'pastoral' ? 0.55 : 0.2);
        for (const cell of group.path) {
            migrationPressure[cell] = Math.max(migrationPressure[cell], clamp01(group.migrationPressure * 0.65));
            civilizationActivity[cell] = Math.max(civilizationActivity[cell], popValue * 0.45);
        }
    }

    for (const settlement of state.settlements) {
        const rankValue = clamp01(settlement.rank / 4);
        addInfluence(settlementRank, mesh, settlement.cell, rankValue, 0.25);
        civilizationActivity[settlement.cell] = Math.max(civilizationActivity[settlement.cell], rankValue);
        cultureId[settlement.cell] = settlement.cultureId;
        languageId[settlement.cell] = settlement.languageId;
        const settlementPolity = polityById(state, settlement.polityId);
        polityId[settlement.cell] = settlementPolity && settlementPolity.status !== 'collapsed' ? settlementPolity.id + 1 : polityId[settlement.cell];
    }

    for (let r = 0; r < n; r++) {
        populationDensity[r] = clamp01(populationDensity[r]);
        migrationPressure[r] = clamp01(migrationPressure[r]);
        settlementRank[r] = clamp01(settlementRank[r]);
        civilizationActivity[r] = clamp01(civilizationActivity[r]);
    }

    Object.assign(curData.debugLayers, {
        populationDensity,
        migrationPressure,
        settlementRank,
        cultureId,
        languageId,
        polityId,
        subsistenceMode,
        civilizationActivity,
    });
    return {
        schema: CIVILIZATION_SCHEMA,
        version: CIVILIZATION_VERSION,
        layers: CIV_LAYERS.slice(),
        metrics: state.metrics,
    };
}

export function ensureCivilizationState(curData, options = {}) {
    if (curData?.civilizationState?.schema === CIVILIZATION_SCHEMA) {
        attachCivilizationDebugLayers(curData);
        return curData.civilizationState;
    }
    return createCivilizationState(curData, options);
}

export function civilizationLayerNames() {
    return CIV_LAYERS.slice();
}
