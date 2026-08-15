// Web Worker — runs the pure computation pipeline off the main thread.
// Handles: generate, reapply, editRecompute commands.

import { makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import { setDelaunator, buildSphere, generateTriangleCenters, SphereMesh, computeNeighborDist } from './sphere-mesh.js';
import { generateCoarsePlates, projectCoarsePlates } from './coarse-plates.js';
import { smoothAndReconnectPlates } from './plates.js';
import { assignElevation } from './elevation.js';
import { buildSuperPlates } from './super-plates.js';
import { warpTerrain, smoothElevation, erodeComposite, sharpenRidges, applySoilCreep, applyDetailNoise } from './terrain-post.js';
import { computeWind } from './wind.js';
import { computeOceanCurrents } from './ocean.js';
import { computePrecipitation } from './precipitation.js';
import { computeTemperature } from './temperature.js';
import { classifyKoppen } from './koppen.js';
import { computeTerrainMetrics } from './terrain-metrics.js';
import { applyPlatePhysics, expandPlatePhysicsDebug } from './plate-physics.js';
import { attachPlateMotionDebugLayers } from './evolution/plate-motion.js';
import { attachGeologyMemoryDebugLayers } from './evolution/geology-memory.js';
import { SUPER_PLATE_PHYSICS_MULT, DETAIL_NOISE_DAMPEN_STRENGTH } from './terrain-config.js';
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';

setDelaunator(Delaunator);

// Retained state between commands (avoids re-sending mesh for reapply/edit)
let W = null;

function progress(pct, label) {
    self.postMessage({ type: 'progress', pct, label });
}

function attachPlateMotionDiagnostics(debugLayers, mesh, r_xyz, r_plate, plateVec, plateSeeds, timeMyr = 0) {
    try {
        return attachPlateMotionDebugLayers(debugLayers, {
            mesh,
            r_xyz,
            r_plate,
            plateVec,
            plateSeeds,
            timeMyr,
        });
    } catch (err) {
        if (debugLayers && mesh?.numRegions) {
            debugLayers.plateVelocity = new Float32Array(mesh.numRegions);
            debugLayers.boundaryKind = new Float32Array(mesh.numRegions);
            debugLayers.boundaryNormalSpeed = new Float32Array(mesh.numRegions);
            debugLayers.boundaryShearSpeed = new Float32Array(mesh.numRegions);
            debugLayers.boundaryRelativeSpeed = new Float32Array(mesh.numRegions);
            debugLayers.boundaryConfidence = new Float32Array(mesh.numRegions);
        }
        return {
            schema: 'world-orogen-plate-motion-model',
            version: 1,
            id: 'pmm_error',
            timeMyr,
            plateIds: [],
            plateIdByCellField: 'r_plate',
            anchorPlateId: null,
            rotations: { type: 'stage-euler', poleByPlateId: {}, omegaByPlateId: {}, units: 'world-orogen-v1' },
            diagnostics: { velocityScale: 1, source: 'plateVec', warnings: [err?.message || 'Plate motion diagnostics failed.'] },
        };
    }
}

function attachGeologyMemoryDiagnostics(debugLayers, mesh, r_elevation, r_plate, plateIsOcean) {
    try {
        return attachGeologyMemoryDebugLayers(debugLayers, {
            mesh,
            r_elevation,
            r_plate,
            plateIsOcean,
            debugLayers,
        });
    } catch (err) {
        if (debugLayers && mesh?.numRegions) {
            debugLayers.crustAge = new Float32Array(mesh.numRegions);
            debugLayers.riftStage = new Float32Array(mesh.numRegions);
            debugLayers.oldOrogeny = new Float32Array(mesh.numRegions);
            debugLayers.transformMemory = new Float32Array(mesh.numRegions);
            debugLayers.fractureZoneMemory = new Float32Array(mesh.numRegions);
            debugLayers.sedimentMemory = new Float32Array(mesh.numRegions);
            debugLayers.oceanConnectivity = new Float32Array(mesh.numRegions);
        }
        return {
            schema: 'world-orogen-geology-memory',
            version: 1,
            metrics: {},
            warnings: [err?.message || 'Geology memory diagnostics failed.'],
        };
    }
}

// 根据区域高程计算三角形高程。
function computeTriangleElevations(mesh, r_elevation) {
    const t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0 + 1), c = mesh.s_begin_r(s0 + 2);
        t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
    }
    return t_elevation;
}

// Combined craton/basin dampen field for detail noise (1 = max dampen).
// 当地质注解不可用时返回 null（例如高度图导入）。
function computeDetailDampenField(debugLayers) {
    const cw = debugLayers && debugLayers.cratonWeight;
    const bw = debugLayers && debugLayers.basinWeight;
    if (!cw || !bw) return null;
    const N = cw.length;
    const r_dampen = new Float32Array(N);
    for (let r = 0; r < N; r++) {
        const a = cw[r], b = bw[r];
        r_dampen[r] = a > b ? a : b;
    }
    return r_dampen;
}

// Orogenic power as a [0, 1] amplitude multiplier for detail noise.
// debugLayers.orogenicPower is stored as raw_oroPower − 0.5 (for diverging
// colormap), so we add 0.5 and clamp to recover the [0, 1] factor.
function computeOrogenicField(debugLayers) {
    const op = debugLayers && debugLayers.orogenicPower;
    if (!op) return null;
    const N = op.length;
    const r_oro = new Float32Array(N);
    for (let r = 0; r < N; r++) {
        const v = op[r] + 0.5;
        r_oro[r] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return r_oro;
}

// Run terrain post-processing with per-step timing
function runPostProcessing(mesh, r_xyz, r_elevation, params, neighborDist, seed, r_hotspot, r_dampen, r_orogenic) {
    const { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp } = params;
    const timing = [];

    // Terrain warp — first step, before ocean detection or smoothing
    if (terrainWarp > 0) {
        const t0 = performance.now();
        warpTerrain(mesh, r_elevation, r_xyz, seed, terrainWarp, r_hotspot);
        timing.push({ stage: `地形扭曲（强度=${terrainWarp.toFixed(2)}）`, ms: performance.now() - t0 });
    }

    const r_isOcean = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_elevation[r] <= 0) r_isOcean[r] = 1;
    }

    const preErosion = new Float32Array(r_elevation);

    if (smoothing > 0) {
        const smoothIters = Math.round(1 + smoothing * 4);
        const smoothStr = 0.2 + smoothing * 0.5;
        const t0 = performance.now();
        smoothElevation(mesh, r_elevation, r_isOcean, smoothIters, smoothStr);
        timing.push({ stage: `平滑（${smoothIters} 次迭代，强度=${smoothStr.toFixed(2)}）`, ms: performance.now() - t0 });
    }

    {
        const t0 = performance.now();
        applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
            dampenField: r_dampen ?? null,
            dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
            amplitudeField: r_orogenic ?? null,
        });
        timing.push({ stage: '细节噪声 L1（0-100 米起伏）', ms: performance.now() - t0 });
    }

    {
        const t0 = performance.now();
        applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
            amplitudeKm: 0.05,
            frequencyMult: 2.0,
            warpAmpMult: 2.0,
            bipolar: true,
            biasExponent: 0.4,
            seedOffset: 13579,
            dampenField: r_dampen ?? null,
            dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
            amplitudeField: r_orogenic ?? null,
        });
        timing.push({ stage: '细节噪声 L2（±50 米偏置）', ms: performance.now() - t0 });
    }

    if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0) {
        const gIters = Math.round(glacialErosion * 10);
        const hIters = Math.round(hydraulicErosion * 20);
        const hK = hydraulicErosion * 0.0006;
        const tIters = Math.round(thermalErosion * 10);
        const talusSlope = 1.2 - thermalErosion * 0.4;
        const kThermal = thermalErosion * 0.15;
        const t0 = performance.now();
        erodeComposite(mesh, r_elevation, r_xyz, r_isOcean,
            hIters, hK, 0.5, 1.0,
            tIters, talusSlope, kThermal,
            gIters, glacialErosion,
            neighborDist);
        timing.push({ stage: `复合侵蚀（水力=${hIters}，热侵蚀=${tIters}，冰川=${gIters}）`, ms: performance.now() - t0 });
    }

    if (ridgeSharpening > 0) {
        const rsIters = Math.round(1 + ridgeSharpening * 3);
        const rsStr = ridgeSharpening * 0.08;
        const t0 = performance.now();
        sharpenRidges(mesh, r_elevation, r_isOcean, rsIters, rsStr);
        timing.push({ stage: `山脊锐化（${rsIters} 次迭代）`, ms: performance.now() - t0 });
    }

    {
        const t0 = performance.now();
        applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);
        timing.push({ stage: '土壤蠕动（3 次迭代）', ms: performance.now() - t0 });
    }

    const dl_erosionDelta = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        dl_erosionDelta[r] = r_elevation[r] - preErosion[r];
    }

    return { dl_erosionDelta, postTiming: timing };
}

function getClimateParams(data) {
    const temperatureOffset = data?.temperatureOffset ?? W?.temperatureOffset ?? 0;
    const precipitationOffset = data?.precipitationOffset ?? W?.precipitationOffset ?? 0;
    const landCoverage = data?.landCoverage ?? W?.landCoverage ?? 0.3;
    if (W) { W.temperatureOffset = temperatureOffset; W.precipitationOffset = precipitationOffset; W.landCoverage = landCoverage; }
    return { temperatureOffset, precipitationOffset, landCoverage };
}

function buildClimateFields(windResult, oceanResult, precipResult, tempResult) {
    return {
        r_wind_east_summer: windResult?.r_wind_east_summer ?? null,
        r_wind_north_summer: windResult?.r_wind_north_summer ?? null,
        r_wind_east_winter: windResult?.r_wind_east_winter ?? null,
        r_wind_north_winter: windResult?.r_wind_north_winter ?? null,
        itczLons: windResult?.itczLons ?? null,
        itczLatsSummer: windResult?.itczLatsSummer ?? null,
        itczLatsWinter: windResult?.itczLatsWinter ?? null,
        r_ocean_current_east_summer: oceanResult?.r_ocean_current_east_summer ?? null,
        r_ocean_current_north_summer: oceanResult?.r_ocean_current_north_summer ?? null,
        r_ocean_current_east_winter: oceanResult?.r_ocean_current_east_winter ?? null,
        r_ocean_current_north_winter: oceanResult?.r_ocean_current_north_winter ?? null,
        r_ocean_speed_summer: oceanResult?.r_ocean_speed_summer ?? null,
        r_ocean_speed_winter: oceanResult?.r_ocean_speed_winter ?? null,
        r_ocean_warmth_summer: oceanResult?.r_ocean_warmth_summer ?? null,
        r_ocean_warmth_winter: oceanResult?.r_ocean_warmth_winter ?? null,
        r_precip_summer: precipResult?.r_precip_summer ?? null,
        r_precip_winter: precipResult?.r_precip_winter ?? null,
        r_temperature_summer: tempResult?.r_temperature_summer ?? null,
        r_temperature_winter: tempResult?.r_temperature_winter ?? null,
    };
}

function handleGenerate(data) {
    const { N, P, jitter, nMag, numContinents, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, terrainWarp, continentSizeVariety = 0, temperatureOffset = 0, precipitationOffset = 0, landCoverage = 0.3, seed: overrideSeed, toggledIndices, skipClimate } = data;
    const spread = 5;
    const timing = []; // top-level pipeline timing

    try {
        const tTotal0 = performance.now();

        progress(0, '正在塑造世界…');
        const seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
        const rng = makeRng(seed);

        let t0 = performance.now();
        const { mesh, r_xyz } = buildSphere(N, jitter, rng);
        timing.push({ stage: '球面网格（Fibonacci + Delaunay + 极点）', ms: performance.now() - t0 });

        t0 = performance.now();
        const neighborDist = computeNeighborDist(mesh, r_xyz);
        timing.push({ stage: '邻接距离', ms: performance.now() - t0 });

        t0 = performance.now();
        const t_xyz = generateTriangleCenters(mesh, r_xyz);
        timing.push({ stage: '三角形中心', ms: performance.now() - t0 });

        progress(10, '正在生成粗略板块…');
        t0 = performance.now();
        const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
            generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
        timing.push({ stage: `粗略板块（${P} 个板块，${numContinents} 个大陆）`, ms: performance.now() - t0 });

        progress(20, '正在投影板块…');
        t0 = performance.now();
        const r_plate = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);
        timing.push({ stage: '粗略板块投影到高分辨率', ms: performance.now() - t0 });

        progress(25, '正在平滑边界…');
        t0 = performance.now();
        smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);
        timing.push({ stage: '平滑投影板块', ms: performance.now() - t0 });

        const plateSeeds = coarsePlateSeeds;
        const plateVec = coarsePlateVec;
        const plateIsOcean = coarsePlateIsOcean;

        const originalPlateIsOcean = new Set(plateIsOcean);

        if (toggledIndices && toggledIndices.length > 0) {
            const seedArr = Array.from(plateSeeds);
            for (const i of toggledIndices) {
                if (i < seedArr.length) {
                    const r = seedArr[i];
                    if (plateIsOcean.has(r)) plateIsOcean.delete(r);
                    else plateIsOcean.add(r);
                }
            }
        }

        const plateDensity = {};
        const plateDensityLand = {};
        const plateDensityOcean = {};
        for (const r of plateSeeds) {
            const drng = makeRng(r + 777);
            plateDensityOcean[r] = 3.0 + drng() * 0.5;
            plateDensityLand[r] = 2.4 + drng() * 0.5;
            plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
        }

        const noise = new SimplexNoise(seed);

        // 应用具有物理启发的板块运动偏置。
        t0 = performance.now();
        const { plateDebug, mantleField, velDelta } = applyPlatePhysics(
            plateVec, plateSeeds, plateIsOcean,
            coarse_r_plate, coarseMesh, coarse_xyz, seed
        );
        timing.push({ stage: '板块物理（拖曳 + 板片拉力 + 洋脊推力 + 地幔流）', ms: performance.now() - t0 });

        // 构建超级板块以形成宽广造山带（板块太少时跳过）。
        let superPlateData = null;
        if (P >= 8) {
            t0 = performance.now();
            superPlateData = buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, r_plate);
            timing.push({ stage: `超级板块（由 ${P} 个板块合并为 ${superPlateData.numSuperPlates} 组）`, ms: performance.now() - t0 });

            // 对超级板块应用板块物理，并使用更强的混合。
            t0 = performance.now();
            const spSeeds = new Set();
            for (let i = 0; i < superPlateData.numSuperPlates; i++) spSeeds.add(i);
            applyPlatePhysics(
                superPlateData.superPlateVec, spSeeds, superPlateData.superPlateIsOcean,
                superPlateData.r_superPlate, mesh, r_xyz, seed + 7777,
                SUPER_PLATE_PHYSICS_MULT
            );
            timing.push({ stage: '超级板块物理', ms: performance.now() - t0 });
        }

        // Expand mantle field from coarse mesh to hi-res via plate averages
        const r_mantleField = new Float32Array(mesh.numRegions);
        {
            const plateMantleSum = {}, plateMantleN = {};
            for (let r = 0; r < coarseMesh.numRegions; r++) {
                const pid = coarse_r_plate[r];
                plateMantleSum[pid] = (plateMantleSum[pid] || 0) + mantleField[r];
                plateMantleN[pid] = (plateMantleN[pid] || 0) + 1;
            }
            for (let r = 0; r < mesh.numRegions; r++) {
                const pid = r_plate[r];
                r_mantleField[r] = plateMantleN[pid] ? plateMantleSum[pid] / plateMantleN[pid] : 0;
            }
        }

        progress(35, '正在抬升山脉…');
        t0 = performance.now();
        const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity, superPlateData, r_mantleField);
        timing.push({ stage: '高程（碰撞 + 应力 + 距离场 + 分配）', ms: performance.now() - t0 });

        const prePostElev = new Float32Array(r_elevation);
        const r_dampen = computeDetailDampenField(debugLayers);
        const r_orogenic = computeOrogenicField(debugLayers);

        progress(60, '正在侵蚀地形…');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp }, neighborDist, seed, debugLayers.hotspot, r_dampen, r_orogenic);
        timing.push({ stage: '地形后处理（总计）', ms: performance.now() - t0 });
        debugLayers.erosionDelta = dl_erosionDelta;

        // Expand plate physics diagnostics to hi-res mesh
        {
            const ppd = expandPlatePhysicsDebug(
                plateDebug, mantleField, velDelta, r_plate, mesh.numRegions,
                coarse_r_plate, coarseMesh.numRegions
            );
            debugLayers.continentalDrag = ppd.dl_continentalDrag;
            debugLayers.sizeVelocity = ppd.dl_sizeVelocity;
            debugLayers.plateSpeed = ppd.dl_plateSpeed;
            debugLayers.velChange = ppd.dl_velChange;
            debugLayers.mantleFlow = ppd.dl_mantleFlow;
        }

        let windResult = null, oceanResult = null, precipResult = null, tempResult = null;

        if (!skipClimate) {
            progress(70, '正在模拟风场…');
            t0 = performance.now();
            windResult = computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise);
            timing.push({ stage: '风场模拟', ms: performance.now() - t0 });
            if (windResult._windTiming) timing.push(...windResult._windTiming);
            debugLayers.pressureSummer = windResult.r_pressure_summer;
            debugLayers.pressureWinter = windResult.r_pressure_winter;
            debugLayers.windSpeedSummer = windResult.r_wind_speed_summer;
            debugLayers.windSpeedWinter = windResult.r_wind_speed_winter;
            debugLayers.continentality = windResult.r_continentality;

            progress(78, '正在计算洋流…');
            t0 = performance.now();
            oceanResult = computeOceanCurrents(mesh, r_xyz, r_elevation, windResult);
            timing.push({ stage: '洋流', ms: performance.now() - t0 });
            if (oceanResult._oceanTiming) timing.push(...oceanResult._oceanTiming);

            progress(82, '正在计算降水…');
            t0 = performance.now();
            precipResult = computePrecipitation(mesh, r_xyz, r_elevation, windResult, oceanResult, precipitationOffset, landCoverage);
            timing.push({ stage: '降水', ms: performance.now() - t0 });
            if (precipResult._precipTiming) timing.push(...precipResult._precipTiming);
            debugLayers.precipSummer = precipResult.r_precip_summer;
            debugLayers.precipWinter = precipResult.r_precip_winter;
            debugLayers.rainShadowSummer = precipResult.r_rainshadow_summer;
            debugLayers.rainShadowWinter = precipResult.r_rainshadow_winter;

            progress(86, '正在计算温度…');
            t0 = performance.now();
            tempResult = computeTemperature(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset);
            timing.push({ stage: '温度', ms: performance.now() - t0 });
            if (tempResult._tempTiming) timing.push(...tempResult._tempTiming);
            debugLayers.tempSummer = tempResult.r_temperature_summer;
            debugLayers.tempWinter = tempResult.r_temperature_winter;
            debugLayers.tempContinentality = tempResult.r_tempContinentality;

            t0 = performance.now();
            debugLayers.koppen = classifyKoppen(mesh, r_elevation, tempResult, precipResult);
            timing.push({ stage: '柯本分类', ms: performance.now() - t0 });
        }

        const plateMotion = attachPlateMotionDiagnostics(debugLayers, mesh, r_xyz, r_plate, plateVec, plateSeeds, 0);
        const geologyMemory = attachGeologyMemoryDiagnostics(debugLayers, mesh, r_elevation, r_plate, plateIsOcean);

        progress(skipClimate ? 75 : 90, '正在计算三角高程…');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        timing.push({ stage: '三角高程', ms: performance.now() - t0 });

        t0 = performance.now();
        // Retain state for reapply/edit (clone what we'll transfer)
        W = {
            mesh, r_xyz: new Float32Array(r_xyz), t_xyz: new Float32Array(t_xyz),
            neighborDist,
            r_plate: new Int32Array(r_plate), plateSeeds: new Set(plateSeeds), plateVec,
            plateIsOcean: new Set(plateIsOcean), originalPlateIsOcean: new Set(originalPlateIsOcean),
            plateDensity: Object.assign({}, plateDensity),
            plateDensityLand: Object.assign({}, plateDensityLand),
            plateDensityOcean: Object.assign({}, plateDensityOcean),
            prePostElev: new Float32Array(prePostElev),
            r_elevation_final: new Float32Array(r_elevation),
            seed, nMag, noise, P,
            mountain_r: new Set(mountain_r), coastline_r: new Set(coastline_r), ocean_r: new Set(ocean_r),
            r_stress: new Float32Array(r_stress),
            temperatureOffset, precipitationOffset, landCoverage,
            cachedWind: windResult, cachedOcean: oceanResult,
            plateMotion,
            geologyMemory,
            // Retain detail-noise dampen + orogenic fields so reapply (which
            // reuses prePostElev) shapes the noise the same way as the initial
            // generate over craton/basin and orogenic regions.
            r_dampen: r_dampen ? new Float32Array(r_dampen) : null,
            r_orogenic: r_orogenic ? new Float32Array(r_orogenic) : null,
            // Retain coarse-plate data so editRecompute can rebuild super
            // plates with the same detail-independent adjacency graph.
            coarseMesh, coarse_r_plate: new Int32Array(coarse_r_plate)
        };
        timing.push({ stage: '克隆状态以供保留', ms: performance.now() - t0 });

        // 使用保留状态的克隆计算地形质量指标。
        // (the originals will be transferred and neutered below).
        let terrainMetrics = null;
        try {
            terrainMetrics = computeTerrainMetrics({
                mesh: W.mesh,
                r_xyz: W.r_xyz,
                r_elevation: W.r_elevation_final,
                r_plate: W.r_plate,
                plateIsOcean: Array.from(W.plateIsOcean),
                r_stress: W.r_stress,
                debugLayers,
                prePostElev: W.prePostElev,
            });
        } catch (e) {
            terrainMetrics = { _error: e.message };
        }

        const tWorkerTotal = performance.now() - tTotal0;

        // 构建结果：不再需要的类型数组通过零拷贝转移。
        // mesh.triangles/halfedges are NOT transferred because W.mesh retains them.
        const result = {
            type: 'done',
            triangles: mesh.triangles,
            halfedges: mesh.halfedges,
            numRegions: mesh.numRegions,
            r_xyz, t_xyz, r_plate,
            plateSeeds: Array.from(plateSeeds),
            plateVec,
            plateMotion,
            geologyMemory,
            plateIsOcean: Array.from(plateIsOcean),
            originalPlateIsOcean: Array.from(originalPlateIsOcean),
            plateDensity, plateDensityLand, plateDensityOcean,
            prePostElev,
            r_elevation, t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            ...buildClimateFields(windResult, oceanResult, precipResult, tempResult),
            skipClimate: !!skipClimate,
            seed, nMag,
            debugLayers,
            _timing,                          // elevation sub-stages from assignElevation
            _pipelineTiming: timing,          // top-level pipeline stages
            _postTiming: postTiming,          // post-processing sub-stages
            _workerTotal: tWorkerTotal,
            _params: { N, P, jitter, nMag, numContinents, smoothing, terrainWarp, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, continentSizeVariety, temperatureOffset, precipitationOffset, landCoverage, seed },
            terrainMetrics
        };

        // Transfer arrays the worker no longer needs (cloned copies kept in W)
        const transferList = [
            r_xyz.buffer, t_xyz.buffer, r_plate.buffer,
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer,
            r_stress.buffer
        ];

        self.postMessage(result, transferList);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleReapply(data) {
    if (!W) { self.postMessage({ type: 'error', message: '没有可用于重新应用的保留状态' }); return; }

    const skipClimate = !!data.skipClimate;
    const { temperatureOffset, precipitationOffset, landCoverage } = getClimateParams(data);

    try {
        const tTotal0 = performance.now();

        progress(0, '正在重新应用地形…');

        let t0 = performance.now();
        const r_elevation = new Float32Array(W.prePostElev);
        const tClone = performance.now() - t0;

        progress(20, '正在侵蚀地形…');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(W.mesh, W.r_xyz, r_elevation, data, W.neighborDist, W.seed, undefined, W.r_dampen, W.r_orogenic);
        const tPost = performance.now() - t0;

        // 更新保留的最终高程，供延迟气候计算使用。
        W.r_elevation_final = new Float32Array(r_elevation);

        let windResult = null, oceanResult = null, precipResult = null, tempResult = null;
        let tWind = 0, tOcean = 0, tPrecip = 0, tTemp = 0;

        if (!skipClimate) {
            progress(60, '正在模拟风场…');
            t0 = performance.now();
            windResult = computeWind(W.mesh, W.r_xyz, r_elevation, W.plateIsOcean, W.r_plate, W.noise);
            tWind = performance.now() - t0;

            progress(75, '正在计算洋流…');
            t0 = performance.now();
            oceanResult = computeOceanCurrents(W.mesh, W.r_xyz, r_elevation, windResult);
            tOcean = performance.now() - t0;

            progress(80, '正在计算降水…');
            t0 = performance.now();
            precipResult = computePrecipitation(W.mesh, W.r_xyz, r_elevation, windResult, oceanResult, precipitationOffset, landCoverage);
            tPrecip = performance.now() - t0;

            progress(85, '正在计算温度…');
            t0 = performance.now();
            tempResult = computeTemperature(W.mesh, W.r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset);
            tTemp = performance.now() - t0;

            W.cachedWind = windResult;
            W.cachedOcean = oceanResult;
        } else {
            W.cachedWind = null;
            W.cachedOcean = null;
        }

        progress(skipClimate ? 70 : 90, '正在计算三角高程…');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(W.mesh, r_elevation);
        const tTriElev = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const result = {
            type: 'reapplyDone',
            skipClimate,
            r_elevation,
            t_elevation,
            erosionDelta: dl_erosionDelta,
            ...buildClimateFields(windResult, oceanResult, precipResult, tempResult),
            windDebugLayers: windResult ? {
                pressureSummer: windResult.r_pressure_summer,
                pressureWinter: windResult.r_pressure_winter,
                windSpeedSummer: windResult.r_wind_speed_summer,
                windSpeedWinter: windResult.r_wind_speed_winter,
                precipSummer: precipResult.r_precip_summer,
                precipWinter: precipResult.r_precip_winter,
                rainShadowSummer: precipResult.r_rainshadow_summer,
                rainShadowWinter: precipResult.r_rainshadow_winter,
                tempSummer: tempResult.r_temperature_summer,
                tempWinter: tempResult.r_temperature_winter,
                koppen: classifyKoppen(W.mesh, r_elevation, tempResult, precipResult)
            } : null,
            _reapplyTiming: {
                clone: tClone,
                postProcessing: tPost,
                wind: tWind,
                ocean: tOcean,
                precipitation: tPrecip,
                temperature: tTemp,
                triangleElevations: tTriElev,
                workerTotal: tWorkerTotal
            },
            _postTiming: postTiming
        };

        self.postMessage(result, [r_elevation.buffer, t_elevation.buffer, dl_erosionDelta.buffer]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleEditRecompute(data) {
    if (!W) { self.postMessage({ type: 'error', message: '没有可用于编辑重算的保留状态' }); return; }

    const skipClimate = !!data.skipClimate;
    const { temperatureOffset, precipitationOffset, landCoverage } = getClimateParams(data);

    try {
        const tTotal0 = performance.now();

        progress(0, '正在重建高程…');

        // 更新保留的板块状态。
        W.plateIsOcean = new Set(data.plateIsOcean);
        W.plateDensity = Object.assign({}, data.plateDensity);

        const { mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, seed } = W;
        const nMag = data.nMag;
        const spread = 5;

        // Rebuild super plates from updated plate ocean/density state
        // (uses retained coarse-plate data for detail-stable adjacency graph)
        let superPlateData = null;
        if ((W.P || 0) >= 8) {
            superPlateData = buildSuperPlates(W.coarseMesh, W.coarse_r_plate, plateSeeds, plateVec, plateIsOcean, W.plateDensity, r_plate);
        }

        let t0 = performance.now();
        const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, W.plateDensity, superPlateData);
        const tElev = performance.now() - t0;

        const prePostElev = new Float32Array(r_elevation);
        const r_dampen = computeDetailDampenField(debugLayers);
        const r_orogenic = computeOrogenicField(debugLayers);
        W.r_dampen = r_dampen ? new Float32Array(r_dampen) : null;
        W.r_orogenic = r_orogenic ? new Float32Array(r_orogenic) : null;

        progress(50, '正在侵蚀地形…');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, data, W.neighborDist, W.seed, debugLayers.hotspot, r_dampen, r_orogenic);
        const tPost = performance.now() - t0;
        debugLayers.erosionDelta = dl_erosionDelta;

        // 更新保留的最终高程，供延迟气候计算使用。
        W.r_elevation_final = new Float32Array(r_elevation);

        let windResult = null, oceanResult = null, precipResult = null, tempResult = null;
        let tWind = 0, tOcean = 0, tPrecip = 0, tTemp = 0;

        if (!skipClimate) {
            progress(65, '正在模拟风场…');
            t0 = performance.now();
            windResult = computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, W.noise);
            tWind = performance.now() - t0;
            debugLayers.pressureSummer = windResult.r_pressure_summer;
            debugLayers.pressureWinter = windResult.r_pressure_winter;
            debugLayers.windSpeedSummer = windResult.r_wind_speed_summer;
            debugLayers.windSpeedWinter = windResult.r_wind_speed_winter;
            debugLayers.continentality = windResult.r_continentality;

            progress(78, '正在计算洋流…');
            t0 = performance.now();
            oceanResult = computeOceanCurrents(mesh, r_xyz, r_elevation, windResult);
            tOcean = performance.now() - t0;

            progress(82, '正在计算降水…');
            t0 = performance.now();
            precipResult = computePrecipitation(mesh, r_xyz, r_elevation, windResult, oceanResult, precipitationOffset, landCoverage);
            tPrecip = performance.now() - t0;
            debugLayers.precipSummer = precipResult.r_precip_summer;
            debugLayers.precipWinter = precipResult.r_precip_winter;
            debugLayers.rainShadowSummer = precipResult.r_rainshadow_summer;
            debugLayers.rainShadowWinter = precipResult.r_rainshadow_winter;

            progress(86, '正在计算温度…');
            t0 = performance.now();
            tempResult = computeTemperature(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset);
            tTemp = performance.now() - t0;
            debugLayers.tempSummer = tempResult.r_temperature_summer;
            debugLayers.tempWinter = tempResult.r_temperature_winter;
            debugLayers.tempContinentality = tempResult.r_tempContinentality;

            debugLayers.koppen = classifyKoppen(mesh, r_elevation, tempResult, precipResult);

            W.cachedWind = windResult;
            W.cachedOcean = oceanResult;
        } else {
            W.cachedWind = null;
            W.cachedOcean = null;
        }

        const plateMotion = attachPlateMotionDiagnostics(debugLayers, mesh, r_xyz, r_plate, plateVec, plateSeeds, W.plateMotion?.timeMyr || 0);
        const geologyMemory = attachGeologyMemoryDiagnostics(debugLayers, mesh, r_elevation, r_plate, plateIsOcean);
        W.plateMotion = plateMotion;
        W.geologyMemory = geologyMemory;

        progress(skipClimate ? 75 : 90, '正在计算三角高程…');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        const tTriElev = performance.now() - t0;

        // 更新保留状态。
        t0 = performance.now();
        W.prePostElev = new Float32Array(prePostElev);
        W.mountain_r = new Set(mountain_r);
        W.coastline_r = new Set(coastline_r);
        W.ocean_r = new Set(ocean_r);
        W.r_stress = new Float32Array(r_stress);
        const tRetain = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const result = {
            type: 'editDone',
            skipClimate,
            prePostElev,
            r_elevation,
            t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            ...buildClimateFields(windResult, oceanResult, precipResult, tempResult),
            debugLayers,
            plateMotion,
            geologyMemory,
            _editTiming: {
                elevation: tElev,
                postProcessing: tPost,
                wind: tWind,
                ocean: tOcean,
                precipitation: tPrecip,
                temperature: tTemp,
                triangleElevations: tTriElev,
                retainState: tRetain,
                workerTotal: tWorkerTotal
            },
            _timing,        // elevation sub-stages
            _postTiming: postTiming
        };

        self.postMessage(result, [
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer, r_stress.buffer
        ]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleComputeClimate(data) {
    if (!W) { self.postMessage({ type: 'error', message: '没有可用于气候计算的保留状态' }); return; }

    const { temperatureOffset, precipitationOffset, landCoverage } = getClimateParams(data);

    try {
        const tTotal0 = performance.now();
        const { mesh, r_xyz, r_elevation_final, plateIsOcean, r_plate, noise } = W;

        let windResult = W.cachedWind;
        let oceanResult = W.cachedOcean;
        let tWind = 0, tOcean = 0;
        let t0;

        if (!windResult) {
            progress(0, '正在模拟风场…');
            t0 = performance.now();
            windResult = computeWind(mesh, r_xyz, r_elevation_final, plateIsOcean, r_plate, noise);
            tWind = performance.now() - t0;

            progress(30, '正在计算洋流…');
            t0 = performance.now();
            oceanResult = computeOceanCurrents(mesh, r_xyz, r_elevation_final, windResult);
            tOcean = performance.now() - t0;

            W.cachedWind = windResult;
            W.cachedOcean = oceanResult;
        }

        progress(50, '正在计算降水…');
        t0 = performance.now();
        const precipResult = computePrecipitation(mesh, r_xyz, r_elevation_final, windResult, oceanResult, precipitationOffset, landCoverage);
        const tPrecip = performance.now() - t0;

        progress(70, '正在计算温度…');
        t0 = performance.now();
        const tempResult = computeTemperature(mesh, r_xyz, r_elevation_final, windResult, oceanResult, precipResult, temperatureOffset);
        const tTemp = performance.now() - t0;

        progress(88, '正在分类气候…');
        t0 = performance.now();
        const koppen = classifyKoppen(mesh, r_elevation_final, tempResult, precipResult);
        const tKoppen = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const climateDebugLayers = {
            pressureSummer: windResult.r_pressure_summer,
            pressureWinter: windResult.r_pressure_winter,
            windSpeedSummer: windResult.r_wind_speed_summer,
            windSpeedWinter: windResult.r_wind_speed_winter,
            continentality: windResult.r_continentality,
            precipSummer: precipResult.r_precip_summer,
            precipWinter: precipResult.r_precip_winter,
            rainShadowSummer: precipResult.r_rainshadow_summer,
            rainShadowWinter: precipResult.r_rainshadow_winter,
            tempSummer: tempResult.r_temperature_summer,
            tempWinter: tempResult.r_temperature_winter,
            koppen
        };

        progress(95, '完成');

        self.postMessage({
            type: 'climateDone',
            r_wind_east_summer: windResult.r_wind_east_summer,
            r_wind_north_summer: windResult.r_wind_north_summer,
            r_wind_east_winter: windResult.r_wind_east_winter,
            r_wind_north_winter: windResult.r_wind_north_winter,
            itczLons: windResult.itczLons,
            itczLatsSummer: windResult.itczLatsSummer,
            itczLatsWinter: windResult.itczLatsWinter,
            r_ocean_current_east_summer: oceanResult.r_ocean_current_east_summer,
            r_ocean_current_north_summer: oceanResult.r_ocean_current_north_summer,
            r_ocean_current_east_winter: oceanResult.r_ocean_current_east_winter,
            r_ocean_current_north_winter: oceanResult.r_ocean_current_north_winter,
            r_ocean_speed_summer: oceanResult.r_ocean_speed_summer,
            r_ocean_speed_winter: oceanResult.r_ocean_speed_winter,
            r_ocean_warmth_summer: oceanResult.r_ocean_warmth_summer,
            r_ocean_warmth_winter: oceanResult.r_ocean_warmth_winter,
            r_precip_summer: precipResult.r_precip_summer,
            r_precip_winter: precipResult.r_precip_winter,
            r_temperature_summer: tempResult.r_temperature_summer,
            r_temperature_winter: tempResult.r_temperature_winter,
            climateDebugLayers,
            _climateTiming: {
                wind: tWind,
                ocean: tOcean,
                precipitation: tPrecip,
                temperature: tTemp,
                koppen: tKoppen,
                workerTotal: tWorkerTotal
            }
        });

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

// ─── Heightmap import ───────────────────────────────────────────────

/** Bilinear interpolation with equirectangular wrapping. */
function sampleBilinear(pixels, imgW, imgH, px, py) {
    // Clamp vertically, wrap horizontally
    py = Math.max(0, Math.min(py, imgH - 1));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = (x0 + 1) % imgW;     // horizontal wrap
    const y1 = Math.min(y0 + 1, imgH - 1); // vertical clamp
    const fx = px - x0, fy = py - y0;
    const v00 = pixels[y0 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v10 = pixels[y0 * imgW + x1];
    const v01 = pixels[y1 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v11 = pixels[y1 * imgW + x1];
    return (v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy);
}

/**
 * Convert grayscale 0–255 to internal elevation.
 * 0 → -0.5 (ocean floor)
 * 1–255 → inverse of 6·t² so grayscale maps linearly to km.
 * Simple sqrt inversion: t = sqrt((v-1) / 254).
 */
function grayscaleToElevation(v) {
    if (v < 1) return -0.5; // ocean (black pixels; catches interpolated fractional values too)
    return Math.sqrt((v - 1) / 254);
}

/**
 * Sample an equirectangular grayscale heightmap onto sphere mesh regions.
 * Returns r_elevation (Float32Array).
 */
function sampleHeightmap(mesh, r_xyz, imageData, imgW, imgH) {
    const r_elevation = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(x, z);
        // Map lat/lon → pixel coords (equirectangular)
        const px = (lon / Math.PI + 1) * 0.5 * imgW; // 0..W
        const py = (0.5 - lat / Math.PI) * imgH;     // 0..H
        const gray = sampleBilinear(imageData, imgW, imgH, px, py);
        r_elevation[r] = grayscaleToElevation(gray);
    }
    return r_elevation;
}

/**
 * BFS flood fill to derive synthetic plates from elevation.
 * Creates one "plate" per connected land mass and one per connected ocean basin.
 */
function deriveSyntheticPlates(mesh, r_elevation) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N).fill(-1);
    const plateSeeds = new Set();
    const plateIsOcean = new Set();
    const plateVec = {};
    const { adjOffset, adjList } = mesh;

    let plateId = 0;
    for (let r = 0; r < N; r++) {
        if (r_plate[r] >= 0) continue;
        const isOcean = r_elevation[r] <= 0;
        // BFS from this region
        r_plate[r] = r; // use r as the plate seed
        plateSeeds.add(r);
        plateVec[r] = [0, 0, 0]; // zero velocity
        if (isOcean) plateIsOcean.add(r);
        const queue = [r];
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] >= 0) continue;
                const nbOcean = r_elevation[nb] <= 0;
                if (nbOcean === isOcean) {
                    r_plate[nb] = r;
                    queue.push(nb);
                }
            }
        }
        plateId++;
    }

    return { r_plate, plateSeeds, plateIsOcean, plateVec };
}

function handleImportHeightmap(data) {
    const { N, jitter, grayscale, imageWidth, imageHeight, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, terrainWarp, temperatureOffset = 0, precipitationOffset = 0, landCoverage = 0.3, seed: overrideSeed, skipClimate } = data;
    const timing = [];

    try {
        const tTotal0 = performance.now();

        progress(0, '正在构建球面网格…');
        const seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
        const rng = makeRng(seed);

        let t0 = performance.now();
        const { mesh, r_xyz } = buildSphere(N, jitter, rng);
        timing.push({ stage: '球面网格', ms: performance.now() - t0 });

        t0 = performance.now();
        const neighborDist = computeNeighborDist(mesh, r_xyz);
        timing.push({ stage: '邻接距离', ms: performance.now() - t0 });

        t0 = performance.now();
        const t_xyz = generateTriangleCenters(mesh, r_xyz);
        timing.push({ stage: '三角形中心', ms: performance.now() - t0 });

        progress(20, '正在采样高度图…');
        t0 = performance.now();
        const r_elevation = sampleHeightmap(mesh, r_xyz, grayscale, imageWidth, imageHeight);
        timing.push({ stage: '采样高度图', ms: performance.now() - t0 });

        const prePostElev = new Float32Array(r_elevation);

        progress(35, '正在处理地形…');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp }, neighborDist, seed);
        timing.push({ stage: '地形后处理', ms: performance.now() - t0 });

        progress(50, '正在推导板块…');
        t0 = performance.now();
        const { r_plate, plateSeeds, plateIsOcean, plateVec } = deriveSyntheticPlates(mesh, r_elevation);
        timing.push({ stage: '合成板块', ms: performance.now() - t0 });

        // Classify regions
        const mountain_r = new Set();
        const coastline_r = new Set();
        const ocean_r = new Set();
        for (let r = 0; r < mesh.numRegions; r++) {
            if (r_elevation[r] <= 0) {
                ocean_r.add(r);
            } else if (r_elevation[r] > 0.5) {
                mountain_r.add(r);
            }
            // Coastline: land cell adjacent to ocean
            if (r_elevation[r] > 0) {
                const end = mesh.adjOffset[r + 1];
                for (let ni = mesh.adjOffset[r]; ni < end; ni++) {
                    if (r_elevation[mesh.adjList[ni]] <= 0) {
                        coastline_r.add(r);
                        break;
                    }
                }
            }
        }

        const r_stress = new Float32Array(mesh.numRegions); // no stress for imports
        const debugLayers = { erosionDelta: dl_erosionDelta };
        const nMag = 0;

        let windResult = null, oceanResult = null, precipResult = null, tempResult = null;

        if (!skipClimate) {
            const noise = new SimplexNoise(seed);

            progress(60, '正在模拟风场…');
            t0 = performance.now();
            windResult = computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise);
            timing.push({ stage: '风场模拟', ms: performance.now() - t0 });
            debugLayers.pressureSummer = windResult.r_pressure_summer;
            debugLayers.pressureWinter = windResult.r_pressure_winter;
            debugLayers.windSpeedSummer = windResult.r_wind_speed_summer;
            debugLayers.windSpeedWinter = windResult.r_wind_speed_winter;
            debugLayers.continentality = windResult.r_continentality;

            progress(72, '正在计算洋流…');
            t0 = performance.now();
            oceanResult = computeOceanCurrents(mesh, r_xyz, r_elevation, windResult);
            timing.push({ stage: '洋流', ms: performance.now() - t0 });

            progress(80, '正在计算降水…');
            t0 = performance.now();
            precipResult = computePrecipitation(mesh, r_xyz, r_elevation, windResult, oceanResult, precipitationOffset, landCoverage);
            timing.push({ stage: '降水', ms: performance.now() - t0 });
            debugLayers.precipSummer = precipResult.r_precip_summer;
            debugLayers.precipWinter = precipResult.r_precip_winter;
            debugLayers.rainShadowSummer = precipResult.r_rainshadow_summer;
            debugLayers.rainShadowWinter = precipResult.r_rainshadow_winter;

            progress(88, '正在计算温度…');
            t0 = performance.now();
            tempResult = computeTemperature(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset);
            timing.push({ stage: '温度', ms: performance.now() - t0 });
            debugLayers.tempSummer = tempResult.r_temperature_summer;
            debugLayers.tempWinter = tempResult.r_temperature_winter;
            debugLayers.tempContinentality = tempResult.r_tempContinentality;

            t0 = performance.now();
            debugLayers.koppen = classifyKoppen(mesh, r_elevation, tempResult, precipResult);
            timing.push({ stage: '柯本分类', ms: performance.now() - t0 });
        }

        const plateMotion = attachPlateMotionDiagnostics(debugLayers, mesh, r_xyz, r_plate, plateVec, plateSeeds, 0);
        const geologyMemory = attachGeologyMemoryDiagnostics(debugLayers, mesh, r_elevation, r_plate, plateIsOcean);

        progress(skipClimate ? 75 : 92, '正在计算三角高程…');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        timing.push({ stage: '三角高程', ms: performance.now() - t0 });

        // Retain state for reapply
        t0 = performance.now();
        W = {
            mesh, r_xyz: new Float32Array(r_xyz), t_xyz: new Float32Array(t_xyz),
            neighborDist,
            r_plate: new Int32Array(r_plate), plateSeeds: new Set(plateSeeds), plateVec,
            plateIsOcean: new Set(plateIsOcean), originalPlateIsOcean: new Set(plateIsOcean),
            plateDensity: {}, plateDensityLand: {}, plateDensityOcean: {},
            prePostElev: new Float32Array(prePostElev),
            r_elevation_final: new Float32Array(r_elevation),
            seed, nMag, noise: new SimplexNoise(seed),
            mountain_r: new Set(mountain_r), coastline_r: new Set(coastline_r), ocean_r: new Set(ocean_r),
            r_stress: new Float32Array(r_stress),
            cachedWind: windResult, cachedOcean: oceanResult,
            plateMotion,
            geologyMemory
        };
        timing.push({ stage: '克隆状态以供保留', ms: performance.now() - t0 });

        const tWorkerTotal = performance.now() - tTotal0;

        // 构建结果：形状与 handleGenerate 的 done 消息一致。
        const result = {
            type: 'done',
            triangles: mesh.triangles,
            halfedges: mesh.halfedges,
            numRegions: mesh.numRegions,
            r_xyz, t_xyz, r_plate,
            plateSeeds: Array.from(plateSeeds),
            plateVec,
            plateMotion,
            geologyMemory,
            plateIsOcean: Array.from(plateIsOcean),
            originalPlateIsOcean: Array.from(plateIsOcean),
            plateDensity: {}, plateDensityLand: {}, plateDensityOcean: {},
            prePostElev,
            r_elevation, t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            ...buildClimateFields(windResult, oceanResult, precipResult, tempResult),
            skipClimate: !!skipClimate,
            seed, nMag,
            debugLayers,
            _timing: [],
            _pipelineTiming: timing,
            _postTiming: postTiming,
            _workerTotal: tWorkerTotal,
            _params: { N, P: 0, jitter, nMag, numContinents: 0, smoothing, terrainWarp, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, seed }
        };

        const transferList = [
            r_xyz.buffer, t_xyz.buffer, r_plate.buffer,
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer,
            r_stress.buffer
        ];

        self.postMessage(result, transferList);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleSyncEvolutionTerrain(data) {
    if (!W) {
        self.postMessage({ type: 'evolutionTerrainSynced', ok: false, reason: '没有保留状态' });
        return;
    }
    if (!data.r_elevation || data.r_elevation.length !== W.mesh.numRegions) {
        self.postMessage({ type: 'evolutionTerrainSynced', ok: false, reason: '高程载荷无效' });
        return;
    }
    W.r_elevation_final = new Float32Array(data.r_elevation);
    W.geologyMemory = data.geologyMemory || W.geologyMemory || null;
    W.cachedWind = null;
    W.cachedOcean = null;
    self.postMessage({ type: 'evolutionTerrainSynced', ok: true });
}

self.onmessage = (e) => {
    const { cmd } = e.data;
    switch (cmd) {
        case 'generate': handleGenerate(e.data); break;
        case 'reapply': handleReapply(e.data); break;
        case 'editRecompute': handleEditRecompute(e.data); break;
        case 'computeClimate': handleComputeClimate(e.data); break;
        case 'importHeightmap': handleImportHeightmap(e.data); break;
        case 'syncEvolutionTerrain': handleSyncEvolutionTerrain(e.data); break;
        default: self.postMessage({ type: 'error', message: `未知命令：${cmd}` });
    }
};
