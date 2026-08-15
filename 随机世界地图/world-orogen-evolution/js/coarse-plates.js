// 粗参考网格，用于生成不随显示分辨率改变的板块边界。
// 先在固定约 20K 区域的网格上生成板块，再投影到任意
// 高分辨率网格，并用 FBM 噪声扰动形成分形边界。

import { makeRng } from './rng.js';
import { buildSphere } from './sphere-mesh.js';
import { SimplexNoise } from './simplex-noise.js';
import { generatePlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';
import {
    N_COARSE, COARSE_JITTER, COARSE_PERTURB_BASE, COARSE_PERTURB_LOW_T,
    COARSE_FBM_BASE_FREQ, COARSE_FBM_OCTAVES, COARSE_FBM_DECAY, COARSE_FBM_FREQ_MULT,
    PLATE_LOW_PLATE_T_HIGH, PLATE_LOW_PLATE_T_RANGE,
} from './terrain-config.js';

/**
 * 在固定粗参考网格上生成板块与海陆分配。
 * 使用独立随机流，避免影响主网格的随机序列。
 * 抖动固定，因此用户调整不规则度时板块形状不会变化。
 */
export function generateCoarsePlates(seed, numPlates, numContinents, continentSizeVariety = 0, landCoverage = 0.3) {
    const coarseRng = makeRng(seed + 137);
    const { mesh: coarseMesh, r_xyz: coarse_xyz } = buildSphere(N_COARSE, COARSE_JITTER, coarseRng);

    const { r_plate: coarse_r_plate, plateSeeds: coarsePlateSeeds, plateVec: coarsePlateVec } =
        generatePlates(coarseMesh, coarse_xyz, numPlates, seed);

    const coarsePlateIsOcean = assignOceanLand(
        coarseMesh, coarse_r_plate, coarsePlateSeeds, coarse_xyz, seed, numContinents, continentSizeVariety, landCoverage
    );

    return {
        coarseMesh,
        coarse_xyz,
        coarse_r_plate,
        coarsePlateSeeds,
        coarsePlateVec,
        coarsePlateIsOcean,
    };
}

/**
 * 通过最近邻查询把粗网格板块分配投影到高分辨率网格，
 * 并用 FBM 噪声扰动生成分形板块边界。
 *
 * 每个高分辨率点在最近邻查询前都会被多倍频 simplex 噪声偏移，
 * 让板块边界在约两个粗单元宽度内摆动，并带有多尺度分形细节。
 *
 * 在粗网格上使用带热启动的邻接步行，单区域均摊成本为 O(1)。
 */
export function projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, numPlates) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N);
    const { adjOffset: cOff, adjList: cAdj } = coarseMesh;

    // 用于分形边界扰动的 FBM 噪声。
    const noise = new SimplexNoise(seed + 999);
    const coarseEdgeRad = Math.PI / Math.sqrt(coarseMesh.numRegions);
    const lowPlateT = numPlates != null ? Math.max(0, Math.min(1, (PLATE_LOW_PLATE_T_HIGH - numPlates) / PLATE_LOW_PLATE_T_RANGE)) : 0;
    const perturbAmp = coarseEdgeRad * (COARSE_PERTURB_BASE + COARSE_PERTURB_LOW_T * lowPlateT); // 1.5 → 2.5 个粗单元
    const BASE_FREQ = COARSE_FBM_BASE_FREQ; // 球直径约 8 个特征，赤道约 16 个

    const NC = coarseMesh.numRegions;
    const MAX_WALK = Math.ceil(Math.sqrt(NC)); // 贪婪步行安全上限
    let cur = 0; // 当前最佳粗区域，会在迭代之间热启动

    for (let r = 0; r < N; r++) {
        const ox = r_xyz[3 * r], oy = r_xyz[3 * r + 1], oz = r_xyz[3 * r + 2];

        // FBM 扰动：偏移查询点以生成分形边界。
        let dx = 0, dy = 0, dz = 0;
        let amp = perturbAmp;
        let fx = ox * BASE_FREQ, fy = oy * BASE_FREQ, fz = oz * BASE_FREQ;
        for (let oct = 0; oct < COARSE_FBM_OCTAVES; oct++) {
            dx += noise.noise3D(fx,       fy,       fz)       * amp;
            dy += noise.noise3D(fx + 100, fy + 100, fz + 100) * amp;
            dz += noise.noise3D(fx + 200, fy + 200, fz + 200) * amp;
            amp *= COARSE_FBM_DECAY;
            fx *= COARSE_FBM_FREQ_MULT; fy *= COARSE_FBM_FREQ_MULT; fz *= COARSE_FBM_FREQ_MULT;
        }

        // 将扰动后的点投回单位球面。
        let px = ox + dx, py = oy + dy, pz = oz + dz;
        const len = Math.sqrt(px * px + py * py + pz * pz) || 1;
        px /= len; py /= len; pz /= len;

        // 贪婪步行：查找离扰动点最近的粗区域。
        let bestDot = px * coarse_xyz[3 * cur] + py * coarse_xyz[3 * cur + 1] + pz * coarse_xyz[3 * cur + 2];

        let improved = true;
        let steps = 0;
        while (improved && steps < MAX_WALK) {
            improved = false;
            steps++;
            for (let i = cOff[cur], iEnd = cOff[cur + 1]; i < iEnd; i++) {
                const nb = cAdj[i];
                const d = px * coarse_xyz[3 * nb] + py * coarse_xyz[3 * nb + 1] + pz * coarse_xyz[3 * nb + 2];
                if (d > bestDot) {
                    bestDot = d;
                    cur = nb;
                    improved = true;
                }
            }
        }

        // 回退：若贪婪步行触及步数上限，则改用暴力搜索。
        if (steps >= MAX_WALK) {
            for (let c = 0; c < NC; c++) {
                const d = px * coarse_xyz[3 * c] + py * coarse_xyz[3 * c + 1] + pz * coarse_xyz[3 * c + 2];
                if (d > bestDot) { bestDot = d; cur = c; }
            }
        }

        r_plate[r] = coarse_r_plate[cur];
    }

    return r_plate;
}
