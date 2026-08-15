/**
 * 对照真实地球柯本气候区自动调校气候参数。
 *
 * 策略（auto 模式）：
 *   1. 使用当前默认值进行基线评估。
 *   2. 对参数子集进行一轮坐标下降（每个参数：
 *      尝试 ±step，保留最佳结果）。
 *   3. 剩余预算用于贪婪随机爬山：扰动
 *      当前最优点周围的 k 个随机参数子集，加入高斯噪声，
 *      只接受提升。停滞时步长衰减。
 *
 * 目标函数为相对观测
 * Köppen-Geiger 网格的 0.5·精确准确率 + 0.5·宏平均 F1（见 lib/score.mjs）。
 *
 * 用法：
 *   node tuning/climate/optimize.mjs                          # 高影响参数子集，150 次评估
 *   node tuning/climate/optimize.mjs --iters 400 --subset all
 *   node tuning/climate/optimize.mjs --subset TEMP_PEAK_C,PRECIP_MODEL_BLEND
 *   node tuning/climate/optimize.mjs --n 80000 --label run2 --rng 7
 *   node tuning/climate/optimize.mjs --resume tuning/results/climate/run1-best.json
 *
 * 输出：
 *   tuning/results/climate/<label>.jsonl       每次评估一行
 *   tuning/results/climate/<label>-best.json   当前最优参数 + 指标
 *
 * 用此命令把胜出参数应用到应用：node tuning/climate/apply-params.mjs <best.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';
import { PARAM_SPACE, HIGH_IMPACT_KEYS, repairParams } from './param-space.mjs';
import { buildEarthContext } from './lib/earth-context.mjs';
import { evaluateParams } from './lib/score.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'results', 'climate');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// 确定性随机数生成器，用于可复现的优化运行
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function gaussian(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function parseArgs(argv) {
    const args = { n: 40000, seed: 1234, iters: 150, subset: 'high', label: null, rng: 42, sigma: 0.12, k: 4, resume: null, mode: 'auto' };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--n') args.n = +argv[++i];
        else if (a === '--seed') args.seed = +argv[++i];
        else if (a === '--iters') args.iters = +argv[++i];
        else if (a === '--subset') args.subset = argv[++i];
        else if (a === '--label') args.label = argv[++i];
        else if (a === '--rng') args.rng = +argv[++i];
        else if (a === '--sigma') args.sigma = +argv[++i];
        else if (a === '--k') args.k = +argv[++i];
        else if (a === '--resume') args.resume = argv[++i];
        else if (a === '--mode') args.mode = argv[++i];
        else throw new Error(`未知参数：${a}`);
    }
    return args;
}

function resolveSubset(spec) {
    if (spec === 'high') return HIGH_IMPACT_KEYS;
    if (spec === 'all') return Object.keys(PARAM_SPACE);
    const keys = spec.split(',').map(s => s.trim()).filter(Boolean);
    for (const k of keys) {
        if (!(k in PARAM_SPACE)) throw new Error(`--subset 中存在未知参数：${k}`);
    }
    return keys;
}

async function main() {
    const args = parseArgs(process.argv);
    const keys = resolveSubset(args.subset);
    const label = args.label || `opt-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    const logPath = path.join(RESULTS_DIR, `${label}.jsonl`);
    const bestPath = path.join(RESULTS_DIR, `${label}-best.json`);
    const rand = mulberry32(args.rng);

    console.log(`正在优化 ${keys.length} 个参数，预算 ${args.iters} 次评估，模式=${args.mode}`);
    console.log(`正在构建地球上下文（N=${args.n}，种子=${args.seed}）…`);
    const ctx = buildEarthContext({ N: args.n, seed: args.seed });
    console.log(`  构建耗时 ${(ctx.buildMs / 1000).toFixed(1)} 秒，共 ${ctx.mesh.numRegions} 个区域`);

    let evals = 0;
    const log = (entry) => fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

    function evaluate(params, tag) {
        const { metrics } = evaluateParams(ctx, params);
        evals++;
        const { perClass, confusion, ...small } = metrics;
        log({ eval: evals, tag, params, ...small });
        return metrics;
    }

    // ── 当前最优 ──
    let best = args.resume
        ? { ...JSON.parse(fs.readFileSync(args.resume, 'utf8')).params }
        : {};
    repairParams(best);
    let bestMetrics = evaluate(best, 'baseline');
    const fmt = (m) => `分级 ${(m.gradedAcc * 100).toFixed(1)}%，精确 ${(m.exactAcc * 100).toFixed(1)}%，` +
                       `平衡 ${m.groupBalance.toFixed(3)}，关注 ${m.watchlistF1.toFixed(3)}`;
    console.log(`  基线目标分 ${bestMetrics.objective.toFixed(4)}（${fmt(bestMetrics)}，${bestMetrics.evalMs} 毫秒/评估）`);

    const saveBest = () => fs.writeFileSync(bestPath, JSON.stringify({
        label, n: args.n, seed: args.seed, evals,
        params: best,
        metrics: { objective: bestMetrics.objective, exactAcc: bestMetrics.exactAcc, majorAcc: bestMetrics.majorAcc, macroF1: bestMetrics.macroF1 },
        defaultsChanged: Object.fromEntries(Object.entries(best).filter(([k, v]) => v !== CLIMATE_DEFAULTS[k])),
    }, null, 2));
    saveBest();

    const val = (params, k) => params[k] ?? CLIMATE_DEFAULTS[k];
    const range = (k) => PARAM_SPACE[k].max - PARAM_SPACE[k].min;

    function tryCandidate(cand, tag) {
        repairParams(cand);
        const m = evaluate(cand, tag);
        if (m.objective > bestMetrics.objective) {
            best = cand;
            bestMetrics = m;
            saveBest();
            console.log(`  ↑ ${evals}: ${m.objective.toFixed(4)} (${fmt(m)}) 来自 ${tag}`);
            return true;
        }
        return false;
    }

    // ── 阶段 1：坐标遍历 ──
    if (args.mode === 'auto' || args.mode === 'coord') {
        console.log('\n阶段 1：坐标下降遍历');
        for (const k of keys) {
            if (evals + 2 > args.iters) break;
            const step = 0.15 * range(k);
            for (const dir of [+1, -1]) {
                const cand = { ...best, [k]: val(best, k) + dir * step };
                tryCandidate(cand, `coord:${k}${dir > 0 ? '+' : '-'}`);
            }
        }
    }

    // ── 阶段 2：随机爬山 ──
    if (args.mode === 'auto' || args.mode === 'explore') {
        console.log('\n阶段 2：随机爬山');
        let sigma = args.sigma;
        let sinceImprove = 0;
        while (evals < args.iters) {
            const cand = { ...best };
            const kCount = 1 + Math.floor(rand() * args.k);
            for (let j = 0; j < kCount; j++) {
                const k = keys[Math.floor(rand() * keys.length)];
                cand[k] = val(cand, k) + gaussian(rand) * sigma * range(k);
            }
            if (tryCandidate(cand, `explore:σ${sigma.toFixed(3)}`)) {
                sinceImprove = 0;
            } else if (++sinceImprove >= 25) {
                sigma = Math.max(0.03, sigma * 0.7);
                sinceImprove = 0;
                console.log(`  σ → ${sigma.toFixed(3)}`);
            }
        }
    }

    console.log(`\n完成。共 ${evals} 次评估。`);
    console.log(`最佳目标分：${bestMetrics.objective.toFixed(4)}（${fmt(bestMetrics)}）`);
    if (bestMetrics.groupFractions) {
        const gf = bestMetrics.groupFractions;
        console.log(`  干旱(B) ${(gf.B.sim * 100).toFixed(1)}% 对 ${(gf.B.truth * 100).toFixed(1)}% · ` +
                    `温带(C) ${(gf.C.sim * 100).toFixed(1)}% 对 ${(gf.C.truth * 100).toFixed(1)}% · ` +
                    `极地(E) ${(gf.E.sim * 100).toFixed(1)}% 对 ${(gf.E.truth * 100).toFixed(1)}%`);
    }
    const changed = Object.entries(best).filter(([k, v]) => v !== CLIMATE_DEFAULTS[k]);
    if (changed.length) {
        console.log('\n已变更参数（相对默认值）：');
        for (const [k, v] of changed) {
            console.log(`  ${k}: ${CLIMATE_DEFAULTS[k]} → ${+v.toFixed(4)}`);
        }
    } else {
        console.log('\n没有参数变更优于当前默认值。');
    }
    console.log(`\n最佳参数：${bestPath}`);
    console.log(`高分辨率验证：node tuning/climate/evaluate.mjs --params ${bestPath} --n 160000 --maps`);
    console.log(`应用到程序：  node tuning/climate/apply-params.mjs ${bestPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
