/**
 * 空间诊断：模拟柯本地图在哪里系统性出错？
 *
 * 输出：
 *   - 每 10° 纬度带的大类面积占比（模拟 vs 真实）
 *   - 一组真实世界命名区域中的主导真实类别与模拟类别
 *   - 主要混淆对及其纬度带分布
 *
 * 用法：node tuning/climate/diagnose.mjs [--params 文件] [--n 160000]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf, similarity } from './lib/koppen-distance.mjs';
import { KOPPEN_CLASSES } from '../../js/koppen.js';
import { NO_DATA } from './lib/ground-truth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
    const a = { n: 160000, params: null };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--n') a.n = +argv[++i];
        else if (argv[i] === '--params') a.params = argv[++i];
    }
    return a;
}

// 名称 → [纬度最小, 纬度最大, 经度最小, 经度最大]（度，经度 -180..180）
const REGIONS = {
    'Western Europe':      [44, 60, -8, 18],
    'Mediterranean basin': [31, 44, -6, 36],
    'North India (Ganges)':[22, 31, 74, 88],
    'South China':         [22, 31, 105, 120],
    'Florida/SE US':       [27, 35, -88, -80],
    'US/Canada Great Plains':[38, 54, -106, -96],
    'Eastern North America':[33, 47, -88, -72],
    'Amazon basin':        [-8, 4, -68, -52],
    'Congo basin':         [-4, 4, 16, 28],
    'Sahara':              [19, 28, -4, 28],
    'Sahel':               [11, 16, -8, 28],
    'Central Asia (Gobi)': [40, 50, 88, 110],
    'Siberia':             [55, 67, 82, 120],
    'SE Australia':        [-39, -29, 140, 152],
    'Patagonia':           [-50, -38, -72, -64],
    'Southern Africa':     [-30, -20, 15, 30],
    'California/US West':  [34, 44, -124, -118],
};

const GROUP_TAG = { A: 'tropical', B: 'arid', C: 'temperate', D: 'continental', E: 'polar' };

function dominantClass(counts) {
    let best = -1, bestN = 0, total = 0;
    for (const [id, n] of Object.entries(counts)) { total += n; if (n > bestN) { bestN = n; best = +id; } }
    return { id: best, frac: total ? bestN / total : 0, total };
}

async function main() {
    const args = parseArgs(process.argv);
    const overrides = args.params ? (JSON.parse(fs.readFileSync(args.params, 'utf8')).params ?? {}) : {};
    console.log(`正在构建地球上下文（N=${args.n}）…`);
    const ctx = buildEarthContext({ N: args.n });
    const { r_koppen } = runClimate(ctx, overrides);
    const { r_truth, r_scored, r_lat, r_lon } = ctx;
    const n = ctx.mesh.numRegions;

    // ── 1. 各纬度带大类占比 ──
    const BAND = 15;
    const bands = {};
    for (let r = 0; r < n; r++) {
        if (!r_scored[r] || r_truth[r] === NO_DATA) continue;
        const latDeg = r_lat[r] * 180 / Math.PI;
        const b = Math.floor((latDeg + 90) / BAND) * BAND - 90;
        (bands[b] ??= { sim: {}, truth: {}, n: 0, graded: 0 });
        const gt = majorGroupOf(r_truth[r]), gs = majorGroupOf(r_koppen[r]);
        bands[b].truth[gt] = (bands[b].truth[gt] || 0) + 1;
        bands[b].sim[gs] = (bands[b].sim[gs] || 0) + 1;
        bands[b].n++;
        bands[b].graded += similarity(r_truth[r], r_koppen[r]);
    }
    console.log('\n=== 按纬度带统计的大类面积（模拟 → 真实；✗ = 偏差 >5 个百分点）===');
    console.log('纬度带      分级    A 热带       B 干旱       C 温带       D 大陆性    E 极地');
    for (const b of Object.keys(bands).map(Number).sort((x, y) => y - x)) {
        const bd = bands[b];
        const cell = (g) => {
            const s = (bd.sim[g] || 0) / bd.n, t = (bd.truth[g] || 0) / bd.n;
            const off = Math.abs(s - t) > 0.05 ? '✗' : ' ';
            return `${(s * 100).toFixed(0).padStart(3)}→${(t * 100).toFixed(0).padStart(3)}${off}`;
        };
        const lbl = `${b}..${b + BAND}`.padEnd(10);
        console.log(`${lbl} ${(bd.graded / bd.n).toFixed(2)}    ${cell('A')}     ${cell('B')}     ${cell('C')}     ${cell('D')}     ${cell('E')}`);
    }

    // ── 2. 命名区域探针 ──
    console.log('\n=== 命名区域：主导真实类别 vs 模拟类别 ===');
    console.log('区域                      真实        模拟         分级   精确   n');
    for (const [name, [laMin, laMax, loMin, loMax]] of Object.entries(REGIONS)) {
        const tc = {}, sc = {};
        let cnt = 0, exact = 0, graded = 0;
        for (let r = 0; r < n; r++) {
            if (!r_scored[r] || r_truth[r] === NO_DATA) continue;
            const la = r_lat[r] * 180 / Math.PI, lo = r_lon[r] * 180 / Math.PI;
            if (la < laMin || la > laMax || lo < loMin || lo > loMax) continue;
            tc[r_truth[r]] = (tc[r_truth[r]] || 0) + 1;
            sc[r_koppen[r]] = (sc[r_koppen[r]] || 0) + 1;
            cnt++;
            if (r_truth[r] === r_koppen[r]) exact++;
            graded += similarity(r_truth[r], r_koppen[r]);
        }
        if (cnt < 5) { console.log(`${name.padEnd(25)} （仅 ${cnt} 个单元）`); continue; }
        const dt = dominantClass(tc), ds = dominantClass(sc);
        const tCode = `${KOPPEN_CLASSES[dt.id].code}(${(dt.frac * 100).toFixed(0)}%)`;
        const sCode = `${KOPPEN_CLASSES[ds.id].code}(${(ds.frac * 100).toFixed(0)}%)`;
        const flag = dt.id === ds.id ? '' : '  ✗';
        console.log(`${name.padEnd(25)} ${tCode.padEnd(12)} ${sCode.padEnd(12)} ${(graded / cnt).toFixed(2)}    ${(exact / cnt * 100).toFixed(0).padStart(3)}%  ${cnt}${flag}`);
    }

    // ── 3. 带纬度特征的主要混淆 ──
    const conf = {};
    for (let r = 0; r < n; r++) {
        if (!r_scored[r] || r_truth[r] === NO_DATA) continue;
        if (r_truth[r] === r_koppen[r]) continue;
        const key = r_truth[r] + ',' + r_koppen[r];
        (conf[key] ??= { count: 0, latSum: 0 });
        conf[key].count++;
        conf[key].latSum += Math.abs(r_lat[r] * 180 / Math.PI);
    }
    const pairs = Object.entries(conf).map(([k, v]) => {
        const [t, s] = k.split(',').map(Number);
        return { t, s, count: v.count, meanAbsLat: v.latSum / v.count, sim: similarity(t, s) };
    }).sort((a, b) => b.count * (1 - b.sim) - a.count * (1 - a.sim)).slice(0, 16);
    console.log('\n=== 代价最高的混淆（数量 × 差异度），含平均 |纬度| ===');
    console.log('真实 → 模拟     数量    平均|纬度|  相似度');
    for (const p of pairs) {
        console.log(`${(KOPPEN_CLASSES[p.t].code + ' → ' + KOPPEN_CLASSES[p.s].code).padEnd(16)} ${String(p.count).padStart(5)}   ${p.meanAbsLat.toFixed(0).padStart(3)}°       ${p.sim.toFixed(2)}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
