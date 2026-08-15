/**
 * 渲染等距圆柱柯本地图（模拟、真实答案、一致性）
 * 为 PNG，供视觉检查使用。
 */

import fs from 'node:fs';
import { PNG } from 'pngjs';
import { KOPPEN_CLASSES } from '../../../js/koppen.js';
import { GRID_W, GRID_H, NO_DATA } from './ground-truth.mjs';

const OCEAN_RGB = [40, 60, 90];

/**
 * 为 W×H 等距圆柱栅格构建“像素 → 最近区域”的索引，
 * 使用经纬度分桶网格（思路与 wind.js 的地理索引相同）。
 */
export function buildPixelToRegion(ctx, W = GRID_W, H = GRID_H) {
    const { r_lat, r_lon } = ctx;
    const n = ctx.mesh.numRegions;
    const BINS_LAT = 90, BINS_LON = 180;
    const buckets = Array.from({ length: BINS_LAT * BINS_LON }, () => []);
    const binOf = (lat, lon) => {
        const bLat = Math.min(BINS_LAT - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * BINS_LAT)));
        const bLon = Math.min(BINS_LON - 1, Math.max(0, Math.floor((lon / (2 * Math.PI) + 0.5) * BINS_LON)));
        return bLat * BINS_LON + bLon;
    };
    for (let r = 0; r < n; r++) buckets[binOf(r_lat[r], r_lon[r])].push(r);

    const out = new Int32Array(W * H).fill(-1);
    for (let py = 0; py < H; py++) {
        const lat = (0.5 - (py + 0.5) / H) * Math.PI;
        const cosLat = Math.cos(lat);
        for (let px = 0; px < W; px++) {
            const lon = ((px + 0.5) / W * 2 - 1) * Math.PI;
            const bLat = Math.min(BINS_LAT - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * BINS_LAT)));
            const bLon = Math.min(BINS_LON - 1, Math.max(0, Math.floor((lon / (2 * Math.PI) + 0.5) * BINS_LON)));
            let best = -1, bestD = Infinity;
            // 扩张环搜索：总是扫描第 0 和第 1 环（靠近
            // 分桶边缘的点可能在相邻分桶中拥有最近区域），
            // 之后仅在尚未找到结果时继续扩张。
            for (let ring = 0; ring < 8; ring++) {
                if (ring > 1 && best !== -1) break;
                for (let dy = -ring; dy <= ring; dy++) {
                    for (let dx = -ring; dx <= ring; dx++) {
                        if (Math.max(Math.abs(dy), Math.abs(dx)) !== ring) continue;
                        const by = bLat + dy;
                        if (by < 0 || by >= BINS_LAT) continue;
                        const bx = ((bLon + dx) % BINS_LON + BINS_LON) % BINS_LON;
                        for (const r of buckets[by * BINS_LON + bx]) {
                            let dLon = Math.abs(r_lon[r] - lon);
                            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
                            const dLat = r_lat[r] - lat;
                            const d = dLat * dLat + (dLon * cosLat) * (dLon * cosLat);
                            if (d < bestD) { bestD = d; best = r; }
                        }
                    }
                }
            }
            out[py * W + px] = best;
        }
    }
    return out;
}

function writePng(path, W, H, paint) {
    const png = new PNG({ width: W, height: H });
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const [r, g, b] = paint(px, py);
            const i = (py * W + px) * 4;
            png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
        }
    }
    fs.writeFileSync(path, PNG.sync.write(png));
}

function classRgb(id) {
    if (id === 0 || id === NO_DATA) return OCEAN_RGB;
    const c = KOPPEN_CLASSES[id].color;
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}

/** 写出模拟 / 真实 / 一致性地图，并返回文件路径。 */
export function renderMaps(ctx, r_koppen, outDir, prefix = 'koppen') {
    fs.mkdirSync(outDir, { recursive: true });
    const W = GRID_W, H = GRID_H;
    const pix2reg = buildPixelToRegion(ctx, W, H);
    const { truthGrid, r_truth, r_scored } = ctx;

    const simPath = `${outDir}/${prefix}-sim.png`;
    writePng(simPath, W, H, (px, py) => {
        const r = pix2reg[py * W + px];
        if (r === -1 || ctx.r_elevation[r] <= 0) return OCEAN_RGB;
        return classRgb(r_koppen[r]);
    });

    const truthPath = `${outDir}/${prefix}-truth.png`;
    writePng(truthPath, W, H, (px, py) => {
        // 真实答案网格第 0 行 = -89.75°（南）；PNG 第 0 行 = 北。
        const row = H - 1 - py;
        return classRgb(truthGrid[row * W + px]);
    });

    const diffPath = `${outDir}/${prefix}-diff.png`;
    writePng(diffPath, W, H, (px, py) => {
        const r = pix2reg[py * W + px];
        if (r === -1 || !r_scored[r]) return [20, 20, 25];
        if (r_koppen[r] === r_truth[r]) return [60, 160, 60];        // 精确匹配
        const sameMajor = KOPPEN_CLASSES[r_koppen[r]].code[0] === KOPPEN_CLASSES[r_truth[r]].code[0];
        return sameMajor ? [220, 190, 60] : [200, 60, 50];           // 大类匹配 / 未命中
    });

    return { simPath, truthPath, diffPath };
}
