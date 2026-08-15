// 风场模拟：由气压驱动、ITCZ 随经度变化的季节性风。
// 计算夏季和冬季的气压场与风矢量。

import { CLIMATE } from './climate-config.js';
import { elevToHeightKm } from './color-map.js';
import { smoothField, percentile } from './climate-util.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ── Periodic cubic spline interpolation ──────────────────────────────────────

function buildPeriodicSpline(xs, ys) {
    // xs: sorted longitude samples (radians), ys: ITCZ latitude values
    // 返回供 evaluateSpline() 使用的样条数据。
    const n = xs.length;
    const period = 2 * Math.PI;

    // 为周期自然三次样条构建三对角系统。
    const h = new Float64Array(n);
    const alpha = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        h[i] = (xs[next] - xs[i] + period) % period;
        if (h[i] === 0) h[i] = period / n;
    }
    for (let i = 0; i < n; i++) {
        const prev = (i - 1 + n) % n;
        const next = (i + 1) % n;
        alpha[i] = (3 / h[i]) * (ys[next] - ys[i]) - (3 / h[prev]) * (ys[i] - ys[prev]);
    }

    // 使用类 Thomas 算法求解周期系统。
    // 简化处理：使用迭代松弛（n=72 时足够快）。
    const c = new Float64Array(n);
    for (let iter = 0; iter < 20; iter++) {
        for (let i = 0; i < n; i++) {
            const prev = (i - 1 + n) % n;
            const next = (i + 1) % n;
            c[i] = (alpha[i] - h[prev] * c[prev] - h[i] * c[next]) /
                   (2 * (h[prev] + h[i]));
        }
    }

    const b = new Float64Array(n);
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        b[i] = (ys[next] - ys[i]) / h[i] - h[i] * (c[next] + 2 * c[i]) / 3;
        d[i] = (c[next] - c[i]) / (3 * h[i]);
    }

    return { xs, ys, b, c, d, h, n, period };
}

function evaluateSpline(spline, lon) {
    const { xs, ys, b, c, d, n, period } = spline;
    // 将经度归一化到 [xs[0], xs[0] + period)。
    let t = ((lon - xs[0]) % period + period) % period + xs[0];

    // Direct index calculation — segments are equally spaced
    const segStep = period / n;
    let seg = Math.floor((t - xs[0]) / segStep);
    if (seg < 0) seg = 0;
    else if (seg >= n) seg = n - 1;

    const dx = t - xs[seg];
    return ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
}

// ── Smoothstep utility ───────────────────────────────────────────────────────

export function smoothstep(edge0, edge1, x) {
    if (edge0 === edge1) return x >= edge1 ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ── ITCZ computation ─────────────────────────────────────────────────────────

/**
 * Build a spatial index binning regions by latitude/longitude for fast
 * geographic sampling. Returns a function landFracAndElev(lat, lon, radius)
 * that returns { landFrac, avgElev } by scanning nearby bins.
 */
function buildGeoIndex(r_lat, r_lon, r_sinLat, r_cosLat, r_elevation, r_isLand, numRegions) {
    const LAT_BINS = 36;   // 5° each
    const LON_BINS = 72;   // 5° each
    const numBins = LAT_BINS * LON_BINS;

    // CSR (compressed sparse row) format: count regions per bin, then prefix-sum
    // 缓存每个区域的分箱索引，避免填充阶段重复计算。
    const r_bin = new Uint32Array(numRegions);
    const binCount = new Uint32Array(numBins);
    for (let r = 0; r < numRegions; r++) {
        const latBin = Math.max(0, Math.min(LAT_BINS - 1,
            Math.floor((r_lat[r] + Math.PI / 2) / Math.PI * LAT_BINS)));
        const lonBin = Math.max(0, Math.min(LON_BINS - 1,
            Math.floor((r_lon[r] + Math.PI) / (2 * Math.PI) * LON_BINS)));
        const bin = latBin * LON_BINS + lonBin;
        r_bin[r] = bin;
        binCount[bin]++;
    }

    const binOffset = new Uint32Array(numBins + 1);
    for (let i = 0; i < numBins; i++) {
        binOffset[i + 1] = binOffset[i] + binCount[i];
    }

    const indices = new Uint32Array(numRegions);
    const fillPos = new Uint32Array(numBins);
    for (let r = 0; r < numRegions; r++) {
        const bin = r_bin[r];
        indices[binOffset[bin] + fillPos[bin]] = r;
        fillPos[bin]++;
    }

    // Reusable output objects to avoid per-call allocation
    const _out = { landFrac: 0, avgElev: 0 };
    const _outLocal = { landFrac: 0, avgElev: 0 };
    const _outWide = { landFrac: 0, avgElev: 0 };

    // 缓存常用半径的 cosRadius。
    const cosRadiusCache = new Map();
    function getCosRadius(radius) {
        let c = cosRadiusCache.get(radius);
        if (c === undefined) { c = Math.cos(radius); cosRadiusCache.set(radius, c); }
        return c;
    }

    function sample(lat, lon, radius) {
        const latMin = lat - radius, latMax = lat + radius;
        const bMin = Math.max(0, Math.floor((latMin + Math.PI / 2) / Math.PI * LAT_BINS));
        const bMax = Math.min(LAT_BINS - 1, Math.floor((latMax + Math.PI / 2) / Math.PI * LAT_BINS));
        const cosLat = Math.cos(lat) || 0.01;
        const lonSpan = radius / cosLat;
        const lMin = Math.floor((lon - lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);
        const lMax = Math.floor((lon + lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);

        let landCount = 0, totalCount = 0, elevSum = 0;
        const cosR = getCosRadius(radius);
        const sinLat0 = Math.sin(lat), cosLat0 = Math.cos(lat);

        for (let bi = bMin; bi <= bMax; bi++) {
            for (let li = lMin; li <= lMax; li++) {
                const lj = ((li % LON_BINS) + LON_BINS) % LON_BINS;
                const bin = bi * LON_BINS + lj;
                for (let k = binOffset[bin], end = binOffset[bin + 1]; k < end; k++) {
                    const r = indices[k];
                    const cosDist = sinLat0 * r_sinLat[r] + cosLat0 * r_cosLat[r] * Math.cos(r_lon[r] - lon);
                    if (cosDist >= cosR) {
                        totalCount++;
                        if (r_isLand[r]) landCount++;
                        if (r_elevation[r] > 0) elevSum += r_elevation[r];
                    }
                }
            }
        }

        _out.landFrac = totalCount > 0 ? landCount / totalCount : 0;
        _out.avgElev = totalCount > 0 ? elevSum / totalCount : 0;
        return _out;
    }

    /**
     * Dual-radius sample: scan bins once for the wider radius, classify each
     * region into local and wide buckets based on distance. Avoids scanning
     * overlapping bins twice when both radii share the same center.
     */
    function sampleDual(lat, lon, localRadius, wideRadius) {
        const latMax = lat + wideRadius, latMin = lat - wideRadius;
        const bMin = Math.max(0, Math.floor((latMin + Math.PI / 2) / Math.PI * LAT_BINS));
        const bMax = Math.min(LAT_BINS - 1, Math.floor((latMax + Math.PI / 2) / Math.PI * LAT_BINS));
        const cosLat = Math.cos(lat) || 0.01;
        const lonSpan = wideRadius / cosLat;
        const lMin = Math.floor((lon - lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);
        const lMax = Math.floor((lon + lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);

        let lLand = 0, lTotal = 0, lElev = 0;
        let wLand = 0, wTotal = 0, wElev = 0;
        const cosLocal = getCosRadius(localRadius);
        const cosWide = getCosRadius(wideRadius);
        const sinLat0 = Math.sin(lat), cosLat0 = Math.cos(lat);

        for (let bi = bMin; bi <= bMax; bi++) {
            for (let li = lMin; li <= lMax; li++) {
                const lj = ((li % LON_BINS) + LON_BINS) % LON_BINS;
                const bin = bi * LON_BINS + lj;
                for (let k = binOffset[bin], end = binOffset[bin + 1]; k < end; k++) {
                    const r = indices[k];
                    const cosDist = sinLat0 * r_sinLat[r] + cosLat0 * r_cosLat[r] * Math.cos(r_lon[r] - lon);
                    if (cosDist >= cosWide) {
                        wTotal++;
                        const isLand = r_isLand[r];
                        const elev = r_elevation[r] > 0 ? r_elevation[r] : 0;
                        if (isLand) wLand++;
                        wElev += elev;
                        if (cosDist >= cosLocal) {
                            lTotal++;
                            if (isLand) lLand++;
                            lElev += elev;
                        }
                    }
                }
            }
        }

        _outLocal.landFrac = lTotal > 0 ? lLand / lTotal : 0;
        _outLocal.avgElev = lTotal > 0 ? lElev / lTotal : 0;
        _outWide.landFrac = wTotal > 0 ? wLand / wTotal : 0;
        _outWide.avgElev = wTotal > 0 ? wElev / wTotal : 0;
    }

    return { sample, sampleDual, _outLocal, _outWide };
}

/**
 * Compute ITCZ latitude at sampled longitudes for a given season.
 * Uses a thermal equator search: scans latitudes from -30° to +30°,
 * computes a heating score at each, and picks the peak.
 *
 * Heating score combines:
 *   - Solar insolation (cosine of latitude offset from subsolar point)
 *   - Land thermal boost (land heats faster than ocean)
 *   - Elevation boost (plateaus heat more intensely — thinner atmosphere)
 *   - Cross-equatorial anchoring (winter-hemisphere land pulls ITCZ equatorward)
 *
 * @param {Object} geoIndex - from buildGeoIndex ({sample, sampleDual, _outLocal, _outWide})
 * @param {string} season - 'summer' (NH) or 'winter' (NH)
 * @param {number} tiltRad - axial tilt in radians
 * @returns {{ spline, lons: Float64Array, lats: Float64Array }}
 */
function computeITCZ(geoIndex, season, tiltRad) {
    const { sample: geoSample, sampleDual, _outLocal, _outWide } = geoIndex;
    const NUM_LON = 72;
    // 两个采样半径：局部 5° 用于精确陆地检测，宽域 30° 用于大陆尺度。
    const localRadius = 5 * DEG;
    const wideRadius = 30 * DEG;

    // +1 = NH summer, -1 = SH summer (NH winter)
    const sign = season === 'summer' ? 1 : -1;

    // 直射纬度：本季太阳直射的位置。
    // 夏半球采用完整倾角（例如北半球夏季为 +23.5°）。
    const subsolarLat = sign * tiltRad;

    // Scan range: -30° to +30° in 2.5° steps
    const SCAN_MIN = -30;
    const SCAN_MAX = 30;
    const SCAN_STEP = 2.5;
    const numScans = Math.round((SCAN_MAX - SCAN_MIN) / SCAN_STEP) + 1;

    // 预计算扫描纬度及其三角函数值（跨所有经度复用）。
    const scanLats = new Float64Array(numScans);
    const scanLatDegs = new Float64Array(numScans);
    const scanSolarScores = new Float64Array(numScans);
    for (let si = 0; si < numScans; si++) {
        const latDeg = SCAN_MIN + si * SCAN_STEP;
        scanLatDegs[si] = latDeg;
        scanLats[si] = latDeg * DEG;
        const dSolar = (scanLats[si] - subsolarLat) * RAD;
        scanSolarScores[si] = Math.exp(-0.5 * (dSolar / 25) ** 2);
    }

    // 为每个扫描步预计算极向纬度。
    const polewardLats = new Float64Array(numScans);
    for (let si = 0; si < numScans; si++) {
        polewardLats[si] = scanLats[si] + sign * 15 * DEG;
    }

    const lons = new Float64Array(NUM_LON);
    const rawLats = new Float64Array(NUM_LON);

    for (let i = 0; i < NUM_LON; i++) {
        const lon = -Math.PI + (i + 0.5) * (2 * Math.PI / NUM_LON);
        lons[i] = lon;

        let bestScore = -Infinity;
        let bestLat = sign * 5 * DEG; // fallback

        for (let si = 0; si < numScans; si++) {
            const latDeg = scanLatDegs[si];
            const lat = scanLats[si];
            sampleDual(lat, lon, localRadius, wideRadius);
            const local = _outLocal, wide = _outWide;

            // (a) 太阳辐照：从直射点预计算的高斯衰减。
            const solarScore = scanSolarScores[si];

            // (b) Land thermal boost: uses multi-scale sampling.
            // 只有真正大陆尺度的陆块才会显著牵引 ITCZ。
            // Islands, thin peninsulas, and coastlines near ocean register low at
            // 宽域（30°）半径会将其纳入，并由陡峭斜坡压制。
            const localLand = local.landFrac;
            const wideLand = wide.landFrac;

            // Also sample poleward of this latitude: a massive continent extending
            // poleward (like Asia beyond 20°N) creates an enormous heat reservoir
            // 即使扫描点本身位于
            // 大陆边缘，也会把 ITCZ 拉向它。夏半球向极方向采样 15°。
            const poleward = geoSample(polewardLats[si], lon, wideRadius);  // single-radius, reuses _out
            // Combined land signal: max of local-wide and poleward-wide.
            // Poleward land contributes at 70% strength (heat diffuses equatorward).
            const effectiveWideLand = Math.max(wideLand, poleward.landFrac * 0.7);

            // Wide-scale land must exceed ~20% before any real pull kicks in.
            const continentalScale = smoothstep(0.20, 0.45, effectiveWideLand);
            // Square it so moderate land fractions still contribute little.
            const scaledLand = continentalScale * continentalScale;
            // Local land gate: require >25% local land fraction to activate.
            // At 5° radius (~560 km), ocean near thin islands stays well below this.
            const landGate = smoothstep(0.25, 0.55, localLand);
            // Strong max boost so massive continents pull ITCZ toward 25-30°
            const landBoost = landGate * scaledLand * CLIMATE.WIND_ITCZ_LAND_BOOST_MAX;

            // (c) Elevation boost: high plateaus heat more intensely
            // (thinner atmosphere, stronger surface insolation).
            // Also scaled by continental size — isolated volcanic peaks don't pull ITCZ.
            const elevKm = elevToHeightKm(Math.max(0, wide.avgElev));
            const elevBoost = Math.min(0.30, elevKm * 0.12) * scaledLand;

            // (d) 跨赤道锚定：如果该纬度位于
            // winter hemisphere but there's significant land, it anchors
            // 则将 ITCZ 拉近赤道（抵抗向极迁移）。
            const isWinterHemi = (sign > 0 && latDeg < 0) || (sign < 0 && latDeg > 0);
            const anchorBoost = isWinterHemi ? landBoost * CLIMATE.WIND_ITCZ_ANCHOR_FACTOR : 0;

            // (e) Ocean baseline: slight poleward bias in summer hemisphere
            // 即使在开阔海洋上也如此（平均离赤道约 6–8°）。
            const isSummerHemi = !isWinterHemi;
            const oceanBias = isSummerHemi && localLand < 0.1
                ? 0.08 * Math.exp(-0.5 * ((Math.abs(latDeg) - 7) / 5) ** 2)
                : 0;

            const score = solarScore + landBoost + elevBoost + anchorBoost + oceanBias;

            if (score > bestScore) {
                bestScore = score;
                bestLat = lat;
            }
        }

        rawLats[i] = bestLat;
    }

    // 在经向平滑前，将极端离群值拉回纬向均值。
    // ITCZ 是行星尺度特征，单个经度列
    // 不应偏离整体趋势太远。
    const lats = new Float64Array(rawLats);
    const tmp = new Float64Array(NUM_LON);
    // 宽周期移动平均（核=5 个邻居）用于强平滑，
    // 再用窄核（核=3）做细清理。轮数越多，ITCZ 越平滑。
    // Wide kernel: weights [0.1, 0.2, 0.4, 0.2, 0.1] over 5 neighbors
    for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < NUM_LON; i++) {
            const p2 = (i - 2 + NUM_LON) % NUM_LON;
            const p1 = (i - 1 + NUM_LON) % NUM_LON;
            const n1 = (i + 1) % NUM_LON;
            const n2 = (i + 2) % NUM_LON;
            tmp[i] = 0.1 * lats[p2] + 0.2 * lats[p1] + 0.4 * lats[i] + 0.2 * lats[n1] + 0.1 * lats[n2];
        }
        lats.set(tmp);
    }
    // Narrow cleanup passes
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < NUM_LON; i++) {
            const p = (i - 1 + NUM_LON) % NUM_LON;
            const n = (i + 1) % NUM_LON;
            tmp[i] = 0.25 * lats[p] + 0.5 * lats[i] + 0.25 * lats[n];
        }
        lats.set(tmp);
    }

    // 钳制到 ±30°（ITCZ 不会迁出热带）。
    for (let i = 0; i < NUM_LON; i++) {
        lats[i] = Math.max(-CLIMATE.WIND_ITCZ_CLAMP_DEG * DEG, Math.min(CLIMATE.WIND_ITCZ_CLAMP_DEG * DEG, lats[i]));
    }

    const spline = buildPeriodicSpline(lons, lats);
    return { spline, lons, lats };
}

// ── Pressure field ───────────────────────────────────────────────────────────

/**
 * Compute pressure at a single region.
 */
function regionPressure(lat, lon, itczSpline, season, landFrac, elevation, noiseFn, px, py, pz) {
    const itczLat = evaluateSpline(itczSpline, lon);
    const latDeg = lat * RAD;
    const seasonSign = season === 'summer' ? 1 : -1;

    let p = 1013; // baseline hPa

    // (a) ITCZ low — follows thermal equator
    const dItcz = (lat - itczLat) * RAD; // 与 ITCZ 的纬度差（度）。
    p -= CLIMATE.WIND_ITCZ_LOW_DEPTH_HPA * Math.exp(-0.5 * (dItcz / CLIMATE.WIND_ITCZ_LOW_WIDTH_DEG) ** 2);

    // (b) 副热带高压：随季节移动，在炎热陆地上较弱。
    const shiftDeg = seasonSign * CLIMATE.WIND_SUBTROP_SEASONAL_SHIFT_DEG;
    const nhSubHigh = CLIMATE.WIND_SUBTROP_HIGH_LAT_DEG + shiftDeg;
    const shSubHigh = -(CLIMATE.WIND_SUBTROP_HIGH_LAT_DEG - shiftDeg);
    const highIntensity = CLIMATE.WIND_SUBTROP_HIGH_STRENGTH_HPA * (1 - CLIMATE.WIND_SUBTROP_LAND_WEAKENING * landFrac);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - nhSubHigh) / CLIMATE.WIND_SUBTROP_HIGH_WIDTH_DEG) ** 2);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - shSubHigh) / CLIMATE.WIND_SUBTROP_HIGH_WIDTH_DEG) ** 2);

    // (c) Subpolar lows
    p -= CLIMATE.WIND_SUBPOLAR_LOW_DEPTH_HPA * Math.exp(-0.5 * ((latDeg - CLIMATE.WIND_SUBPOLAR_LOW_LAT_DEG) / CLIMATE.WIND_SUBPOLAR_LOW_WIDTH_DEG) ** 2);
    p -= CLIMATE.WIND_SUBPOLAR_LOW_DEPTH_HPA * Math.exp(-0.5 * ((latDeg + CLIMATE.WIND_SUBPOLAR_LOW_LAT_DEG) / CLIMATE.WIND_SUBPOLAR_LOW_WIDTH_DEG) ** 2);

    // (d) Polar highs
    p += CLIMATE.WIND_POLAR_HIGH_STRENGTH_HPA * Math.exp(-0.5 * ((latDeg - 85) / 8) ** 2);
    p += CLIMATE.WIND_POLAR_HIGH_STRENGTH_HPA * Math.exp(-0.5 * ((latDeg + 85) / 8) ** 2);

    // (e) Land/sea thermal modifier
    // landFrac here is actually continentality (0 at coast → ~1 deep interior).
    // Only continental-scale landmasses produce meaningful thermal pressure:
    // small islands (continentality < 0.2) → 0, ramps to full at 0.5+.
    const continentalScale = smoothstep(0.2, 0.5, landFrac);
    if (continentalScale > 0.001) {
        // Continental thermal effect profile:
        // 0 at 0-15°, rises to ~0.75 at 30°, plateau ~1.0 at 45-60°, falls to ~0.5 at 75°, 0 at 90°
        const absLatDeg = Math.abs(lat) * RAD;
        const latFactor = absLatDeg < 15 ? 0
            : absLatDeg < 30 ? 0.75 * smoothstep(15, 30, absLatDeg)
            : absLatDeg < 45 ? 0.75 + 0.25 * smoothstep(30, 45, absLatDeg)
            : absLatDeg < 60 ? 1
            : absLatDeg < 90 ? smoothstep(90, 60, absLatDeg)
            : 0;
        const isSummerHemisphere = (seasonSign > 0 && lat > 0) || (seasonSign < 0 && lat < 0);
        if (isSummerHemisphere) {
            // Thermal low over hot continent
            p -= CLIMATE.WIND_SUMMER_THERMAL_LOW_HPA * latFactor * continentalScale;
        } else {
            // Thermal high over cold continent (stronger — Siberian/Canadian highs)
            p += CLIMATE.WIND_WINTER_THERMAL_HIGH_HPA * latFactor * continentalScale;
        }
    }

    // (f) Elevation (barometric) — mild effect; real weather maps use
    // sea-level-reduced pressure so elevation doesn't dominate zonal bands
    p -= 3 * elevToHeightKm(Math.max(0, elevation));

    // (g) Noise perturbation
    if (noiseFn) {
        p += noiseFn.fbm(px * 2, py * 2, pz * 2, 3) * 2;
    }

    return p;
}


// ── Pressure gradient on mesh ────────────────────────────────────────────────

export function computeGradients(mesh, r_xyz, r_pressure,
    r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
    r_gradE, r_gradN) {
    const { adjOffset, adjList, numRegions } = mesh;

    for (let r = 0; r < numRegions; r++) {
        const px = r_xyz[3 * r], py = r_xyz[3 * r + 1], pz = r_xyz[3 * r + 2];
        const ex = r_eastX[r], ey = r_eastY[r], ez = r_eastZ[r];
        const nx = r_northX[r], ny = r_northY[r], nz = r_northZ[r];
        const pHere = r_pressure[r];

        let sumEP = 0, sumEE = 0, sumNP = 0, sumNN = 0;
        const end = adjOffset[r + 1];

        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            const dx = r_xyz[3 * nb] - px;
            const dy = r_xyz[3 * nb + 1] - py;
            const dz = r_xyz[3 * nb + 2] - pz;

            const de = dx * ex + dy * ey + dz * ez;
            const dn = dx * nx + dy * ny + dz * nz;
            const dp = r_pressure[nb] - pHere;

            sumEP += de * dp;
            sumEE += de * de;
            sumNP += dn * dp;
            sumNN += dn * dn;
        }

        r_gradE[r] = sumEE > 1e-12 ? sumEP / sumEE : 0;
        r_gradN[r] = sumNN > 1e-12 ? sumNP / sumNN : 0;
    }
}

// ── Pressure gradient → wind ─────────────────────────────────────────────────

function pressureToWind(r_gradE, r_gradN, r_sinLat,
    r_windE, r_windN, r_windSpeed, numRegions) {
    const sin5 = Math.sin(5 * DEG);

    for (let r = 0; r < numRegions; r++) {
        // 气压梯度力：从高压到低压 = 负梯度。
        const pgfE = -r_gradE[r];
        const pgfN = -r_gradN[r];

        const sinLat = r_sinLat[r];
        const absSinLat = Math.abs(sinLat);

        // Geostrophic deflection: 0° at equator → 70° at ≥5° latitude
        const geoAngle = CLIMATE.WIND_GEOSTROPHIC_MAX_ANGLE_DEG * DEG * smoothstep(0, sin5, absSinLat);

        // Surface friction turns wind 20° back toward low pressure
        const frictionAngle = CLIMATE.WIND_FRICTION_BACK_ANGLE_DEG * DEG;

        // Net rotation: NH = clockwise (negative), SH = counterclockwise (positive)
        // 旋转矩阵 [cosθ,-sinθ; sinθ,cosθ] 在 +θ 时为逆时针，
        // so NH right-deflection needs negative angle, SH left-deflection needs positive.
        const sign = sinLat >= 0 ? -1 : 1;
        const totalAngle = sign * (geoAngle - frictionAngle);

        const cosA = Math.cos(totalAngle);
        const sinA = Math.sin(totalAngle);

        // Rotate PGF vector and apply friction speed reduction
        const we = (pgfE * cosA - pgfN * sinA) * 0.6;
        const wn = (pgfE * sinA + pgfN * cosA) * 0.6;

        r_windE[r] = we;
        r_windN[r] = wn;
        r_windSpeed[r] = Math.sqrt(we * we + wn * wn);
    }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute seasonal pressure fields and wind vectors.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions (3 * numRegions)
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {Set} plateIsOcean - ocean plate seed set
 * @param {Int32Array} r_plate - per-region plate ID
 * @param {SimplexNoise} noise - seeded noise instance
 * @param {number} [axialTilt=23.5] - axial tilt in degrees
 * @returns {object} pressure and wind arrays for both seasons
 */
export function computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise, axialTilt = 23.5) {
    const numRegions = mesh.numRegions;
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const tiltRad = axialTilt * DEG;
    const timing = [];

    // ── 步骤 0：预计算每个区域的属性 ──

    let t0 = performance.now();

    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    const r_sinLat = new Float32Array(numRegions);
    const r_cosLat = new Float32Array(numRegions);
    const r_isLand = new Uint8Array(numRegions);

    // Tangent frame arrays
    const r_eastX = new Float32Array(numRegions);
    const r_eastY = new Float32Array(numRegions);
    const r_eastZ = new Float32Array(numRegions);
    const r_northX = new Float32Array(numRegions);
    const r_northY = new Float32Array(numRegions);
    const r_northZ = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];

        // Y-up convention (matches map projection)
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, y)));
        r_lon[r] = Math.atan2(x, z);
        r_sinLat[r] = y;
        r_cosLat[r] = Math.sqrt(1 - y * y) || 0.01;
        r_isLand[r] = r_elevation[r] > 0 ? 1 : 0;

        // East = normalize(Ŷ × P) = normalize(z, 0, -x)
        let ex = z, ey = 0, ez = -x;
        let elen = Math.sqrt(ex * ex + ez * ez);
        if (elen < 1e-10) { ex = 1; ez = 0; elen = 1; } // pole fallback
        ex /= elen; ez /= elen;

        // North = P × East
        let nx = y * ez - z * ey;
        let ny = z * ex - x * ez;
        let nz = x * ey - y * ex;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;

        r_eastX[r] = ex; r_eastY[r] = ey; r_eastZ[r] = ez;
        r_northX[r] = nx; r_northY[r] = ny; r_northZ[r] = nz;
    }

    timing.push({ stage: '风场：预计算纬度/经度/切线', ms: performance.now() - t0 });

    // ── 步骤 1：构建地理索引并计算 ITCZ ──

    t0 = performance.now();
    const geoIndex = buildGeoIndex(r_lat, r_lon, r_sinLat, r_cosLat, r_elevation, r_isLand, numRegions);
    const itczSummer = computeITCZ(geoIndex, 'summer', tiltRad);
    const itczWinter = computeITCZ(geoIndex, 'winter', tiltRad);
    timing.push({ stage: '风场：ITCZ 计算', ms: performance.now() - t0 });

    // ── 步骤 2–5：计算每个季节的气压与风 ──

    const seasons = [
        { name: 'summer', itcz: itczSummer },
        { name: 'winter', itcz: itczWinter }
    ];

    const result = {};

    // 通过 BFS 海岸距离预计算大陆性。
    // Laplacian smoothing of binary r_isLand converges too fast — interior
    // 会让单元在几百 km 内就达到 0.95+。因此改为计算实际
    // 穿越陆地的离岸跳数，换算成 km，再用
    // smoothstep 映射为宽且可调的梯度。
    //   0 km (coast):  cont ≈ 0.0
    //   500 km:        cont ≈ 0.16
    //   1000 km:       cont ≈ 0.50
    //   1500 km:       cont ≈ 0.84
    //   2000 km+:      cont ≈ 1.0
    // 海洋 cells near coast get a small value (~0.05–0.15) via a few
    // smoothing passes, giving a natural land/sea thermal gradient.
    t0 = performance.now();
    const { adjOffset, adjList } = mesh;

    // 查找主海洋：非陆地单元中最大的连通分量。
    // 内陆海/小湖泊在大陆性计算中不算作“海洋”。
    const r_oceanLabel = new Int32Array(numRegions);
    r_oceanLabel.fill(-1);
    let mainOceanLabel = -1, mainOceanSize = 0;
    let nextLabel = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_isLand[r] || r_oceanLabel[r] >= 0) continue;
        const label = nextLabel++;
        let size = 0;
        const floodQueue = [r];
        r_oceanLabel[r] = label;
        let fHead = 0;
        while (fHead < floodQueue.length) {
            const cur = floodQueue[fHead++];
            size++;
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (!r_isLand[nb] && r_oceanLabel[nb] === -1) {
                    r_oceanLabel[nb] = label;
                    floodQueue.push(nb);
                }
            }
        }
        if (size > mainOceanSize) {
            mainOceanSize = size;
            mainOceanLabel = label;
        }
    }

    // 穿越陆地的 BFS 海岸距离，只以主海岸线作为种子。
    const r_coastDist = new Int32Array(numRegions);
    r_coastDist.fill(-1);
    const bfsQueue = [];
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isLand[nb] && r_oceanLabel[nb] === mainOceanLabel) {
                r_coastDist[r] = 0;
                bfsQueue.push(r);
                break;
            }
        }
    }
    let head = 0;
    while (head < bfsQueue.length) {
        const r = bfsQueue[head++];
        const d = r_coastDist[r] + 1;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (r_isLand[nb] && r_coastDist[nb] === -1) {
                r_coastDist[nb] = d;
                bfsQueue.push(nb);
            }
        }
    }

    // Map BFS distance to continentality [0, 1]
    const CONT_RANGE_KM = CLIMATE.WIND_CONT_RANGE_KM; // distance at which cont reaches ~1.0
    const r_continentality = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (r_isLand[r] && r_coastDist[r] >= 0) {
            const distKm = r_coastDist[r] * avgEdgeKm;
            r_continentality[r] = smoothstep(0, CONT_RANGE_KM, distKm);
        }
        // 海洋 cells stay at 0; a few smooth passes below will bleed
        // 为热力梯度把小值写到近岸海洋上。
    }
    // Light smoothing (~100 km) to soften BFS stepping artifacts and
    // bleed a small thermal signal onto nearshore ocean cells.
    const contSmoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
    smoothField(mesh, r_continentality, contSmoothPasses);

    // ── West/east coast field (r_westness ∈ [−1, +1]) ──
    // 西海岸附近为 +1（海洋在西侧，如欧洲、美国太平洋西北部），
    // 东海岸附近为 -1（海洋在东侧，如华东、美国东南部），深内陆约 0，
    // 从面西/面东海岸种子分别做两次陆地 BFS，
    // 有符号归一化差值会平滑渗入内陆。该值是
    // primitive Earth's subtropical asymmetry needs — dry subsidence over west
    // coasts, moist onshore flow over east coasts — that latitude alone can't see.
    const r_westness = new Float32Array(numRegions);
    {
        const distWest = new Int32Array(numRegions).fill(-1);
        const distEast = new Int32Array(numRegions).fill(-1);
        const qW = [], qE = [];
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r] || r_coastDist[r] !== 0) continue; // coastal land only
            // Mean direction to adjacent main-ocean cells, projected on east tangent.
            const lon = r_lon[r];
            const eX = Math.cos(lon), eZ = -Math.sin(lon); // east tangent (pole axis = Y)
            let ox = 0, oy = 0, oz = 0, on = 0;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                if (!r_isLand[nb] && r_oceanLabel[nb] === mainOceanLabel) {
                    ox += r_xyz[3 * nb] - r_xyz[3 * r];
                    oz += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
                    on++;
                }
            }
            if (on === 0) continue;
            const oceanDotEast = ox * eX + oz * eZ;
            if (oceanDotEast < 0) { distWest[r] = 0; qW.push(r); } // ocean to west → west coast
            else { distEast[r] = 0; qE.push(r); }                  // ocean to east → east coast
        }
        const bfsLand = (dist, q) => {
            let head = 0;
            while (head < q.length) {
                const r = q[head++];
                const d = dist[r] + 1;
                const end = adjOffset[r + 1];
                for (let ni = adjOffset[r]; ni < end; ni++) {
                    const nb = adjList[ni];
                    if (r_isLand[nb] && dist[nb] === -1) { dist[nb] = d; q.push(nb); }
                }
            }
        };
        bfsLand(distWest, qW);
        bfsLand(distEast, qE);
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const dw = distWest[r], de = distEast[r];
            if (dw < 0 && de < 0) continue;
            if (dw < 0) { r_westness[r] = -1; continue; } // only east coast reachable
            if (de < 0) { r_westness[r] = 1; continue; }  // only west coast reachable
            r_westness[r] = (de - dw) / (de + dw + 1e-6);
        }
        const wnSmooth = Math.max(1, Math.round(150 / avgEdgeKm));
        smoothField(mesh, r_westness, wnSmooth);
    }

    // Plate-based continentality: uses plate type (continental vs oceanic)
    // 而不是真实海陆。使用同样的 BFS 方法生成宽梯度。
    const r_plateContinentality = new Float32Array(numRegions);
    // BFS through continental-plate cells
    const r_plateDist = new Int32Array(numRegions);
    r_plateDist.fill(-1);
    const plateBfsQueue = [];
    for (let r = 0; r < numRegions; r++) {
        if (plateIsOcean.has(r_plate[r])) continue; // skip oceanic plate cells
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            if (plateIsOcean.has(r_plate[adjList[ni]])) {
                r_plateDist[r] = 0;
                plateBfsQueue.push(r);
                break;
            }
        }
    }
    head = 0;
    while (head < plateBfsQueue.length) {
        const r = plateBfsQueue[head++];
        const d = r_plateDist[r] + 1;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!plateIsOcean.has(r_plate[nb]) && r_plateDist[nb] === -1) {
                r_plateDist[nb] = d;
                plateBfsQueue.push(nb);
            }
        }
    }
    for (let r = 0; r < numRegions; r++) {
        if (!plateIsOcean.has(r_plate[r]) && r_plateDist[r] >= 0) {
            const distKm = r_plateDist[r] * avgEdgeKm;
            r_plateContinentality[r] = smoothstep(0, CONT_RANGE_KM, distKm);
        }
    }
    smoothField(mesh, r_plateContinentality, contSmoothPasses);
    timing.push({ stage: '风场：大陆性 BFS', ms: performance.now() - t0 });

    // Shared gradient scratch arrays
    const r_gradE = new Float32Array(numRegions);
    const r_gradN = new Float32Array(numRegions);

    // Smooth pressure field ~75 km (scale-invariant) — constant across seasons
    const pressSmoothPasses = Math.max(1, Math.round(75 / avgEdgeKm));

    for (const { name, itcz } of seasons) {
        // 步骤 2：气压场。
        t0 = performance.now();
        const r_pressure = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            r_pressure[r] = regionPressure(
                r_lat[r], r_lon[r], itcz.spline, name,
                r_continentality[r], r_elevation[r], noise,
                r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]
            );
        }
        smoothField(mesh, r_pressure, pressSmoothPasses);
        timing.push({ stage: `风场：气压场（${name}）`, ms: performance.now() - t0 });

        // 步骤 3：梯度。
        t0 = performance.now();
        r_gradE.fill(0);
        r_gradN.fill(0);
        computeGradients(mesh, r_xyz, r_pressure,
            r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
            r_gradE, r_gradN);
        timing.push({ stage: `风场：梯度（${name}）`, ms: performance.now() - t0 });

        // 步骤 4：风。
        t0 = performance.now();
        const r_windE = new Float32Array(numRegions);
        const r_windN = new Float32Array(numRegions);
        const r_windSpeed = new Float32Array(numRegions);
        pressureToWind(r_gradE, r_gradN, r_sinLat,
            r_windE, r_windN, r_windSpeed, numRegions);

        // 步骤 5：将风速归一化到 0–1。
        const maxSpeed = percentile(r_windSpeed, 0.95);
        for (let r = 0; r < numRegions; r++) {
            r_windSpeed[r] = Math.min(1, r_windSpeed[r] / maxSpeed);
        }
        timing.push({ stage: `风场：气压转风（${name}）`, ms: performance.now() - t0 });

        // 将气压存为相对 1013 的偏差以便可视化（蓝=低，红=高）。
        const r_pressureDev = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_pressureDev[r] = r_pressure[r] - 1013;
        }

        const S = name === 'summer' ? 'Summer' : 'Winter';
        result[`r_pressure_${name}`] = r_pressureDev;
        result[`r_wind_east_${name}`] = r_windE;
        result[`r_wind_north_${name}`] = r_windN;
        result[`r_wind_speed_${name}`] = r_windSpeed;
    }

    // 为可视化在 360 个经度点预评估 ITCZ 样条。
    const ITCZ_SAMPLES = 360;
    const itczLons = new Float32Array(ITCZ_SAMPLES);
    const itczLatsSummer = new Float32Array(ITCZ_SAMPLES);
    const itczLatsWinter = new Float32Array(ITCZ_SAMPLES);
    for (let i = 0; i < ITCZ_SAMPLES; i++) {
        const lon = -Math.PI + (i + 0.5) * (2 * Math.PI / ITCZ_SAMPLES);
        itczLons[i] = lon;
        itczLatsSummer[i] = evaluateSpline(itczSummer.spline, lon);
        itczLatsWinter[i] = evaluateSpline(itczWinter.spline, lon);
    }
    result.itczLons = itczLons;
    result.itczLatsSummer = itczLatsSummer;
    result.itczLatsWinter = itczLatsWinter;

    // 向下游模块（ocean.js）暴露预计算地理数据。
    result.r_lat = r_lat;
    result.r_lon = r_lon;
    result.r_sinLat = r_sinLat;
    result.r_isLand = r_isLand;
    result.r_continentality = r_continentality;
    result.r_coastDistLand = r_coastDist;
    result.r_westness = r_westness;
    result.r_plateContinentality = r_plateContinentality;
    result.r_eastX = r_eastX;
    result.r_eastY = r_eastY;
    result.r_eastZ = r_eastZ;
    result.r_northX = r_northX;
    result.r_northY = r_northY;
    result.r_northZ = r_northZ;

    result._windTiming = timing;
    return result;
}
