// 行星生成：把工作分发给 Web Worker，必要时回退到
// 同步主线程生成（当模块 Worker 不受支持时）。

import Delaunator from 'delaunator';
import { setDelaunator, SphereMesh } from './sphere-mesh.js';
import { computePlateColors, buildMesh } from './planet-mesh.js';
import { state } from './state.js';
import { detailFromSlider } from './detail-scale.js';
import { computeOceanCurrents } from './ocean.js';
import { computePrecipitation } from './precipitation.js';
import { computeTemperature } from './temperature.js';
import { classifyKoppen } from './koppen.js';
import { attachEnvironmentInputDebugLayers } from './evolution/environment-inputs.js';

// 主线程仍需要 Delaunator 来重建 SphereMesh。
setDelaunator(Delaunator);

// 从 DOM 读取所有滑块值并组装为参数对象。
function readSliders() {
    return {
        N: detailFromSlider(+document.getElementById('sN').value),
        P: +document.getElementById('sP').value,
        jitter: +document.getElementById('sJ').value,
        nMag: +document.getElementById('sNs').value,
        numContinents: +document.getElementById('sCn').value,
        terrainWarp: +document.getElementById('sTw').value,
        smoothing: +document.getElementById('sS').value,
        hydraulicErosion: +document.getElementById('sHEr').value,
        thermalErosion: +document.getElementById('sTEr').value,
        ridgeSharpening: +document.getElementById('sRs').value,
        glacialErosion: +document.getElementById('sGl').value,
        continentSizeVariety: +document.getElementById('sCsv').value,
        temperatureOffset: +document.getElementById('sTmp').value,
        precipitationOffset: +document.getElementById('sPrc').value,
        landCoverage: +document.getElementById('sLc').value,
    };
}

// 使用可选链读取滑块（导入页可能没有某些滑块）。
function readSlidersOptional() {
    return {
        N: detailFromSlider(+document.getElementById('sN').value),
        jitter: +(document.getElementById('sJ')?.value ?? 0.75),
        terrainWarp: +(document.getElementById('sTw')?.value ?? 0),
        smoothing: +(document.getElementById('sS')?.value ?? 0),
        hydraulicErosion: +(document.getElementById('sHEr')?.value ?? 0),
        thermalErosion: +(document.getElementById('sTEr')?.value ?? 0),
        ridgeSharpening: +(document.getElementById('sRs')?.value ?? 0),
        glacialErosion: +(document.getElementById('sGl')?.value ?? 0),
    };
}

// --- Worker 设置 ---
let worker = null;
let workerSupported = true;
try {
    worker = new Worker(new URL('./planet-worker.js', import.meta.url), { type: 'module' });
} catch (e) {
    console.warn('[World Orogen] 当前环境不支持模块 Worker，回退到主线程：', e);
    workerSupported = false;
}

// 当前回调状态
let _onProgress = null;
let _on完成 = null;
let _t0 = 0;

function resetUI() {
    const btn = document.getElementById('generate');
    btn.disabled = false;
    btn.textContent = '生成新世界';
    btn.classList.remove('generating', 'stale');
}

function fail(err) {
    console.error('[World Orogen] 生成失败：', err);
    resetUI();
    if (_onProgress) _onProgress(0, '');
}

// 根据传输数据重建 SphereMesh。
function reconstructMesh(triangles, halfedges, numRegions) {
    return new SphereMesh(triangles, halfedges, numRegions);
}

// 为 computeOceanCurrents 回退路径构建最小风场结果对象。
// 从 r_xyz/r_elevation 派生地理数据（纬度、纬度正弦、海陆、切平面坐标系），
// 并包装 Worker 已经发送的风矢量。
function buildWindResultForOcean(mesh, r_xyz, r_elevation,
    r_wind_east_summer, r_wind_north_summer, r_wind_east_winter, r_wind_north_winter,
    itczLons, itczLatsSummer, itczLatsWinter) {
    const n = mesh.numRegions;
    const r_lat = new Float32Array(n);
    const r_lon = new Float32Array(n);
    const r_sinLat = new Float32Array(n);
    const r_isLand = new Uint8Array(n);
    const r_eastX = new Float32Array(n), r_eastY = new Float32Array(n), r_eastZ = new Float32Array(n);
    const r_northX = new Float32Array(n), r_northY = new Float32Array(n), r_northZ = new Float32Array(n);

    for (let r = 0; r < n; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        r_sinLat[r] = y;
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, y)));
        r_lon[r] = Math.atan2(x, z);
        r_isLand[r] = r_elevation[r] > 0 ? 1 : 0;

        // 东向 = cross(up, position) 后归一化。
        let ex = z, ey = 0, ez = -x;
        const elen = Math.sqrt(ex * ex + ez * ez);
        if (elen > 1e-10) { ex /= elen; ez /= elen; }
        else { ex = 1; ez = 0; } // poles
        r_eastX[r] = ex; r_eastY[r] = ey; r_eastZ[r] = ez;

        // 北向 = cross(position, east) 后归一化。
        let nx = y * ez - z * ey;
        let ny = z * ex - x * ez;
        let nz = x * ey - y * ex;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        r_northX[r] = nx / nlen; r_northY[r] = ny / nlen; r_northZ[r] = nz / nlen;
    }

    // 穿越陆地的 BFS 海岸距离（降水回退路径需要）。
    const { adjOffset, adjList } = mesh;
    const r_coastDistLand = new Int32Array(n);
    r_coastDistLand.fill(-1);
    const bfsQueue = [];
    for (let r = 0; r < n; r++) {
        if (!r_isLand[r]) continue;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            if (!r_isLand[adjList[ni]]) {
                r_coastDistLand[r] = 0;
                bfsQueue.push(r);
                break;
            }
        }
    }
    let bfsHead = 0;
    while (bfsHead < bfsQueue.length) {
        const r = bfsQueue[bfsHead++];
        const d = r_coastDistLand[r] + 1;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (r_isLand[nb] && r_coastDistLand[nb] === -1) {
                r_coastDistLand[nb] = d;
                bfsQueue.push(nb);
            }
        }
    }

    // 根据分量计算风速（避免访问时触发 TypeError）。
    const r_wind_speed_summer = new Float32Array(n);
    const r_wind_speed_winter = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const se = r_wind_east_summer[r], sn = r_wind_north_summer[r];
        r_wind_speed_summer[r] = Math.sqrt(se * se + sn * sn);
        const we = r_wind_east_winter[r], wn = r_wind_north_winter[r];
        r_wind_speed_winter[r] = Math.sqrt(we * we + wn * wn);
    }

    // 用零填充气压偏差（中性：回退路径中不引入气压驱动效应）。
    const r_pressure_summer = new Float32Array(n);
    const r_pressure_winter = new Float32Array(n);

    return {
        r_lat, r_lon, r_sinLat, r_isLand,
        r_eastX, r_eastY, r_eastZ,
        r_northX, r_northY, r_northZ,
        r_coastDistLand,
        r_wind_east_summer, r_wind_north_summer,
        r_wind_east_winter, r_wind_north_winter,
        r_wind_speed_summer, r_wind_speed_winter,
        r_pressure_summer, r_pressure_winter,
        itczLons, itczLatsSummer, itczLatsWinter
    };
}

if (worker) {
    worker.onmessage = (e) => {
        const msg = e.data;
        switch (msg.type) {
            case 'progress':
                if (_onProgress) _onProgress(msg.pct, msg.label);
                break;

            case 'done': {
                const tMainStart = performance.now();

                const tReconStart = performance.now();
                const mesh = reconstructMesh(msg.triangles, msg.halfedges, msg.numRegions);
                const tRecon = performance.now() - tReconStart;

                const tColorsStart = performance.now();
                computePlateColors(new Set(msg.plateSeeds), new Set(msg.plateIsOcean));
                const tColors = performance.now() - tColorsStart;

                state.climateComputed = !msg.skipClimate;

                const tStateStart = performance.now();
                state.curData = {
                    mesh,
                    r_xyz: msg.r_xyz,
                    t_xyz: msg.t_xyz,
                    r_plate: msg.r_plate,
                    plateSeeds: new Set(msg.plateSeeds),
                    plateVec: msg.plateVec,
                    plateMotion: msg.plateMotion || null,
                    geologyMemory: msg.geologyMemory || null,
                    plateIsOcean: new Set(msg.plateIsOcean),
                    originalPlateIsOcean: new Set(msg.originalPlateIsOcean),
                    plateDensity: msg.plateDensity,
                    plateDensityLand: msg.plateDensityLand,
                    plateDensityOcean: msg.plateDensityOcean,
                    prePostElev: msg.prePostElev,
                    r_elevation: msg.r_elevation,
                    t_elevation: msg.t_elevation,
                    mountain_r: new Set(msg.mountain_r),
                    coastline_r: new Set(msg.coastline_r),
                    ocean_r: new Set(msg.ocean_r),
                    r_stress: msg.r_stress,
                    r_wind_east_summer: msg.r_wind_east_summer,
                    r_wind_north_summer: msg.r_wind_north_summer,
                    r_wind_east_winter: msg.r_wind_east_winter,
                    r_wind_north_winter: msg.r_wind_north_winter,
                    itczLons: msg.itczLons,
                    itczLatsSummer: msg.itczLatsSummer,
                    itczLatsWinter: msg.itczLatsWinter,
                    r_ocean_current_east_summer: msg.r_ocean_current_east_summer,
                    r_ocean_current_north_summer: msg.r_ocean_current_north_summer,
                    r_ocean_current_east_winter: msg.r_ocean_current_east_winter,
                    r_ocean_current_north_winter: msg.r_ocean_current_north_winter,
                    r_ocean_speed_summer: msg.r_ocean_speed_summer,
                    r_ocean_speed_winter: msg.r_ocean_speed_winter,
                    r_ocean_warmth_summer: msg.r_ocean_warmth_summer,
                    r_ocean_warmth_winter: msg.r_ocean_warmth_winter,
                    r_precip_summer: msg.r_precip_summer,
                    r_precip_winter: msg.r_precip_winter,
                    r_temperature_summer: msg.r_temperature_summer,
                    r_temperature_winter: msg.r_temperature_winter,
                    seed: msg.seed,
                    nMag: msg.nMag,
                    debugLayers: msg.debugLayers,
                    terrainMetrics: msg.terrainMetrics || null
                };
                if (msg.terrainMetrics) window.__terrainMetrics = msg.terrainMetrics;
                const tState = performance.now() - tStateStart;

                // 主线程回退：仅在请求了气候但部分数据缺失时运行。
                // 例如旧缓存 Worker；设置 skipClimate 时完全跳过。
                if (!msg.skipClimate) {
                    let tOceanFallback = 0;
                    const d = state.curData;
                    let windResult = null;
                    if (msg.r_wind_east_summer && (!d.r_ocean_speed_summer || !d.r_precip_summer || !d.r_temperature_summer)) {
                        windResult = buildWindResultForOcean(mesh, d.r_xyz, d.r_elevation,
                            d.r_wind_east_summer, d.r_wind_north_summer,
                            d.r_wind_east_winter, d.r_wind_north_winter,
                            d.itczLons, d.itczLatsSummer, d.itczLatsWinter);
                    }

                    if (!d.r_ocean_speed_summer && windResult) {
                        console.log('[generate.js] Worker 缺少海洋数据，正在主线程计算');
                        const t0Ocean = performance.now();
                        const oceanResult = computeOceanCurrents(mesh, d.r_xyz, d.r_elevation, windResult);
                        d.r_ocean_current_east_summer = oceanResult.r_ocean_current_east_summer;
                        d.r_ocean_current_north_summer = oceanResult.r_ocean_current_north_summer;
                        d.r_ocean_current_east_winter = oceanResult.r_ocean_current_east_winter;
                        d.r_ocean_current_north_winter = oceanResult.r_ocean_current_north_winter;
                        d.r_ocean_speed_summer = oceanResult.r_ocean_speed_summer;
                        d.r_ocean_speed_winter = oceanResult.r_ocean_speed_winter;
                        d.r_ocean_warmth_summer = oceanResult.r_ocean_warmth_summer;
                        d.r_ocean_warmth_winter = oceanResult.r_ocean_warmth_winter;
                        tOceanFallback = performance.now() - t0Ocean;
                        console.log(`[generate.js] 洋流已在主线程计算完成，耗时 ${tOceanFallback.toFixed(0)} ms`);
                    }

                    if (!d.r_precip_summer && windResult) {
                        console.log('[generate.js] Worker 缺少降水数据，正在主线程计算');
                        const t0Precip = performance.now();
                        const precipResult = computePrecipitation(mesh, d.r_xyz, d.r_elevation, windResult, d);
                        d.r_precip_summer = precipResult.r_precip_summer;
                        d.r_precip_winter = precipResult.r_precip_winter;
                        if (d.debugLayers) {
                            d.debugLayers.precipSummer = precipResult.r_precip_summer;
                            d.debugLayers.precipWinter = precipResult.r_precip_winter;
                            d.debugLayers.rainShadowSummer = precipResult.r_rainshadow_summer;
                            d.debugLayers.rainShadowWinter = precipResult.r_rainshadow_winter;
                        }
                        console.log(`[generate.js] 降水已在主线程计算完成，耗时 ${(performance.now() - t0Precip).toFixed(0)} ms`);
                    }

                    if (!d.r_temperature_summer && windResult) {
                        console.log('[generate.js] Worker 缺少温度数据，正在主线程计算');
                        const t0Temp = performance.now();
                        const tempResult = computeTemperature(mesh, d.r_xyz, d.r_elevation, windResult, d, d);
                        d.r_temperature_summer = tempResult.r_temperature_summer;
                        d.r_temperature_winter = tempResult.r_temperature_winter;
                        if (d.debugLayers) {
                            d.debugLayers.tempSummer = tempResult.r_temperature_summer;
                            d.debugLayers.tempWinter = tempResult.r_temperature_winter;
                            d.debugLayers.tempContinentality = tempResult.r_tempContinentality;
                        }
                        console.log(`[generate.js] 温度已在主线程计算完成，耗时 ${(performance.now() - t0Temp).toFixed(0)} ms`);
                    }

                    if (state.curData.debugLayers && !state.curData.debugLayers.koppen &&
                        state.curData.r_temperature_summer && state.curData.r_precip_summer) {
                        const d = state.curData;
                        d.debugLayers.koppen = classifyKoppen(mesh, d.r_elevation,
                            { r_temperature_summer: d.r_temperature_summer, r_temperature_winter: d.r_temperature_winter },
                            { r_precip_summer: d.r_precip_summer, r_precip_winter: d.r_precip_winter });
                    }
                }

                refreshEnvironmentInputs(state.curData);

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;
                const tTotal = performance.now() - _t0;

                // 诊断
                {
                    let landCount = 0, nanCount = 0;
                    const plateIsOcean = state.curData.plateIsOcean;
                    const r_plate = state.curData.r_plate;
                    const r_elevation = state.curData.r_elevation;
                    for (let r = 0; r < mesh.numRegions; r++) {
                        if (!plateIsOcean.has(r_plate[r])) landCount++;
                        if (isNaN(r_elevation[r])) nanCount++;
                    }
                    const landPct = (100 * landCount / mesh.numRegions).toFixed(1);
                    if (nanCount > 0) console.error(`[World Orogen] 警告：检测到 ${nanCount} 个 NaN 高程值！`);
                    if (landCount / mesh.numRegions < 0.10) console.warn(`[World Orogen] 警告：陆地仅占 ${landPct}%（${landCount} 个区域）。海陆扩张可能已停滞。`);
                }

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;

                console.log(`%c[World Orogen] 生成完成`, 'color:#6cf;font-weight:bold');
                if (msg._params) {
                    console.log(`  参数：N=${msg._params.N.toLocaleString()} P=${msg._params.P} 抖动=${msg._params.jitter} 噪声=${msg._params.nMag} 大陆=${msg._params.numContinents} 种子=${msg._params.seed}`);
                    console.log(`  地形雕刻：扭曲=${msg._params.terrainWarp} 平滑=${msg._params.smoothing} 冰川=${msg._params.glacialErosion} 水力=${msg._params.hydraulicErosion} 热侵蚀=${msg._params.thermalErosion} 山脊=${msg._params.ridgeSharpening}`);
                }
                console.log(`  区域：${mesh.numRegions.toLocaleString()}  三角形：${mesh.numTriangles.toLocaleString()}  边：${mesh.numSides.toLocaleString()}`);

                // Worker 管线阶段
                if (msg._pipelineTiming) {
                    console.groupCollapsed('  %cWorker 管线阶段', 'color:#8cf');
                    console.table(msg._pipelineTiming.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }

                // 高程子阶段
                if (msg._timing) {
                    console.groupCollapsed('  %c高程子阶段', 'color:#fc8');
                    console.table(msg._timing.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }

                // 后处理子阶段
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %c后处理子阶段', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }

                // 汇总
                const tWorker = msg._workerTotal || 0;
                const tTransfer = tTotal - tWorker - tMainTotal;
                console.log(
                    `  %c汇总：%c Worker：${f(tWorker)} 毫秒 | 传输：${f(tTransfer)} 毫秒 | 主线程：${f(tMainTotal)} 毫秒（重建=${f(tRecon)}，着色=${f(tColors)}，状态=${f(tState)}，构建网格=${f(tBuild)}）| 总计：${f(tTotal)} 毫秒`,
                    'color:#ff6;font-weight:bold', ''
                );

                const ms = tTotal.toFixed(0);
                document.getElementById('stats').innerHTML =
                    `区域：${mesh.numRegions.toLocaleString()}<br>` +
                    `三角形：${mesh.numTriangles.toLocaleString()}<br>` +
                    `生成耗时：${ms} 毫秒<br>` +
                    `<span style="color:#445;font-size:10px">worker ${tWorker.toFixed(0)} · 渲染 ${tBuild.toFixed(0)}</span>`;

                if (_onProgress) _onProgress(100, '完成');
                resetUI();
                document.getElementById('generate').dispatchEvent(new CustomEvent('generate-done'));
                if (_on完成) { _on完成(); _on完成 = null; }
                break;
            }

            case 'reapply完成': {
                const tMainStart = performance.now();
                state.climateComputed = !msg.skipClimate;
                const d = state.curData;
                d.r_elevation = msg.r_elevation;
                d.t_elevation = msg.t_elevation;
                d.debugLayers.erosionDelta = msg.erosionDelta;
                if (msg.r_wind_east_summer) {
                    d.r_wind_east_summer = msg.r_wind_east_summer;
                    d.r_wind_north_summer = msg.r_wind_north_summer;
                    d.r_wind_east_winter = msg.r_wind_east_winter;
                    d.r_wind_north_winter = msg.r_wind_north_winter;
                }
                if (msg.itczLons) {
                    d.itczLons = msg.itczLons;
                    d.itczLatsSummer = msg.itczLatsSummer;
                    d.itczLatsWinter = msg.itczLatsWinter;
                }
                if (msg.r_ocean_current_east_summer) {
                    d.r_ocean_current_east_summer = msg.r_ocean_current_east_summer;
                    d.r_ocean_current_north_summer = msg.r_ocean_current_north_summer;
                    d.r_ocean_current_east_winter = msg.r_ocean_current_east_winter;
                    d.r_ocean_current_north_winter = msg.r_ocean_current_north_winter;
                    d.r_ocean_speed_summer = msg.r_ocean_speed_summer;
                    d.r_ocean_speed_winter = msg.r_ocean_speed_winter;
                    d.r_ocean_warmth_summer = msg.r_ocean_warmth_summer;
                    d.r_ocean_warmth_winter = msg.r_ocean_warmth_winter;
                }
                // 回退：若 Worker 未计算洋流，则在主线程计算。
                if (!d.r_ocean_speed_summer && d.r_wind_east_summer) {
                    const wr = buildWindResultForOcean(d.mesh, d.r_xyz, d.r_elevation,
                        d.r_wind_east_summer, d.r_wind_north_summer,
                        d.r_wind_east_winter, d.r_wind_north_winter,
                        d.itczLons, d.itczLatsSummer, d.itczLatsWinter);
                    const oc = computeOceanCurrents(d.mesh, d.r_xyz, d.r_elevation, wr);
                    Object.keys(oc).filter(k => k.startsWith('r_ocean_')).forEach(k => d[k] = oc[k]);
                }
                if (msg.r_precip_summer) {
                    d.r_precip_summer = msg.r_precip_summer;
                    d.r_precip_winter = msg.r_precip_winter;
                }
                if (msg.r_temperature_summer) {
                    d.r_temperature_summer = msg.r_temperature_summer;
                    d.r_temperature_winter = msg.r_temperature_winter;
                }
                if (msg.windDebugLayers) {
                    Object.assign(d.debugLayers, msg.windDebugLayers);
                }
                // 回退：若已请求气候但数据缺失，则在主线程计算降水/温度。
                // 例如只拿到部分 Worker 结果。
                if (!msg.skipClimate && d.r_wind_east_summer) {
                    let wr = null;
                    if (!d.r_precip_summer || !d.r_temperature_summer) {
                        wr = buildWindResultForOcean(d.mesh, d.r_xyz, d.r_elevation,
                            d.r_wind_east_summer, d.r_wind_north_summer,
                            d.r_wind_east_winter, d.r_wind_north_winter,
                            d.itczLons, d.itczLatsSummer, d.itczLatsWinter);
                    }
                    if (!d.r_precip_summer && wr) {
                        const pr = computePrecipitation(d.mesh, d.r_xyz, d.r_elevation, wr, d);
                        d.r_precip_summer = pr.r_precip_summer;
                        d.r_precip_winter = pr.r_precip_winter;
                        if (d.debugLayers) {
                            d.debugLayers.precipSummer = pr.r_precip_summer;
                            d.debugLayers.precipWinter = pr.r_precip_winter;
                            d.debugLayers.rainShadowSummer = pr.r_rainshadow_summer;
                            d.debugLayers.rainShadowWinter = pr.r_rainshadow_winter;
                        }
                    }
                    if (!d.r_temperature_summer && wr) {
                        const tr = computeTemperature(d.mesh, d.r_xyz, d.r_elevation, wr, d, d);
                        d.r_temperature_summer = tr.r_temperature_summer;
                        d.r_temperature_winter = tr.r_temperature_winter;
                        if (d.debugLayers) {
                            d.debugLayers.tempSummer = tr.r_temperature_summer;
                            d.debugLayers.tempWinter = tr.r_temperature_winter;
                        }
                    }
                }
                // 跳过气候时清除过期气候数据，避免渲染层
                // 显示上一次运行遗留的地形/气候错配。
                if (msg.skipClimate) {
                    d.r_precip_summer = null;
                    d.r_precip_winter = null;
                    d.r_temperature_summer = null;
                    d.r_temperature_winter = null;
                    if (d.debugLayers) {
                        d.debugLayers.koppen = null;
                        d.debugLayers.tempSummer = null;
                        d.debugLayers.tempWinter = null;
                        d.debugLayers.precipSummer = null;
                        d.debugLayers.precipWinter = null;
                    }
                }

                refreshEnvironmentInputs(d);

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;
                const rt = msg._reapplyTiming || {};
                console.log(`%c[World Orogen] 重新应用完成`, 'color:#8f8;font-weight:bold');
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %c后处理子阶段', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }
                console.log(
                    `  %c汇总：%c Worker：${f(rt.workerTotal || 0)} 毫秒（克隆=${f(rt.clone || 0)}，后处理=${f(rt.postProcessing || 0)}，三角高程=${f(rt.triangleElevations || 0)}）| 主线程：${f(tMainTotal)} 毫秒（构建网格=${f(tBuild)}）`,
                    'color:#ff6;font-weight:bold', ''
                );

                if (_onProgress) _onProgress(100, '完成');
                if (_on完成) { _on完成(); _on完成 = null; }
                break;
            }

            case 'edit完成': {
                const tMainStart = performance.now();
                state.climateComputed = !msg.skipClimate;
                const d = state.curData;
                d.prePostElev = msg.prePostElev;
                d.r_elevation = msg.r_elevation;
                d.t_elevation = msg.t_elevation;
                d.mountain_r = new Set(msg.mountain_r);
                d.coastline_r = new Set(msg.coastline_r);
                d.ocean_r = new Set(msg.ocean_r);
                d.r_stress = msg.r_stress;
                if (msg.r_wind_east_summer) {
                    d.r_wind_east_summer = msg.r_wind_east_summer;
                    d.r_wind_north_summer = msg.r_wind_north_summer;
                    d.r_wind_east_winter = msg.r_wind_east_winter;
                    d.r_wind_north_winter = msg.r_wind_north_winter;
                }
                if (msg.itczLons) {
                    d.itczLons = msg.itczLons;
                    d.itczLatsSummer = msg.itczLatsSummer;
                    d.itczLatsWinter = msg.itczLatsWinter;
                }
                if (msg.r_ocean_current_east_summer) {
                    d.r_ocean_current_east_summer = msg.r_ocean_current_east_summer;
                    d.r_ocean_current_north_summer = msg.r_ocean_current_north_summer;
                    d.r_ocean_current_east_winter = msg.r_ocean_current_east_winter;
                    d.r_ocean_current_north_winter = msg.r_ocean_current_north_winter;
                    d.r_ocean_speed_summer = msg.r_ocean_speed_summer;
                    d.r_ocean_speed_winter = msg.r_ocean_speed_winter;
                    d.r_ocean_warmth_summer = msg.r_ocean_warmth_summer;
                    d.r_ocean_warmth_winter = msg.r_ocean_warmth_winter;
                }
                // 回退：若 Worker 未计算洋流，则在主线程计算。
                if (!d.r_ocean_speed_summer && d.r_wind_east_summer) {
                    const wr = buildWindResultForOcean(d.mesh, d.r_xyz, d.r_elevation,
                        d.r_wind_east_summer, d.r_wind_north_summer,
                        d.r_wind_east_winter, d.r_wind_north_winter,
                        d.itczLons, d.itczLatsSummer, d.itczLatsWinter);
                    const oc = computeOceanCurrents(d.mesh, d.r_xyz, d.r_elevation, wr);
                    Object.keys(oc).filter(k => k.startsWith('r_ocean_')).forEach(k => d[k] = oc[k]);
                }
                if (msg.r_precip_summer) {
                    d.r_precip_summer = msg.r_precip_summer;
                    d.r_precip_winter = msg.r_precip_winter;
                }
                if (msg.r_temperature_summer) {
                    d.r_temperature_summer = msg.r_temperature_summer;
                    d.r_temperature_winter = msg.r_temperature_winter;
                }
                d.debugLayers = msg.debugLayers;
                d.plateMotion = msg.plateMotion || d.plateMotion || null;
                d.geologyMemory = msg.geologyMemory || d.geologyMemory || null;
                // 回退：若已请求气候但数据缺失，则在主线程计算降水/温度。
                // 例如只拿到部分 Worker 结果。
                if (!msg.skipClimate && d.r_wind_east_summer) {
                    let wr = null;
                    if (!d.r_precip_summer || !d.r_temperature_summer) {
                        wr = buildWindResultForOcean(d.mesh, d.r_xyz, d.r_elevation,
                            d.r_wind_east_summer, d.r_wind_north_summer,
                            d.r_wind_east_winter, d.r_wind_north_winter,
                            d.itczLons, d.itczLatsSummer, d.itczLatsWinter);
                    }
                    if (!d.r_precip_summer && wr) {
                        const pr = computePrecipitation(d.mesh, d.r_xyz, d.r_elevation, wr, d);
                        d.r_precip_summer = pr.r_precip_summer;
                        d.r_precip_winter = pr.r_precip_winter;
                        if (d.debugLayers) {
                            d.debugLayers.precipSummer = pr.r_precip_summer;
                            d.debugLayers.precipWinter = pr.r_precip_winter;
                            d.debugLayers.rainShadowSummer = pr.r_rainshadow_summer;
                            d.debugLayers.rainShadowWinter = pr.r_rainshadow_winter;
                        }
                    }
                    if (!d.r_temperature_summer && wr) {
                        const tr = computeTemperature(d.mesh, d.r_xyz, d.r_elevation, wr, d, d);
                        d.r_temperature_summer = tr.r_temperature_summer;
                        d.r_temperature_winter = tr.r_temperature_winter;
                        if (d.debugLayers) {
                            d.debugLayers.tempSummer = tr.r_temperature_summer;
                            d.debugLayers.tempWinter = tr.r_temperature_winter;
                        }
                    }
                }
                // Clear stale climate data when climate was skipped
                if (msg.skipClimate) {
                    d.r_precip_summer = null;
                    d.r_precip_winter = null;
                    d.r_temperature_summer = null;
                    d.r_temperature_winter = null;
                    if (d.debugLayers) {
                        d.debugLayers.koppen = null;
                        d.debugLayers.tempSummer = null;
                        d.debugLayers.tempWinter = null;
                        d.debugLayers.precipSummer = null;
                        d.debugLayers.precipWinter = null;
                    }
                }

                refreshEnvironmentInputs(d);

                const tColorsStart = performance.now();
                computePlateColors(d.plateSeeds, d.plateIsOcean);
                const tColors = performance.now() - tColorsStart;

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;
                const et = msg._editTiming || {};
                console.log(`%c[World Orogen] 编辑重算完成`, 'color:#fc8;font-weight:bold');

                if (msg._timing) {
                    console.groupCollapsed('  %c高程子阶段', 'color:#fc8');
                    console.table(msg._timing.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %c后处理子阶段', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ 阶段: r.stage, '毫秒': f(r.ms) })));
                    console.groupEnd();
                }
                console.log(
                    `  %c汇总：%c Worker：${f(et.workerTotal || 0)} 毫秒（高程=${f(et.elevation || 0)}，后处理=${f(et.postProcessing || 0)}，三角高程=${f(et.triangleElevations || 0)}，保留状态=${f(et.retainState || 0)}）| 主线程：${f(tMainTotal)} 毫秒（着色=${f(tColors)}，构建网格=${f(tBuild)}）`,
                    'color:#ff6;font-weight:bold', ''
                );

                if (_onProgress) _onProgress(100, '完成');
                if (_on完成) { _on完成(); _on完成 = null; }
                break;
            }

            case 'climate完成': {
                const d = state.curData;
                if (d) {
                    // 复制所有气候数组
                    d.r_wind_east_summer = msg.r_wind_east_summer;
                    d.r_wind_north_summer = msg.r_wind_north_summer;
                    d.r_wind_east_winter = msg.r_wind_east_winter;
                    d.r_wind_north_winter = msg.r_wind_north_winter;
                    d.itczLons = msg.itczLons;
                    d.itczLatsSummer = msg.itczLatsSummer;
                    d.itczLatsWinter = msg.itczLatsWinter;
                    d.r_ocean_current_east_summer = msg.r_ocean_current_east_summer;
                    d.r_ocean_current_north_summer = msg.r_ocean_current_north_summer;
                    d.r_ocean_current_east_winter = msg.r_ocean_current_east_winter;
                    d.r_ocean_current_north_winter = msg.r_ocean_current_north_winter;
                    d.r_ocean_speed_summer = msg.r_ocean_speed_summer;
                    d.r_ocean_speed_winter = msg.r_ocean_speed_winter;
                    d.r_ocean_warmth_summer = msg.r_ocean_warmth_summer;
                    d.r_ocean_warmth_winter = msg.r_ocean_warmth_winter;
                    d.r_precip_summer = msg.r_precip_summer;
                    d.r_precip_winter = msg.r_precip_winter;
                    d.r_temperature_summer = msg.r_temperature_summer;
                    d.r_temperature_winter = msg.r_temperature_winter;
                    // 合并气候检查图层
                    if (msg.climateDebugLayers && d.debugLayers) {
                        Object.assign(d.debugLayers, msg.climateDebugLayers);
                    }
                }
                refreshEnvironmentInputs(d);
                state.climateComputed = true;
                buildMesh();

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;
                const ct = msg._climateTiming || {};
                console.log(`%c[World Orogen] 气候已按需计算`, 'color:#f8a;font-weight:bold');
                console.log(
                    `  %c汇总：%c Worker：${f(ct.workerTotal || 0)} 毫秒（风场=${f(ct.wind || 0)}，海洋=${f(ct.ocean || 0)}，降水=${f(ct.precipitation || 0)}，温度=${f(ct.temperature || 0)}，柯本=${f(ct.koppen || 0)}）`,
                    'color:#ff6;font-weight:bold', ''
                );

                if (_onProgress) _onProgress(100, '完成');
                if (_on完成) { _on完成(); _on完成 = null; }
                break;
            }

            case 'evolutionTerrainSynced':
                break;

            case 'error':
                fail(msg.message);
                if (_on完成) { _on完成(); _on完成 = null; }
                break;
        }
    };

    worker.onerror = (e) => {
        fail(e.message || 'Worker crashed');
        if (_on完成) { _on完成(); _on完成 = null; }
    };
}

// --- Synchronous fallback (imported lazily to avoid loading when worker works) ---
let _fallbackModules = null;
async function loadFallback() {
    if (_fallbackModules) return _fallbackModules;
    const [rng, simplex, sphere, plates, ocean, elev, post, wind, oceanCurrents, precip, temp, coarsePlates, plateMotion, geologyMemory] = await Promise.all([
        import('./rng.js'),
        import('./simplex-noise.js'),
        import('./sphere-mesh.js'),
        import('./plates.js'),
        import('./ocean-land.js'),
        import('./elevation.js'),
        import('./terrain-post.js'),
        import('./wind.js'),
        import('./ocean.js'),
        import('./precipitation.js'),
        import('./temperature.js'),
        import('./coarse-plates.js'),
        import('./evolution/plate-motion.js'),
        import('./evolution/geology-memory.js')
    ]);
    _fallbackModules = { rng, simplex, sphere, plates, ocean, elev, post, wind, oceanCurrents, precip, temp, coarsePlates, plateMotion, geologyMemory };
    return _fallbackModules;
}

function generateFallback(overrideSeed, toggledIndices, onProgress, skipClimate) {
    // 动态导入已完成，通过 rAF 阶段同步运行。
    const m = _fallbackModules;
    const btn = document.getElementById('generate');
    const { N, P, jitter, nMag, numContinents, terrainWarp, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, continentSizeVariety, temperatureOffset, precipitationOffset, landCoverage } = readSliders();
    const progress = onProgress || (() => {});
    const ctx = {};

    const stages = [
        { pct: 0, label: '正在塑造世界…', work() {
            ctx.seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
            ctx.rng = m.rng.makeRng(ctx.seed);
            const { mesh, r_xyz } = m.sphere.buildSphere(N, jitter, ctx.rng);
            ctx.mesh = mesh; ctx.r_xyz = r_xyz;
            ctx.t_xyz = m.sphere.generateTriangleCenters(mesh, r_xyz);
            ctx.neighborDist = m.sphere.computeNeighborDist(mesh, r_xyz);
        }},
        { pct: 10, label: '正在生成粗略板块…', work() {
            const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
                m.coarsePlates.generateCoarsePlates(ctx.seed, P, numContinents, continentSizeVariety, landCoverage);
            ctx.coarseMesh = coarseMesh; ctx.coarse_xyz = coarse_xyz;
            ctx.coarse_r_plate = coarse_r_plate;
            ctx.plateSeeds = coarsePlateSeeds; ctx.plateVec = coarsePlateVec;
            ctx.coarsePlateIsOcean = coarsePlateIsOcean;
        }},
        { pct: 18, label: '正在投影板块…', work() {
            ctx.r_plate = m.coarsePlates.projectCoarsePlates(ctx.mesh, ctx.r_xyz, ctx.coarseMesh, ctx.coarse_xyz, ctx.coarse_r_plate, ctx.seed, P);
            m.plates.smoothAndReconnectPlates(ctx.mesh, ctx.r_plate, ctx.plateSeeds, 3);
        }},
        { pct: 25, label: '正在刻画海洋…', work() {
            const plateIsOcean = ctx.coarsePlateIsOcean;
            ctx.originalPlateIsOcean = new Set(plateIsOcean);
            if (toggledIndices.length > 0) {
                const seedArr = Array.from(ctx.plateSeeds);
                for (const i of toggledIndices) {
                    if (i < seedArr.length) {
                        const r = seedArr[i];
                        if (plateIsOcean.has(r)) plateIsOcean.delete(r);
                        else plateIsOcean.add(r);
                    }
                }
            }
            computePlateColors(ctx.plateSeeds, plateIsOcean);
            const plateDensity = {}, plateDensityLand = {}, plateDensityOcean = {};
            for (const r of ctx.plateSeeds) {
                const drng = m.rng.makeRng(r + 777);
                plateDensityOcean[r] = 3.0 + drng() * 0.5;
                plateDensityLand[r] = 2.4 + drng() * 0.5;
                plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
            }
            ctx.plateIsOcean = plateIsOcean; ctx.plateDensity = plateDensity;
            ctx.plateDensityLand = plateDensityLand; ctx.plateDensityOcean = plateDensityOcean;
            ctx.noise = new m.simplex.SimplexNoise(ctx.seed);
        }},
        { pct: 35, label: '正在抬升山脉…', work() {
            const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
                m.elev.assignElevation(ctx.mesh, ctx.r_xyz, ctx.plateIsOcean, ctx.r_plate, ctx.plateVec, ctx.plateSeeds, ctx.noise, nMag, ctx.seed, 5, ctx.plateDensity);
            ctx.r_elevation = r_elevation; ctx.mountain_r = mountain_r; ctx.coastline_r = coastline_r;
            ctx.ocean_r = ocean_r; ctx.r_stress = r_stress; ctx.debugLayers = debugLayers;
            ctx.prePostElev = new Float32Array(r_elevation);
            if (terrainWarp > 0) m.post.warpTerrain(ctx.mesh, r_elevation, ctx.r_xyz, ctx.seed, terrainWarp, debugLayers.hotspot);
            const r_isOcean = new Uint8Array(ctx.mesh.numRegions);
            for (let r = 0; r < ctx.mesh.numRegions; r++) { if (r_elevation[r] <= 0) r_isOcean[r] = 1; }
            const preErosion = new Float32Array(r_elevation);
            if (smoothing > 0) m.post.smoothElevation(ctx.mesh, r_elevation, r_isOcean, Math.round(1 + smoothing * 4), 0.2 + smoothing * 0.5);
            // 构建克拉通+盆地抑制场，让地质安静区的细节噪声更克制。
            let r_dampen = null;
            if (debugLayers.cratonWeight && debugLayers.basinWeight) {
                r_dampen = new Float32Array(ctx.mesh.numRegions);
                for (let r = 0; r < ctx.mesh.numRegions; r++) {
                    const a = debugLayers.cratonWeight[r], b = debugLayers.basinWeight[r];
                    r_dampen[r] = a > b ? a : b;
                }
            }
            // 造山强度振幅乘数：从发散色标存储的 [-0.5, +0.5] 还原到 [0,1]。
            let r_orogenic = null;
            if (debugLayers.orogenicPower) {
                r_orogenic = new Float32Array(ctx.mesh.numRegions);
                for (let r = 0; r < ctx.mesh.numRegions; r++) {
                    const v = debugLayers.orogenicPower[r] + 0.5;
                    r_orogenic[r] = v < 0 ? 0 : (v > 1 ? 1 : v);
                }
            }
            m.post.applyDetailNoise(ctx.mesh, ctx.r_xyz, r_elevation, r_isOcean, ctx.seed, {
                dampenField: r_dampen, dampenStrength: 0.5,
                amplitudeField: r_orogenic,
            });
            m.post.applyDetailNoise(ctx.mesh, ctx.r_xyz, r_elevation, r_isOcean, ctx.seed, {
                amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0,
                bipolar: true, biasExponent: 0.4, seedOffset: 13579,
                dampenField: r_dampen, dampenStrength: 0.5,
                amplitudeField: r_orogenic,
            });
            if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0)
                m.post.erodeComposite(ctx.mesh, r_elevation, ctx.r_xyz, r_isOcean, Math.round(hydraulicErosion * 20), hydraulicErosion * 0.0006, 0.5, 1.0, Math.round(thermalErosion * 10), 1.2 - thermalErosion * 0.4, thermalErosion * 0.15, Math.round(glacialErosion * 10), glacialErosion, ctx.neighborDist);
            if (ridgeSharpening > 0) m.post.sharpenRidges(ctx.mesh, r_elevation, r_isOcean, Math.round(1 + ridgeSharpening * 3), ridgeSharpening * 0.08);
            m.post.applySoilCreep(ctx.mesh, r_elevation, r_isOcean, 3, 0.1125);
            const dl_erosionDelta = new Float32Array(ctx.mesh.numRegions);
            for (let r = 0; r < ctx.mesh.numRegions; r++) dl_erosionDelta[r] = r_elevation[r] - preErosion[r];
            debugLayers.erosionDelta = dl_erosionDelta;
            if (!skipClimate) {
                const windResult = m.wind.computeWind(ctx.mesh, ctx.r_xyz, r_elevation, ctx.plateIsOcean, ctx.r_plate, ctx.noise);
                debugLayers.pressureSummer = windResult.r_pressure_summer;
                debugLayers.pressureWinter = windResult.r_pressure_winter;
                debugLayers.windSpeedSummer = windResult.r_wind_speed_summer;
                debugLayers.windSpeedWinter = windResult.r_wind_speed_winter;
                ctx.windResult = windResult;
                const oceanResult = m.oceanCurrents.computeOceanCurrents(ctx.mesh, ctx.r_xyz, r_elevation, windResult);
                ctx.oceanResult = oceanResult;
                const precipResult = m.precip.computePrecipitation(ctx.mesh, ctx.r_xyz, r_elevation, windResult, oceanResult, precipitationOffset, landCoverage);
                ctx.precipResult = precipResult;
                debugLayers.precipSummer = precipResult.r_precip_summer;
                debugLayers.precipWinter = precipResult.r_precip_winter;
                debugLayers.rainShadowSummer = precipResult.r_rainshadow_summer;
                debugLayers.rainShadowWinter = precipResult.r_rainshadow_winter;
                const tempResult = m.temp.computeTemperature(ctx.mesh, ctx.r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset);
                ctx.tempResult = tempResult;
                debugLayers.tempSummer = tempResult.r_temperature_summer;
                debugLayers.tempWinter = tempResult.r_temperature_winter;
                debugLayers.tempContinentality = tempResult.r_tempContinentality;
                debugLayers.koppen = classifyKoppen(ctx.mesh, r_elevation, tempResult, precipResult);
            }
            ctx.plateMotion = m.plateMotion.attachPlateMotionDebugLayers(debugLayers, {
                mesh: ctx.mesh,
                r_xyz: ctx.r_xyz,
                r_plate: ctx.r_plate,
                plateVec: ctx.plateVec,
                plateSeeds: ctx.plateSeeds,
                timeMyr: 0,
            });
            ctx.geologyMemory = m.geologyMemory.attachGeologyMemoryDebugLayers(debugLayers, {
                mesh: ctx.mesh,
                r_elevation,
                r_plate: ctx.r_plate,
                plateIsOcean: ctx.plateIsOcean,
                debugLayers,
            });
            const t_elevation = new Float32Array(ctx.mesh.numTriangles);
            for (let t = 0; t < ctx.mesh.numTriangles; t++) {
                const s0 = 3 * t;
                const a = ctx.mesh.s_begin_r(s0), b = ctx.mesh.s_begin_r(s0+1), c = ctx.mesh.s_begin_r(s0+2);
                t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
            }
            ctx.t_elevation = t_elevation;
        }},
        { pct: 85, label: '正在绘制地表…', work() {
            state.curData = {
                mesh: ctx.mesh, r_xyz: ctx.r_xyz, t_xyz: ctx.t_xyz,
                r_plate: ctx.r_plate, plateSeeds: ctx.plateSeeds, plateVec: ctx.plateVec,
                plateMotion: ctx.plateMotion || null,
                geologyMemory: ctx.geologyMemory || null,
                plateIsOcean: ctx.plateIsOcean, originalPlateIsOcean: ctx.originalPlateIsOcean,
                plateDensity: ctx.plateDensity, plateDensityLand: ctx.plateDensityLand,
                plateDensityOcean: ctx.plateDensityOcean, prePostElev: ctx.prePostElev,
                r_elevation: ctx.r_elevation, t_elevation: ctx.t_elevation,
                mountain_r: ctx.mountain_r, coastline_r: ctx.coastline_r, ocean_r: ctx.ocean_r,
                r_stress: ctx.r_stress, noise: ctx.noise, seed: ctx.seed, debugLayers: ctx.debugLayers,
                r_wind_east_summer: ctx.windResult ? ctx.windResult.r_wind_east_summer : null,
                r_wind_north_summer: ctx.windResult ? ctx.windResult.r_wind_north_summer : null,
                r_wind_east_winter: ctx.windResult ? ctx.windResult.r_wind_east_winter : null,
                r_wind_north_winter: ctx.windResult ? ctx.windResult.r_wind_north_winter : null,
                itczLons: ctx.windResult ? ctx.windResult.itczLons : null,
                itczLatsSummer: ctx.windResult ? ctx.windResult.itczLatsSummer : null,
                itczLatsWinter: ctx.windResult ? ctx.windResult.itczLatsWinter : null,
                r_ocean_current_east_summer: ctx.oceanResult ? ctx.oceanResult.r_ocean_current_east_summer : null,
                r_ocean_current_north_summer: ctx.oceanResult ? ctx.oceanResult.r_ocean_current_north_summer : null,
                r_ocean_current_east_winter: ctx.oceanResult ? ctx.oceanResult.r_ocean_current_east_winter : null,
                r_ocean_current_north_winter: ctx.oceanResult ? ctx.oceanResult.r_ocean_current_north_winter : null,
                r_ocean_speed_summer: ctx.oceanResult ? ctx.oceanResult.r_ocean_speed_summer : null,
                r_ocean_speed_winter: ctx.oceanResult ? ctx.oceanResult.r_ocean_speed_winter : null,
                r_ocean_warmth_summer: ctx.oceanResult ? ctx.oceanResult.r_ocean_warmth_summer : null,
                r_ocean_warmth_winter: ctx.oceanResult ? ctx.oceanResult.r_ocean_warmth_winter : null,
                r_precip_summer: ctx.precipResult ? ctx.precipResult.r_precip_summer : null,
                r_precip_winter: ctx.precipResult ? ctx.precipResult.r_precip_winter : null,
                r_temperature_summer: ctx.tempResult ? ctx.tempResult.r_temperature_summer : null,
                r_temperature_winter: ctx.tempResult ? ctx.tempResult.r_temperature_winter : null
            };
            state.climateComputed = !skipClimate;
            refreshEnvironmentInputs(state.curData);
            buildMesh();
            progress(100, '完成');
            resetUI();
            btn.dispatchEvent(new CustomEvent('generate-done'));
        }}
    ];

    function runStage(idx) {
        if (idx >= stages.length) return;
        const s = stages[idx];
        try { progress(s.pct, s.label); } catch (e) { fail(e); return; }
        requestAnimationFrame(() => setTimeout(() => {
            try { s.work(); runStage(idx + 1); } catch (e) { fail(e); }
        }, 0));
    }
    setTimeout(() => runStage(0), 0);
}

// --- 公共 API ---

export function syncEvolutionTerrainViaWorker(curData) {
    if (!worker || !curData?.r_elevation) return false;
    const r_elevation = new Float32Array(curData.r_elevation);
    worker.postMessage({
        cmd: 'syncEvolutionTerrain',
        r_elevation,
        geologyMemory: curData.geologyMemory || null,
    }, [r_elevation.buffer]);
    return true;
}

export function refreshEnvironmentInputs(curData = state.curData) {
    if (!curData?.mesh || !curData?.r_elevation || !curData?.debugLayers) return null;
    try {
        curData.environmentInputs = attachEnvironmentInputDebugLayers(curData.debugLayers, {
            mesh: curData.mesh,
            r_xyz: curData.r_xyz,
            r_elevation: curData.r_elevation,
            debugLayers: curData.debugLayers,
            r_precip_summer: curData.r_precip_summer || curData.debugLayers.precipSummer,
            r_precip_winter: curData.r_precip_winter || curData.debugLayers.precipWinter,
            r_temperature_summer: curData.r_temperature_summer || curData.debugLayers.tempSummer,
            r_temperature_winter: curData.r_temperature_winter || curData.debugLayers.tempWinter,
        });
        return curData.environmentInputs;
    } catch (err) {
        console.warn('[EnvironmentInputs] 刷新失败：', err);
        curData.environmentInputs = {
            schema: 'world-orogen-environment-inputs',
            version: 1,
            layers: [],
            metrics: {},
            warnings: [err?.message || '环境输入刷新失败。'],
        };
        return curData.environmentInputs;
    }
}

export function generate(overrideSeed, toggledIndices = [], onProgress, skipClimate = false) {
    const btn = document.getElementById('generate');
    btn.disabled = true;
    btn.textContent = '正在构建…';
    btn.classList.add('generating');

    _onProgress = onProgress || (() => {});
    _t0 = performance.now();

    if (!worker) {
        // 回退：先加载模块，再同步运行。
        loadFallback().then(() => generateFallback(overrideSeed, toggledIndices, onProgress, skipClimate));
        return;
    }

    const s = readSliders();

    worker.postMessage({
        cmd: 'generate',
        ...s,
        seed: overrideSeed,
        toggledIndices,
        skipClimate
    });
}

export function reapplyViaWorker(on完成, skipClimate = false) {
    if (!worker || !state.curData) return;

    _onProgress = (pct, label) => {
        // 重新应用期间的进度更新（构建遮罩显示时使用）。
    };
    _on完成 = on完成 || null;
    _t0 = performance.now();

    const s = readSlidersOptional();
    const temperatureOffset = +(document.getElementById('sTmp')?.value ?? 0);
    const precipitationOffset = +(document.getElementById('sPrc')?.value ?? 0);
    const landCoverage = +(document.getElementById('sLc')?.value ?? 0.3);

    worker.postMessage({
        cmd: 'reapply',
        ...s, temperatureOffset, precipitationOffset, landCoverage,
        skipClimate
    });
}

export function editRecomputeViaWorker(on完成, skipClimate = false) {
    if (!worker || !state.curData) return;

    const d = state.curData;
    _onProgress = () => {};
    _on完成 = on完成 || null;
    _t0 = performance.now();

    const { nMag, terrainWarp, smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, temperatureOffset, precipitationOffset, landCoverage } = readSliders();

    worker.postMessage({
        cmd: 'editRecompute',
        plateIsOcean: Array.from(d.plateIsOcean),
        plateDensity: d.plateDensity,
        nMag, terrainWarp, smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening,
        temperatureOffset, precipitationOffset, landCoverage,
        skipClimate
    });
}

export function computeClimateViaWorker(onProgress, on完成) {
    if (!worker || !state.curData) return;
    _onProgress = onProgress || (() => {});
    _on完成 = on完成 || null;
    _t0 = performance.now();
    const temperatureOffset = +(document.getElementById('sTmp')?.value ?? 0);
    const precipitationOffset = +(document.getElementById('sPrc')?.value ?? 0);
    const landCoverage = +(document.getElementById('sLc')?.value ?? 0.3);

    worker.postMessage({
        cmd: 'computeClimate',
        temperatureOffset, precipitationOffset, landCoverage
    });
}

export function importHeightmap(grayscale, imageWidth, imageHeight, onProgress, skipClimate = false) {
    if (!worker) return;

    _onProgress = onProgress || (() => {});
    _t0 = performance.now();

    const { N, jitter, terrainWarp, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion } = readSlidersOptional();

    worker.postMessage({
        cmd: 'importHeightmap',
        N, jitter,
        grayscale, imageWidth, imageHeight,
        terrainWarp, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion,
        skipClimate
    }, [grayscale.buffer]);
}
