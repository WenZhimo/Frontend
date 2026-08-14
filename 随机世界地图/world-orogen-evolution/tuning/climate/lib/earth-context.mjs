/**
 * Builds the fixed "Earth example" evaluation context once, exactly mirroring
 * the app's heightmap-import pipeline (js/planet-worker.js handleImportHeightmap
 * with the import page's default sliders: all sculpting 0, jitter 0.75):
 *
 *   buildSphere → sampleHeightmap(assets/earth.png) → detail noise L1 + L2 →
 *   soil creep → synthetic plates → [climate chain runs per evaluation]
 *
 * Everything here is deterministic for a given (N, seed).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import Delaunator from 'delaunator';

import { makeRng } from '../../../js/rng.js';
import { setDelaunator, buildSphere } from '../../../js/sphere-mesh.js';
import { applyDetailNoise, applySoilCreep } from '../../../js/terrain-post.js';
import { DETAIL_NOISE_DAMPEN_STRENGTH } from '../../../js/terrain-config.js';
import { loadGroundTruth, truthAt, NO_DATA } from './ground-truth.mjs';

setDelaunator(Delaunator);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const EARTH_PNG = path.join(PROJECT_ROOT, 'assets', 'earth.png');

// ── Verbatim ports of tiny private helpers from js/planet-worker.js ──

function sampleBilinear(pixels, imgW, imgH, px, py) {
    py = Math.max(0, Math.min(py, imgH - 1));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = (x0 + 1) % imgW;
    const y1 = Math.min(y0 + 1, imgH - 1);
    const fx = px - x0, fy = py - y0;
    const v00 = pixels[y0 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v10 = pixels[y0 * imgW + x1];
    const v01 = pixels[y1 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v11 = pixels[y1 * imgW + x1];
    return (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy + v11 * fx * fy);
}

function grayscaleToElevation(v) {
    if (v < 1) return -0.5;
    return Math.sqrt((v - 1) / 254);
}

function sampleHeightmap(mesh, r_xyz, imageData, imgW, imgH) {
    const r_elevation = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(x, z);
        const px = (lon / Math.PI + 1) * 0.5 * imgW;
        const py = (0.5 - lat / Math.PI) * imgH;
        r_elevation[r] = grayscaleToElevation(sampleBilinear(imageData, imgW, imgH, px, py));
    }
    return r_elevation;
}

function deriveSyntheticPlates(mesh, r_elevation) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N).fill(-1);
    const plateSeeds = new Set();
    const plateIsOcean = new Set();
    const plateVec = {};
    const { adjOffset, adjList } = mesh;

    for (let r = 0; r < N; r++) {
        if (r_plate[r] >= 0) continue;
        const isOcean = r_elevation[r] <= 0;
        r_plate[r] = r;
        plateSeeds.add(r);
        plateVec[r] = [0, 0, 0];
        if (isOcean) plateIsOcean.add(r);
        const queue = [r];
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] >= 0) continue;
                if ((r_elevation[nb] <= 0) === isOcean) {
                    r_plate[nb] = r;
                    queue.push(nb);
                }
            }
        }
    }
    return { r_plate, plateSeeds, plateIsOcean, plateVec };
}

/** Decode assets/earth.png to a grayscale Uint8Array (same luminance as import-main.js). */
function loadEarthGrayscale(pngPath = EARTH_PNG) {
    const png = PNG.sync.read(fs.readFileSync(pngPath));
    const { width, height, data } = png;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }
    return { gray, width, height };
}

/**
 * Build the full evaluation context.
 * @param {object} opts { N: region count, seed, jitter }
 */
export function buildEarthContext({ N = 40000, seed = 1234, jitter = 0.75 } = {}) {
    const t0 = performance.now();
    const rng = makeRng(seed);
    const { mesh, r_xyz } = buildSphere(N, jitter, rng);

    const { gray, width, height } = loadEarthGrayscale();
    const r_elevation = sampleHeightmap(mesh, r_xyz, gray, width, height);

    // Post-processing exactly as handleImportHeightmap with all sculpting sliders
    // at 0: detail noise L1 + L2 (always on), soil creep (always on). Terrain
    // warp / smoothing / erosion / ridge sharpening are all skipped at 0.
    const r_isOcean = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_elevation[r] <= 0) r_isOcean[r] = 1;
    }
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
        dampenField: null,
        dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
        amplitudeField: null,
    });
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
        amplitudeKm: 0.05,
        frequencyMult: 2.0,
        warpAmpMult: 2.0,
        bipolar: true,
        biasExponent: 0.4,
        seedOffset: 13579,
        dampenField: null,
        dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
        amplitudeField: null,
    });
    applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);

    const { r_plate, plateSeeds, plateIsOcean, plateVec } = deriveSyntheticPlates(mesh, r_elevation);

    // Per-region lat/lon (radians) — same formulas as sampleHeightmap, so the
    // ground-truth lookup aligns with the heightmap sampling.
    const numRegions = mesh.numRegions;
    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1])));
        r_lon[r] = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);
    }

    // Ground truth per region
    const truthGrid = loadGroundTruth();
    const r_truth = new Uint8Array(numRegions).fill(NO_DATA);
    for (let r = 0; r < numRegions; r++) {
        r_truth[r] = truthAt(truthGrid, r_lat[r], r_lon[r]);
    }

    // Scoring mask: sim says land AND truth has data. Report mask agreement too.
    const r_scored = new Uint8Array(numRegions);
    let simLand = 0, truthLand = 0, bothLand = 0;
    for (let r = 0; r < numRegions; r++) {
        const sl = r_elevation[r] > 0;
        const tl = r_truth[r] !== NO_DATA;
        if (sl) simLand++;
        if (tl) truthLand++;
        if (sl && tl) { bothLand++; r_scored[r] = 1; }
    }

    return {
        mesh, r_xyz, r_elevation, r_lat, r_lon,
        r_plate, plateSeeds, plateIsOcean, plateVec,
        truthGrid, r_truth, r_scored,
        maskStats: {
            simLandFrac: simLand / numRegions,
            truthLandFrac: truthLand / numRegions,
            scoredFrac: bothLand / numRegions,
            landAgreement: bothLand / Math.max(1, simLand),
        },
        seed, N,
        buildMs: performance.now() - t0,
    };
}
