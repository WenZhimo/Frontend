/**
 * 对照真实地球柯本气候区评估气候模拟。
 *
 * 在 Node 中对 assets/earth.png 运行应用的高度图导入管线，
 * （无需浏览器）分类柯本气候区，并将其评分对照
 * 观测到的 Köppen-Geiger 网格（Kottek 等，1976-2000）。
 *
 * 用法：
 *   node tuning/climate/evaluate.mjs                       # 基线（当前默认值）
 *   node tuning/climate/evaluate.mjs --params best.json    # 评估调校参数
 *   node tuning/climate/evaluate.mjs --maps                # 同时写出 PNG 对比地图
 *   node tuning/climate/evaluate.mjs --n 80000 --seed 7    # 网格分辨率 / 种子
 *   node tuning/climate/evaluate.mjs --label my-run        # 结果文件名
 *
 * 输出：tuning/results/climate/<label>.json（以及 tuning/climate/maps/ 中的地图）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEarthContext } from './lib/earth-context.mjs';
import { evaluateParams, topConfusions } from './lib/score.mjs';
import { renderMaps } from './lib/render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'results', 'climate');
const MAPS_DIR = path.join(__dirname, 'maps');

function parseArgs(argv) {
    const args = { n: 40000, seed: 1234, params: null, maps: false, label: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--n') args.n = +argv[++i];
        else if (a === '--seed') args.seed = +argv[++i];
        else if (a === '--params') args.params = argv[++i];
        else if (a === '--maps') args.maps = true;
        else if (a === '--label') args.label = argv[++i];
        else throw new Error(`未知参数：${a}`);
    }
    return args;
}

function pct(x) { return (x * 100).toFixed(2) + '%'; }

export function printReport(metrics, maskStats) {
    console.log('\n=== 柯本分类对照真实地球 ===');
    console.log(`  目标分：      ${metrics.objective.toFixed(4)}   （.60 分级准确率[凸权重] + .12 宏平均 F1 + .15 大类平衡 + .13 关注项）`);
    console.log(`  分级准确率：     ${pct(metrics.gradedAcc)}   （气候距离加权，${metrics.scored} 个单元）`);
    console.log(`  精确准确率： ${pct(metrics.exactAcc)}`);
    console.log(`  大类匹配：    ${pct(metrics.majorAcc)}   (A/B/C/D/E)`);
    console.log(`  宏平均 F1：       ${metrics.macroF1.toFixed(4)}`);
    console.log(`  大类平衡：  ${metrics.groupBalance.toFixed(4)}   关注项 F1： ${metrics.watchlistF1.toFixed(4)}`);
    if (metrics.groupFractions) {
        console.log('  大类面积（模拟 vs 真实）：');
        for (const g of ['A', 'B', 'C', 'D', 'E']) {
            const f = metrics.groupFractions[g];
            const tag = { A: '热带', B: '干旱', C: '温带', D: '大陆性', E: '极地' }[g];
            const arrow = f.sim > f.truth * 1.1 ? ' ← 过多' : (f.sim < f.truth * 0.9 ? ' ← 过少' : '');
            console.log(`    ${g} ${tag.padEnd(12)} ${pct(f.sim).padStart(7)} 对 ${pct(f.truth).padStart(7)}${arrow}`);
        }
    }
    if (maskStats) {
        console.log(`  陆地掩膜：     模拟 ${pct(maskStats.simLandFrac)}，真实 ${pct(maskStats.truthLandFrac)}，` +
                    `一致 ${pct(maskStats.landAgreement)} 模拟陆地参与评分`);
    }
    console.log('\n  单类指标（真实样本 ≥ 50）：');
    console.log('  类别    样本数    精确率     召回率   F1');
    for (const c of metrics.perClass.filter(c => c.support >= 50).sort((a, b) => b.support - a.support)) {
        console.log(`  ${c.code.padEnd(7)} ${String(c.support).padStart(7)}   ${c.precision.toFixed(3).padStart(8)}  ${c.recall.toFixed(3).padStart(6)}  ${c.f1.toFixed(3).padStart(5)}`);
    }
    console.log('\n  主要混淆（真实 → 模拟）：');
    for (const p of topConfusions(metrics.confusion, 12)) {
        console.log(`    ${p.truth.padEnd(4)} → ${p.sim.padEnd(4)}  ${p.count}`);
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const overrides = args.params ? JSON.parse(fs.readFileSync(args.params, 'utf8')).params ?? JSON.parse(fs.readFileSync(args.params, 'utf8')) : {};

    console.log(`正在构建地球上下文（N=${args.n}，种子=${args.seed}）…`);
    const ctx = buildEarthContext({ N: args.n, seed: args.seed });
    console.log(`  构建耗时 ${(ctx.buildMs / 1000).toFixed(1)} 秒，共 ${ctx.mesh.numRegions} 个区域， ` +
                `${(ctx.maskStats.scoredFrac * 100).toFixed(1)}% 已评分`);

    console.log('正在运行气候模拟…');
    const { metrics, r_koppen } = evaluateParams(ctx, overrides);
    console.log(`  气候计算 + 评分耗时 ${(metrics.evalMs / 1000).toFixed(1)} 秒`);

    printReport(metrics, ctx.maskStats);

    if (args.maps) {
        const prefix = args.label || 'koppen';
        const { simPath, truthPath, diffPath } = renderMaps(ctx, r_koppen, MAPS_DIR, prefix);
        console.log(`\n地图已写入：\n  ${simPath}\n  ${truthPath}\n  ${diffPath}`);
    }

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const label = args.label || (args.params ? 'tuned' : 'baseline');
    const outPath = path.join(RESULTS_DIR, `${label}.json`);
    const { confusion, ...metricsNoConfusion } = metrics;
    fs.writeFileSync(outPath, JSON.stringify({
        label,
        n: args.n, seed: args.seed,
        paramsFile: args.params,
        overrides,
        maskStats: ctx.maskStats,
        metrics: metricsNoConfusion,
        topConfusions: topConfusions(confusion, 20),
    }, null, 2));
    console.log(`\n结果已保存：${outPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
