// 启发式降水模型：平滑纬向格局与
// complex advection model to reduce splotchiness and strengthen deserts.
// 根据四个相乘因子计算降水：纬向基础曲线、
// （到 ITCZ 的距离）、季节修正、大陆干燥度，以及
// orographic rain shadow.

import { CLIMATE } from './climate-config.js';
import { smoothstep } from './wind.js';
import { elevToHeightKm } from './color-map.js';
import { smoothField, makeItczLookup } from './climate-util.js';

const DEG = Math.PI / 180;

// ── Zonal base curve ────────────────────────────────────────────────────────
// 根据到 ITCZ 的纬度距离返回 [0.03, 1.0] 范围内的值。

function zonalBase(distDeg) {
    const tradeValue = CLIMATE.HEUR_ZONAL_TRADE_VALUE;
    const desertMin = CLIMATE.HEUR_ZONAL_DESERT_MIN;
    const desertEndDeg = CLIMATE.HEUR_ZONAL_DESERT_END_DEG;
    const dryPolewardDeg = CLIMATE.HEUR_ZONAL_DRY_POLEWARD_DEG;
    const westerlyPeak = CLIMATE.HEUR_ZONAL_WESTERLY_PEAK;
    const westerlyPeakDeg = CLIMATE.HEUR_ZONAL_WESTERLY_PEAK_DEG;
    const polarMin = CLIMATE.HEUR_ZONAL_POLAR_MIN;
    const subpolarValue = westerlyPeak - 0.2; // value at 70° (0.3 at defaults)

    if (distDeg < 5) {
        // ITCZ core: 1.0
        return 1.0;
    } else if (distDeg < 10) {
        // Outer ITCZ / trades: 1.0 → 0.35 (faster falloff)
        return 1.0 - (1.0 - tradeValue) * smoothstep(5, 10, distDeg);
    } else if (distDeg < dryPolewardDeg) {
        // Subtropical highs (desert factory): 0.35 → 0.02
        // 非常强的下限压制：沙漠带核心。
        return tradeValue - (tradeValue - desertMin) * smoothstep(10, desertEndDeg, distDeg);
    } else if (distDeg < westerlyPeakDeg) {
        // Mid-lat westerlies recovery: 0.02 → 0.5
        return desertMin + (westerlyPeak - desertMin) * smoothstep(dryPolewardDeg, westerlyPeakDeg, distDeg);
    } else if (distDeg < 70) {
        // Subpolar: 0.5 → 0.3
        return westerlyPeak - 0.2 * smoothstep(westerlyPeakDeg, 70, distDeg);
    } else {
        // Polar: 0.3 → 0.1
        return subpolarValue - (subpolarValue - polarMin) * smoothstep(70, 90, distDeg);
    }
}

// ── Heuristic zonal wind ────────────────────────────────────────────────────
// 根据相对 ITCZ 的纬度估计理想化风向。
// 返回本地东/北分量（东向为正表示向东吹，
// positive north = blowing poleward in NH).
//
// Zonal wind belts (Earth-like):
//   ITCZ (0-5°):        light/convergent
//   Trades (5-30°):     strong easterlies, deflected equatorward by Coriolis
//   Subtropical (25-35°): weak/variable (transition)
//   Westerlies (35-60°): west→east, deflected poleward
//   Polar easterlies (60-90°): east→west, deflected equatorward

function heuristicWind(distFromItczDeg, isNorthOfItcz) {
    // 半球符号：ITCZ 以北为 +1，以南为 -1。
    const hemiSign = isNorthOfItcz ? 1 : -1;
    let we, wn;

    if (distFromItczDeg < 5) {
        // ITCZ: light convergent winds — slight equatorward component
        we = 0;
        wn = -hemiSign * 0.1;
    } else if (distFromItczDeg < 30) {
        // 信风：东风（向西吹），带有赤道向分量。
        // 强度从 ITCZ 边缘升高，在约 15–20° 达峰，并向副热带减弱。
        const tradeStrength = smoothstep(5, 15, distFromItczDeg)
            * (1 - smoothstep(25, 32, distFromItczDeg));
        we = -tradeStrength * 0.8;                 // strong westward
        wn = -hemiSign * tradeStrength * 0.3;      // equatorward (toward ITCZ)
    } else if (distFromItczDeg < 60) {
        // 西风：向东吹，带有极向分量。
        const westStrength = smoothstep(30, 40, distFromItczDeg)
            * (1 - smoothstep(55, 65, distFromItczDeg));
        we = westStrength * 0.9;                    // strong eastward
        wn = hemiSign * westStrength * 0.25;        // poleward
    } else {
        // 极地东风：向西吹，带有赤道向分量。
        const polarStrength = smoothstep(60, 70, distFromItczDeg);
        we = -polarStrength * 0.4;                  // moderate westward
        wn = -hemiSign * polarStrength * 0.15;      // equatorward
    }

    return { we, wn };
}

// ── 完整季节的启发式风场 ──────────────────────────────────
// 为所有区域计算理想化纬向风东/北分量数组。

export function computeHeuristicWindField(numRegions, r_lat, r_lon, itczLookup) {
    const hWindE = new Float32Array(numRegions);
    const hWindN = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const lat = r_lat[r];
        const itczLat = itczLookup(r_lon[r]) * CLIMATE.HEUR_ITCZ_SHIFT_DAMPEN; // dampened ITCZ, same as precip
        const signedDist = lat - itczLat;
        const distDeg = Math.abs(signedDist) / DEG;
        const northOfItcz = signedDist > 0;
        const { we, wn } = heuristicWind(distDeg, northOfItcz);
        hWindE[r] = we;
        hWindN[r] = wn;
    }

    return { hWindE, hWindN };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute heuristic precipitation for both seasons.
 * Returns raw (un-normalized) Float32Arrays.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz
 * @param {Float32Array} r_elevation
 * @param {object} windResult - output from computeWind()
 * @param {Float32Array} r_elevGradE - pre-computed east elevation gradient
 * @param {Float32Array} r_elevGradN - pre-computed north elevation gradient
 * @param {Int32Array} r_coastDistLand - BFS hop distance from coast through land
 * @returns {{ r_precip_summer, r_precip_winter }}
 */
export function computeHeuristicPrecipitation(mesh, r_xyz, r_elevation, windResult, r_elevGradE, r_elevGradN, r_coastDistLand) {
    const numRegions = mesh.numRegions;
    const { r_lat, r_lon, r_isLand, r_continentality } = windResult;

    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);

    // 预计算西岸接近度：正值为西岸，负值为东岸。
    // 沿海陆地单元检查海洋相对本地东向位于哪一侧，
    // 然后只沿陆地向内陆平滑传播约 300 km。
    const { r_eastX, r_eastY, r_eastZ } = windResult;
    const { adjOffset, adjList } = mesh;
    const r_westCoast = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r] || r_coastDistLand[r] !== 0) continue;
        let oceanDotEast = 0;
        let count = 0;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isLand[nb]) {
                const dx = r_xyz[3 * nb] - r_xyz[3 * r];
                const dy = r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
                const dz = r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
                oceanDotEast += dx * r_eastX[r] + dy * r_eastY[r] + dz * r_eastZ[r];
                count++;
            }
        }
        if (count > 0) {
            // 负点积 = 海洋在西侧 = 西海岸。
            r_westCoast[r] = oceanDotEast < 0 ? 1 : -1;
        }
    }
    // 只沿陆地平滑约 300 km，让信号渗入内陆。
    const wcPasses = Math.max(2, Math.round(300 / avgEdgeKm));
    const wcTmp = new Float32Array(numRegions);
    for (let pass = 0; pass < wcPasses; pass++) {
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) { wcTmp[r] = 0; continue; }
            let sum = r_westCoast[r], count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_isLand[nb]) { sum += r_westCoast[nb]; count++; }
            }
            wcTmp[r] = sum / count;
        }
        r_westCoast.set(wcTmp);
    }

    const result = {};

    const seasons = [
        { name: 'summer', shift: 5 },
        { name: 'winter', shift: -5 }
    ];

    for (const { name } of seasons) {
        const isSummer = name === 'summer';

        const itczLookup = makeItczLookup(windResult.itczLons,
            isSummer ? windResult.itczLatsSummer : windResult.itczLatsWinter);

        const precip = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            const lat = r_lat[r];
            const lon = r_lon[r];

            // ── A. 纬向基础曲线（到 ITCZ 的距离）──
            // 抑制 ITCZ 位移：只使用复杂模型 ITCZ 的 30%
            // 位移，使纬向带保持接近地理
            // 赤道。完整 ITCZ 摆幅（最高 15–20°）会把
            // 副热带沙漠带拖得过远，使真实赤道变干并
            // 在偏移季节把中纬度变湿。
            const itczLat = itczLookup(lon) * CLIMATE.HEUR_ITCZ_SHIFT_DAMPEN;
            const signedDist = lat - itczLat;
            const distFromItczDeg = Math.abs(signedDist) / DEG;
            const isNorthOfItcz = signedDist > 0;
            const zonal = zonalBase(distFromItczDeg);

            // ── B. Seasonal modifier + Mediterranean subtropical suppression ──
            const absLatDeg = Math.abs(lat) / DEG;
            const inSummerHemi = isSummer ? (lat >= 0) : (lat < 0);
            let seasonMod = inSummerHemi ? CLIMATE.HEUR_SEASON_SUMMER_MOD : CLIMATE.HEUR_SEASON_WINTER_MOD;

            // Mediterranean suppression: subtropical highs expand poleward in
            // local summer, strongly suppressing rainfall at 25-42° latitude.
            // 当地冬季，高压向赤道退缩，西风
            // 为这些纬度带来降雨。这种季节对比是
            // primary driver of Mediterranean (Cs) climates.
            // Stronger on west coasts (subtropical highs sit over eastern ocean
            // 洋盆，使相邻大陆西缘变干）并
            // weaker on east coasts (onshore tropical moisture counters drying).
            if (inSummerHemi && absLatDeg > 22 && absLatDeg < 45) {
                const medSuppress = smoothstep(22, 30, absLatDeg)
                    * (1 - smoothstep(38, 45, absLatDeg));
                const wc = r_westCoast[r]; // +1 west coast, -1 east coast, 0 inland
                const strength = CLIMATE.HEUR_MED_SUPPRESS_BASE + wc * CLIMATE.HEUR_MED_WESTCOAST_BONUS; // 0.35 west coast, 0.15 inland, ~0 east coast
                seasonMod *= (1 - medSuppress * Math.max(0, strength));
            }

            // ── C. Continental dryness ──
            let contMod = 1.0;
            const cont = (r_isLand[r] && r_continentality) ? r_continentality[r] : 0;
            if (cont > 0) {
                contMod = 1.0 - cont * cont * CLIMATE.HEUR_CONT_DRYNESS;
            }

            // ── D. Orographic rain shadow (using heuristic zonal wind) ──
            let oroMod = 1.0;
            if (r_isLand[r] && r_elevation[r] > 0) {
                const { we, wn } = heuristicWind(distFromItczDeg, isNorthOfItcz);
                // Wind dot elevation gradient: positive = windward, negative = leeward
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];

                if (windDotGrad > 0) {
                    // Windward: up to +60% boost
                    const uplift = Math.min(1, windDotGrad * 15);
                    oroMod = 1.0 + uplift * CLIMATE.HEUR_ORO_UPLIFT_MAX;
                } else {
                    // Leeward: up to -70% suppression, scaled by mountain height
                    const heightKm = elevToHeightKm(Math.max(0, r_elevation[r]));
                    const heightScale = Math.min(1, heightKm / 3); // 3km+ = full shadow
                    const shadow = Math.min(1, -windDotGrad * 18);
                    oroMod = Math.max(0.3, 1.0 - shadow * CLIMATE.HEUR_ORO_SHADOW_MAX * heightScale);
                }
            }

            // ── E. 硬性离岸距离截断 ──
            // Fixed 2000-3000km cutoff regardless of latitude.
            let distMod = 1.0;
            if (r_isLand[r] && r_coastDistLand[r] > 0) {
                const distKm = r_coastDistLand[r] * avgEdgeKm;
                if (distKm > 2000) {
                    distMod = Math.max(0.03, 1 - smoothstep(2000, 3000, distKm));
                }
            }

            // ── Final ──
            precip[r] = Math.max(0.05, zonal * seasonMod * contMod * oroMod * distMod);
        }

        // Light smoothing ~100km
        const smoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
        smoothField(mesh, precip, smoothPasses);

        result[`r_precip_${name}`] = precip;
    }

    return result;
}
