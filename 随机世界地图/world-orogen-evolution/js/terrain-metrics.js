// Terrain quality metrics — computes a numeric scorecard from generation
// output for automated tuning evaluation.  Runs inside the web worker
// after generation completes.
//
// Each metric function receives a context object with mesh, arrays, and
// debug layers, and returns a plain object of named scores.

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────

/** Average edge length in radians for the current mesh resolution. */
function avgEdgeRad(numRegions) {
    return Math.PI / Math.sqrt(numRegions);
}

/** Convert a BFS hop‐distance to approximate km (Earth radius). */
function hopsToKm(hops, numRegions) {
    return hops * avgEdgeRad(numRegions) * 6371;
}

/** Percentile of a Float32Array (0–1).  Mutates a copy. */
function percentile(arr, p) {
    const sorted = Float32Array.from(arr).sort();
    const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
    return sorted[idx];
}

/** Flood-fill connected components on a boolean mask using mesh adjacency. */
function connectedComponents(mesh, mask) {
    const N = mesh.numRegions;
    const label = new Int32Array(N).fill(-1);
    const components = []; // array of { id, cells: Set }
    let nextId = 0;
    const queue = [];

    for (let r = 0; r < N; r++) {
        if (!mask[r] || label[r] >= 0) continue;
        const id = nextId++;
        const cells = new Set();
        label[r] = id;
        cells.add(r);
        queue.length = 0;
        queue.push(r);
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const off0 = mesh.adjOffset[cur];
            const off1 = mesh.adjOffset[cur + 1];
            for (let i = off0; i < off1; i++) {
                const nb = mesh.adjList[i];
                if (mask[nb] && label[nb] < 0) {
                    label[nb] = id;
                    cells.add(nb);
                    queue.push(nb);
                }
            }
        }
        components.push({ id, cells });
    }
    return { label, components };
}

/** BFS distance (in hops) from a seed set, with optional barrier mask. */
function bfsDistance(mesh, seeds, barrier) {
    const N = mesh.numRegions;
    const dist = new Int32Array(N).fill(-1);
    const queue = [];
    let head = 0;
    for (const r of seeds) {
        if (barrier && barrier[r]) continue;
        dist[r] = 0;
        queue.push(r);
    }
    while (head < queue.length) {
        const cur = queue[head++];
        const d1 = dist[cur] + 1;
        const off0 = mesh.adjOffset[cur];
        const off1 = mesh.adjOffset[cur + 1];
        for (let i = off0; i < off1; i++) {
            const nb = mesh.adjList[i];
            if (dist[nb] >= 0) continue;
            if (barrier && barrier[nb]) continue;
            dist[nb] = d1;
            queue.push(nb);
        }
    }
    return dist;
}

// ────────────────────────────────────────────────────────────────────
//  Tier 1 — Artistic Interest
// ────────────────────────────────────────────────────────────────────

/**
 * Continental Silhouette Variety
 * Measures variance of convex-hull-solidity across continents.
 * (Approximated: since we're on a sphere mesh, we use the ratio of
 * actual cell count to the BFS-bounding-box area as a proxy for solidity.)
 */
function continentSilhouette(ctx) {
    const { mesh, r_elevation } = ctx;
    const N = mesh.numRegions;
    const isLand = new Uint8Array(N);
    for (let r = 0; r < N; r++) if (r_elevation[r] > 0) isLand[r] = 1;

    const { components } = connectedComponents(mesh, isLand);
    // Filter to continents (>0.5% of land cells)
    const totalLand = components.reduce((s, c) => s + c.cells.size, 0);
    const minSize = Math.max(10, totalLand * 0.005);
    const continents = components.filter(c => c.cells.size >= minSize);
    const islands = components.filter(c => c.cells.size < minSize);

    // Approximate solidity: area / (pi * (max_bfs_radius)^2)
    // We compute max BFS radius from centroid of each continent
    const solidities = [];
    for (const cont of continents) {
        const cellArr = Array.from(cont.cells);
        // Find approximate centroid (cell with min max-distance to others via BFS from random sample)
        const sample = cellArr[Math.floor(cellArr.length / 2)];
        const distFromSample = bfsDistance(mesh, [sample], null);
        let maxDist = 0;
        for (const r of cellArr) {
            if (distFromSample[r] > maxDist) maxDist = distFromSample[r];
        }
        // Solidity proxy: cellCount / (pi * maxDist^2)
        const circleArea = Math.PI * maxDist * maxDist;
        const solidity = circleArea > 0 ? Math.min(1, cont.cells.size / circleArea) : 1;
        solidities.push(solidity);
    }

    const mean = solidities.length > 0
        ? solidities.reduce((a, b) => a + b, 0) / solidities.length : 0;
    const variance = solidities.length > 1
        ? solidities.reduce((s, v) => s + (v - mean) ** 2, 0) / solidities.length : 0;

    return {
        continent_count: continents.length,
        island_count_total: islands.length,
        island_cells_total: islands.reduce((s, c) => s + c.cells.size, 0),
        continent_solidity_mean: +mean.toFixed(4),
        continent_solidity_variance: +variance.toFixed(4),
        // Store components for reuse by other metrics
        _continents: continents,
        _islands: islands,
        _isLand: isLand,
    };
}

/**
 * Elevation Drama
 * Relief headroom (p95-p50 of land), plus check that peaks are clustered.
 */
function elevationDrama(ctx) {
    const { mesh, r_elevation } = ctx;
    const N = mesh.numRegions;
    const landElev = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] > 0) landElev.push(r_elevation[r]);
    }
    if (landElev.length < 10) {
        return { relief_headroom: 0, peak_clustering: 0 };
    }
    const arr = new Float32Array(landElev);
    const p50 = percentile(arr, 0.50);
    const p95 = percentile(arr, 0.95);
    const relief = p95 - p50;

    // Peak clustering: fraction of top-5% cells that have a top-5% neighbor
    const threshold = p95;
    const isPeak = new Uint8Array(N);
    let peakCount = 0;
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] >= threshold) { isPeak[r] = 1; peakCount++; }
    }
    let clustered = 0;
    for (let r = 0; r < N; r++) {
        if (!isPeak[r]) continue;
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        for (let i = off0; i < off1; i++) {
            if (isPeak[mesh.adjList[i]]) { clustered++; break; }
        }
    }

    return {
        relief_headroom: +relief.toFixed(4),
        peak_clustering: peakCount > 0 ? +(clustered / peakCount).toFixed(4) : 0,
    };
}

/**
 * Coast Complexity
 * Dimensionless roughness: coastline_cell_count / sqrt(land_cell_count).
 */
function coastComplexity(ctx) {
    const { mesh, r_elevation } = ctx;
    const N = mesh.numRegions;
    let landCount = 0;
    let coastCount = 0;
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        landCount++;
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        for (let i = off0; i < off1; i++) {
            if (r_elevation[mesh.adjList[i]] <= 0) { coastCount++; break; }
        }
    }
    const index = landCount > 0 ? coastCount / Math.sqrt(landCount) : 0;
    return {
        coast_complexity_index: +index.toFixed(4),
        coastline_cells: coastCount,
        land_cells: landCount,
    };
}

/**
 * Ocean Floor Texture
 * Standard deviation of ocean elevations + trench presence.
 */
function oceanFloorTexture(ctx) {
    const { mesh, r_elevation } = ctx;
    const N = mesh.numRegions;
    const oceanElev = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) oceanElev.push(r_elevation[r]);
    }
    if (oceanElev.length < 10) {
        return { ocean_elev_stddev: 0, trench_fraction: 0 };
    }
    const arr = new Float32Array(oceanElev);
    const mean = oceanElev.reduce((a, b) => a + b, 0) / oceanElev.length;
    const variance = oceanElev.reduce((s, v) => s + (v - mean) ** 2, 0) / oceanElev.length;
    const stddev = Math.sqrt(variance);

    // Trench fraction: cells below p2 (expect distinct spike)
    const p02 = percentile(arr, 0.02);
    const p05 = percentile(arr, 0.05);
    const trenchGap = p05 - p02; // distance between p2 and p5 — large = distinct trench tail

    return {
        ocean_elev_stddev: +stddev.toFixed(5),
        ocean_trench_gap: +trenchGap.toFixed(5),
    };
}

/**
 * Flat Land on Ocean Plates
 * Land cells assigned to ocean plates that lack volcanic/tectonic relief.
 * These should be mountainous/volcanic, not flat plains.
 */
function flatOceanPlateLand(ctx) {
    const { mesh, r_elevation, r_plate, plateIsOcean, debugLayers } = ctx;
    const N = mesh.numRegions;
    const oceanPlateSet = new Set(plateIsOcean);
    let oceanPlateLandCount = 0;
    let flatOceanPlateLandCount = 0;
    const FLAT_THRESHOLD = 0.21; // below ~50m (quartic elev mapping) — barely above sea level

    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        if (!oceanPlateSet.has(r_plate[r])) continue;
        // This is land on an ocean plate
        oceanPlateLandCount++;
        if (r_elevation[r] < FLAT_THRESHOLD) {
            flatOceanPlateLandCount++;
        }
    }

    return {
        ocean_plate_land_cells: oceanPlateLandCount,
        flat_ocean_plate_land_cells: flatOceanPlateLandCount,
        flat_ocean_plate_land_fraction: oceanPlateLandCount > 0
            ? +(flatOceanPlateLandCount / oceanPlateLandCount).toFixed(4) : 0,
    };
}

// ────────────────────────────────────────────────────────────────────
//  Tier 2 — Scientific Plausibility
// ────────────────────────────────────────────────────────────────────

/**
 * Bimodal Hypsometry
 * Fit two-Gaussian model to elevation histogram.  Measure trough depth
 * and mode positions.
 */
function bimodalHypsometry(ctx) {
    const { r_elevation } = ctx;
    const N = r_elevation.length;
    const BINS = 200;
    const minE = -0.5, maxE = 0.8;
    const binW = (maxE - minE) / BINS;
    const hist = new Float64Array(BINS);

    for (let r = 0; r < N; r++) {
        const b = Math.floor((r_elevation[r] - minE) / binW);
        if (b >= 0 && b < BINS) hist[b]++;
    }
    // Normalize
    const total = hist.reduce((a, b) => a + b, 0);
    for (let i = 0; i < BINS; i++) hist[i] /= total;

    // Find two peaks: one below sea level (ocean), one above (land)
    const seaBin = Math.floor((0 - minE) / binW);
    let oceanPeak = 0, oceanPeakVal = 0;
    for (let i = 0; i < seaBin; i++) {
        if (hist[i] > oceanPeakVal) { oceanPeakVal = hist[i]; oceanPeak = i; }
    }
    let landPeak = seaBin, landPeakVal = 0;
    for (let i = seaBin; i < BINS; i++) {
        if (hist[i] > landPeakVal) { landPeakVal = hist[i]; landPeak = i; }
    }

    // Trough: minimum between the two peaks
    let troughVal = Infinity;
    for (let i = oceanPeak; i <= landPeak; i++) {
        if (hist[i] < troughVal) troughVal = hist[i];
    }
    const peakAvg = (oceanPeakVal + landPeakVal) / 2;
    const troughDepth = peakAvg > 0 ? 1 - troughVal / peakAvg : 0;

    return {
        ocean_mode_elev: +(minE + (oceanPeak + 0.5) * binW).toFixed(4),
        land_mode_elev: +(minE + (landPeak + 0.5) * binW).toFixed(4),
        hypsometry_trough_depth: +troughDepth.toFixed(4),
    };
}

/**
 * Mountain–Boundary Spatial Correlation
 * Top 5% land cells should cluster near actual plate boundaries
 * (cells where r_plate differs from a neighbor), not the propagated
 * stress field which extends far inland.
 */
function mountainBoundaryCorrelation(ctx) {
    const { mesh, r_elevation, r_plate } = ctx;
    const N = mesh.numRegions;

    // Find actual plate boundary cells (where r_plate differs from a neighbor)
    const boundaryCells = [];
    for (let r = 0; r < N; r++) {
        const pid = r_plate[r];
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        for (let i = off0; i < off1; i++) {
            if (r_plate[mesh.adjList[i]] !== pid) {
                boundaryCells.push(r);
                break;
            }
        }
    }
    if (boundaryCells.length === 0) {
        return { mountain_boundary_ratio: 1.0 };
    }

    const distToBoundary = bfsDistance(mesh, boundaryCells, null);

    // Land cells only
    const landDists = [];
    const mountainDists = [];
    const landElev = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        landElev.push(r_elevation[r]);
    }
    const p95 = percentile(new Float32Array(landElev), 0.95);

    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0 || distToBoundary[r] < 0) continue;
        landDists.push(distToBoundary[r]);
        if (r_elevation[r] >= p95) mountainDists.push(distToBoundary[r]);
    }

    const medianLand = landDists.length > 0
        ? percentile(new Float32Array(landDists), 0.5) : 0;
    const medianMountain = mountainDists.length > 0
        ? percentile(new Float32Array(mountainDists), 0.5) : 0;
    const ratio = medianLand > 0 ? medianMountain / medianLand : 1;

    return {
        mountain_boundary_ratio: +ratio.toFixed(4),
        mountain_boundary_median_hops: +medianMountain.toFixed(1),
        all_land_boundary_median_hops: +medianLand.toFixed(1),
    };
}

/**
 * Orogenic Power vs Elevation Correlation
 * The tectonic signal should survive post-processing.
 */
function orogenicCorrelation(ctx) {
    const { r_elevation, debugLayers } = ctx;
    if (!debugLayers || !debugLayers.orogenicPower) {
        return { orogenic_elev_correlation: null };
    }
    const op = debugLayers.orogenicPower;
    const N = r_elevation.length;

    // Pearson correlation on land cells
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0, n = 0;
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        const x = op[r], y = r_elevation[r];
        sumX += x; sumY += y; sumXY += x * y;
        sumX2 += x * x; sumY2 += y * y;
        n++;
    }
    if (n < 10) return { orogenic_elev_correlation: 0 };
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const corr = denom > 0 ? (n * sumXY - sumX * sumY) / denom : 0;

    return {
        orogenic_elev_correlation: +corr.toFixed(4),
    };
}

/**
 * Erosion–Slope Coherence
 * Hydraulic erosion should preferentially hit high-slope cells.
 */
function erosionSlopeCoherence(ctx) {
    const { mesh, r_elevation, r_xyz, debugLayers } = ctx;
    if (!debugLayers || !debugLayers.erosionDelta) {
        return { erosion_slope_correlation: null };
    }
    const delta = debugLayers.erosionDelta;
    const N = mesh.numRegions;

    // Compute slope per land cell (max elevation difference to neighbors)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0, n = 0;
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        let maxSlope = 0;
        for (let i = off0; i < off1; i++) {
            const nb = mesh.adjList[i];
            const dh = Math.abs(r_elevation[r] - r_elevation[nb]);
            if (dh > maxSlope) maxSlope = dh;
        }
        // Erosion delta should be negative (erosion) where slope is high
        const x = maxSlope;
        const y = -delta[r]; // positive = more erosion
        sumX += x; sumY += y; sumXY += x * y;
        sumX2 += x * x; sumY2 += y * y;
        n++;
    }
    if (n < 10) return { erosion_slope_correlation: 0 };
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const corr = denom > 0 ? (n * sumXY - sumX * sumY) / denom : 0;

    return {
        erosion_slope_correlation: +corr.toFixed(4),
    };
}

// ────────────────────────────────────────────────────────────────────
//  Tier 1+ — Island Metrics
// ────────────────────────────────────────────────────────────────────

/**
 * Island analysis: count, size distribution, arc association, elevation profile.
 */
function islandMetrics(ctx, silhouetteResult) {
    const { mesh, r_elevation, r_stress, r_plate, plateIsOcean } = ctx;
    const N = mesh.numRegions;
    const islands = silhouetteResult._islands;
    const oceanPlateSet = new Set(plateIsOcean);

    if (!islands || islands.length === 0) {
        return {
            island_count: 0,
            island_size_max: 0,
            island_mean_elevation: 0,
            island_arc_association: 0,
        };
    }

    // Size distribution
    const sizes = islands.map(c => c.cells.size).sort((a, b) => b - a);

    // Distance to high-stress cells (proxy for convergent boundaries)
    const stressCells = [];
    for (let r = 0; r < N; r++) {
        if (r_stress[r] > 0.2) stressCells.push(r);
    }
    const distToStress = stressCells.length > 0
        ? bfsDistance(mesh, stressCells, null) : null;

    // Per-island analysis
    let arcAssocCount = 0;
    let totalMeanElev = 0;
    const ARC_DIST_THRESHOLD = Math.round(800 / hopsToKm(1, N)); // ~800km in hops

    for (const island of islands) {
        // Mean elevation
        let elevSum = 0;
        let minDistToStress = Infinity;
        for (const r of island.cells) {
            elevSum += r_elevation[r];
            if (distToStress && distToStress[r] >= 0 && distToStress[r] < minDistToStress) {
                minDistToStress = distToStress[r];
            }
        }
        totalMeanElev += elevSum / island.cells.size;
        if (minDistToStress <= ARC_DIST_THRESHOLD) arcAssocCount++;
    }

    return {
        island_count: islands.length,
        island_size_max: sizes[0],
        island_size_median: sizes[Math.floor(sizes.length / 2)],
        island_mean_elevation: +(totalMeanElev / islands.length).toFixed(4),
        island_arc_association: +(arcAssocCount / islands.length).toFixed(4),
    };
}

// ────────────────────────────────────────────────────────────────────
//  Tier 1+ — Coastal Lowland & Shelf Metrics
// ────────────────────────────────────────────────────────────────────

/**
 * Near-sea-level land fraction and elevation band distribution.
 */
function coastalLowlandIndex(ctx) {
    const { r_elevation } = ctx;
    const N = r_elevation.length;
    // Elevation bands in normalized units (roughly: 0.01 ≈ 80m)
    // 0-50m ≈ 0-0.00625, 50-200m ≈ 0.00625-0.025, 200-500m ≈ 0.025-0.0625, 500m+ ≈ 0.0625+
    // But the exact scale depends on the planet's max elevation.
    // Use relative bands: bottom 5%, 5-20%, 20-50%, 50%+ of land elevation range.
    const landElevs = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] > 0) landElevs.push(r_elevation[r]);
    }
    if (landElevs.length < 10) {
        return { lowland_fraction: 0, midland_fraction: 0, highland_fraction: 0 };
    }

    const sorted = new Float32Array(landElevs).sort();
    const p10 = sorted[Math.floor(sorted.length * 0.10)];
    const p30 = sorted[Math.floor(sorted.length * 0.30)];

    // Thresholds from elevToHeightKm() quartic mapping:
    // 50m (0.05km) → elev 0.21, 200m → 0.31, 500m → 0.40
    let band0_50 = 0, band50_200 = 0, band200_500 = 0, band500plus = 0;
    for (const e of landElevs) {
        if (e < 0.21) band0_50++;
        else if (e < 0.31) band50_200++;
        else if (e < 0.40) band200_500++;
        else band500plus++;
    }
    const total = landElevs.length;

    return {
        land_band_0_50m_frac: +(band0_50 / total).toFixed(4),
        land_band_50_200m_frac: +(band50_200 / total).toFixed(4),
        land_band_200_500m_frac: +(band200_500 / total).toFixed(4),
        land_band_500m_plus_frac: +(band500plus / total).toFixed(4),
        coastal_lowland_fraction: +((band0_50 + band50_200) / total).toFixed(4),
    };
}

/**
 * Shelf Width — distance from coast to -200m depth.
 * Separately for active vs passive margins (using stress as proxy).
 */
function shelfWidth(ctx) {
    const { mesh, r_elevation, r_stress } = ctx;
    const N = mesh.numRegions;

    // Find coastline cells (land adjacent to ocean)
    const coastCells = [];
    const coastIsActive = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) continue;
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        let isCoast = false;
        for (let i = off0; i < off1; i++) {
            if (r_elevation[mesh.adjList[i]] <= 0) { isCoast = true; break; }
        }
        if (isCoast) {
            coastCells.push(r);
            // Active margin: near high stress
            coastIsActive.push(r_stress[r] > 0.15);
        }
    }

    // For each coast cell, walk outward into ocean measuring:
    // 1) Distance to shelf break (elevation crossing below p25 of ocean depth)
    // 2) First-ocean-cell elevation (diagnostic)
    //
    // We use a relative shelf break threshold based on actual ocean elevation
    // distribution rather than a fixed value, since the elevation scale varies.
    const oceanElevs = [];
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) oceanElevs.push(r_elevation[r]);
    }
    // Shelf break = 25th percentile of ocean depth (shallow quarter = shelf)
    const SHELF_BREAK_DEPTH = oceanElevs.length > 0
        ? percentile(new Float32Array(oceanElevs), 0.25) : -0.1;

    const activeWidths = [];
    const passiveWidths = [];
    let firstOceanElevSum = 0;
    let firstOceanCount = 0;

    // Sample coastline to keep computation bounded (every 3rd coast cell)
    for (let ci = 0; ci < coastCells.length; ci += 3) {
        const start = coastCells[ci];
        const visited = new Set();
        visited.add(start);
        let frontier = [start];
        let dist = 0;
        let found = false;
        const MAX_DIST = 80;

        while (frontier.length > 0 && dist < MAX_DIST) {
            dist++;
            const next = [];
            for (const cur of frontier) {
                const off0 = mesh.adjOffset[cur];
                const off1 = mesh.adjOffset[cur + 1];
                for (let i = off0; i < off1; i++) {
                    const nb = mesh.adjList[i];
                    if (visited.has(nb)) continue;
                    visited.add(nb);
                    if (r_elevation[nb] > 0) continue; // stay in ocean
                    if (dist === 1) {
                        firstOceanElevSum += r_elevation[nb];
                        firstOceanCount++;
                    }
                    if (r_elevation[nb] <= SHELF_BREAK_DEPTH) {
                        if (coastIsActive[ci]) activeWidths.push(dist);
                        else passiveWidths.push(dist);
                        found = true;
                        break;
                    }
                    next.push(nb);
                }
                if (found) break;
            }
            if (found) break;
            frontier = next;
        }
    }

    const medianActive = activeWidths.length > 0
        ? percentile(new Float32Array(activeWidths), 0.5) : 0;
    const medianPassive = passiveWidths.length > 0
        ? percentile(new Float32Array(passiveWidths), 0.5) : 0;

    return {
        shelf_break_threshold: +SHELF_BREAK_DEPTH.toFixed(4),
        shelf_width_active_hops: +medianActive.toFixed(1),
        shelf_width_passive_hops: +medianPassive.toFixed(1),
        shelf_width_active_km: +hopsToKm(medianActive, N).toFixed(0),
        shelf_width_passive_km: +hopsToKm(medianPassive, N).toFixed(0),
        shelf_passive_wider_than_active: medianPassive > medianActive,
        shelf_measurements_active: activeWidths.length,
        shelf_measurements_passive: passiveWidths.length,
        shelf_first_ocean_cell_mean_elev: firstOceanCount > 0
            ? +(firstOceanElevSum / firstOceanCount).toFixed(5) : 0,
    };
}

/**
 * Continental Interior Elevation Gradient
 * How steeply land rises from coastline inland.
 */
function interiorGradient(ctx) {
    const { mesh, r_elevation } = ctx;
    const N = mesh.numRegions;

    // Find coastal land cells
    const coastSeeds = [];
    const isOcean = new Uint8Array(N);
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0) { isOcean[r] = 1; continue; }
        const off0 = mesh.adjOffset[r];
        const off1 = mesh.adjOffset[r + 1];
        for (let i = off0; i < off1; i++) {
            if (r_elevation[mesh.adjList[i]] <= 0) { coastSeeds.push(r); break; }
        }
    }

    // BFS distance from coast (land only)
    const distFromCoast = bfsDistance(mesh, coastSeeds, isOcean);

    // Bin by distance, compute mean elevation at each distance band
    const MAX_BAND = 30; // ~30 hops inland
    const bandElev = new Float64Array(MAX_BAND);
    const bandCount = new Int32Array(MAX_BAND);
    for (let r = 0; r < N; r++) {
        if (r_elevation[r] <= 0 || distFromCoast[r] < 0) continue;
        const band = Math.min(distFromCoast[r], MAX_BAND - 1);
        bandElev[band] += r_elevation[r];
        bandCount[band]++;
    }

    // Compute gradient from band 0 to band 5 (first ~5 hops = near-coast)
    const nearCoastElev = bandCount[0] > 0 ? bandElev[0] / bandCount[0] : 0;
    let midBand = 5;
    while (midBand > 1 && bandCount[midBand] === 0) midBand--;
    const midElev = bandCount[midBand] > 0 ? bandElev[midBand] / bandCount[midBand] : 0;
    const nearCoastGradient = midBand > 0 ? (midElev - nearCoastElev) / midBand : 0;

    // Gradient per km
    const hopKm = hopsToKm(1, N);
    const gradientPerKm = hopKm > 0 ? nearCoastGradient / hopKm : 0;

    return {
        near_coast_mean_elev: +nearCoastElev.toFixed(5),
        interior_gradient_per_hop: +nearCoastGradient.toFixed(5),
        interior_gradient_per_km: +gradientPerKm.toFixed(6),
    };
}

// ────────────────────────────────────────────────────────────────────
//  Tier 3 — Layer Coherence
// ────────────────────────────────────────────────────────────────────

/**
 * Hotspot Contribution Distinctiveness
 * Kurtosis of hotspot layer — should be high (sparse, intense).
 */
function hotspotDistinctiveness(ctx) {
    const { debugLayers } = ctx;
    if (!debugLayers || !debugLayers.hotspot) {
        return { hotspot_kurtosis: null };
    }
    const hs = debugLayers.hotspot;
    const N = hs.length;
    let sum = 0, n = 0;
    for (let i = 0; i < N; i++) {
        if (hs[i] !== 0) { sum += hs[i]; n++; }
    }
    if (n < 10) return { hotspot_kurtosis: 0, hotspot_active_fraction: 0 };
    const mean = sum / n;
    let m2 = 0, m4 = 0;
    for (let i = 0; i < N; i++) {
        if (hs[i] === 0) continue;
        const d = hs[i] - mean;
        m2 += d * d;
        m4 += d * d * d * d;
    }
    m2 /= n; m4 /= n;
    const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0; // excess kurtosis

    return {
        hotspot_kurtosis: +kurtosis.toFixed(2),
        hotspot_active_fraction: +(n / N).toFixed(4),
    };
}

/**
 * Back-Arc and Fold Ridge Presence
 * Verify these features have nonzero signal where expected.
 */
function backArcFoldPresence(ctx) {
    const { debugLayers } = ctx;
    const result = {};

    if (debugLayers && debugLayers.backArc) {
        const ba = debugLayers.backArc;
        let nonzero = 0, sum = 0;
        for (let i = 0; i < ba.length; i++) {
            if (ba[i] !== 0) { nonzero++; sum += Math.abs(ba[i]); }
        }
        result.back_arc_active_cells = nonzero;
        result.back_arc_mean_magnitude = nonzero > 0 ? +(sum / nonzero).toFixed(5) : 0;
    }

    if (debugLayers && debugLayers.phasorRidge) {
        const fr = debugLayers.phasorRidge;
        let nonzero = 0, sum = 0;
        for (let i = 0; i < fr.length; i++) {
            if (fr[i] !== 0) { nonzero++; sum += Math.abs(fr[i]); }
        }
        result.phasor_ridge_active_cells = nonzero;
        result.phasor_ridge_mean_magnitude = nonzero > 0 ? +(sum / nonzero).toFixed(5) : 0;
    }

    return result;
}

// ────────────────────────────────────────────────────────────────────
//  Main entry point
// ────────────────────────────────────────────────────────────────────

/**
 * Compute all terrain quality metrics.
 *
 * @param {Object} ctx — context with:
 *   mesh, r_xyz, r_elevation, r_plate, plateIsOcean (Array or Set),
 *   r_stress, debugLayers, prePostElev (optional)
 * @returns {Object} flat scorecard of named metrics
 */
export function computeTerrainMetrics(ctx) {
    // Normalize plateIsOcean to an iterable of seed region IDs
    if (ctx.plateIsOcean instanceof Set) {
        ctx.plateIsOcean = Array.from(ctx.plateIsOcean);
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const silhouette = continentSilhouette(ctx);
    const drama = elevationDrama(ctx);
    const coast = coastComplexity(ctx);
    const oceanFloor = oceanFloorTexture(ctx);
    const flatOcean = flatOceanPlateLand(ctx);
    const hyps = bimodalHypsometry(ctx);
    const mtnBoundary = mountainBoundaryCorrelation(ctx);
    const orogenic = orogenicCorrelation(ctx);
    const erosion = erosionSlopeCoherence(ctx);
    const islands = islandMetrics(ctx, silhouette);
    const lowland = coastalLowlandIndex(ctx);
    const shelf = shelfWidth(ctx);
    const gradient = interiorGradient(ctx);
    const hotspot = hotspotDistinctiveness(ctx);
    const backArcFold = backArcFoldPresence(ctx);

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

    // Flatten into single scorecard, dropping internal fields
    const scorecard = {};
    for (const partial of [silhouette, drama, coast, oceanFloor, flatOcean, hyps,
                           mtnBoundary, orogenic, erosion, islands, lowland,
                           shelf, gradient, hotspot, backArcFold]) {
        for (const [k, v] of Object.entries(partial)) {
            if (!k.startsWith('_')) scorecard[k] = v;
        }
    }
    scorecard._metrics_ms = +elapsed.toFixed(1);

    return scorecard;
}
