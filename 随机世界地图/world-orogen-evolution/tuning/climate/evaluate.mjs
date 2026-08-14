/**
 * Evaluate the climate simulation against real-Earth Köppen zones.
 *
 * Runs the app's heightmap-import pipeline on assets/earth.png in Node
 * (no browser), classifies Köppen climate zones, and scores them against
 * the observed Köppen-Geiger grid (Kottek et al., 1976-2000).
 *
 * Usage:
 *   node tuning/climate/evaluate.mjs                       # baseline (current defaults)
 *   node tuning/climate/evaluate.mjs --params best.json    # evaluate tuned params
 *   node tuning/climate/evaluate.mjs --maps                # also write PNG comparison maps
 *   node tuning/climate/evaluate.mjs --n 80000 --seed 7    # mesh resolution / seed
 *   node tuning/climate/evaluate.mjs --label my-run        # results file name
 *
 * Output: tuning/results/climate/<label>.json (+ maps in tuning/climate/maps/)
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
        else throw new Error(`Unknown arg: ${a}`);
    }
    return args;
}

function pct(x) { return (x * 100).toFixed(2) + '%'; }

export function printReport(metrics, maskStats) {
    console.log('\n=== Köppen match vs real Earth ===');
    console.log(`  objective:      ${metrics.objective.toFixed(4)}   (.60 graded[convex] + .12 macroF1 + .15 balance + .13 watchlist)`);
    console.log(`  graded acc:     ${pct(metrics.gradedAcc)}   (climatic-distance-weighted, ${metrics.scored} cells)`);
    console.log(`  exact accuracy: ${pct(metrics.exactAcc)}`);
    console.log(`  major-group:    ${pct(metrics.majorAcc)}   (A/B/C/D/E)`);
    console.log(`  macro F1:       ${metrics.macroF1.toFixed(4)}`);
    console.log(`  group balance:  ${metrics.groupBalance.toFixed(4)}   watchlist F1: ${metrics.watchlistF1.toFixed(4)}`);
    if (metrics.groupFractions) {
        console.log('  group area (sim vs truth):');
        for (const g of ['A', 'B', 'C', 'D', 'E']) {
            const f = metrics.groupFractions[g];
            const tag = { A: 'tropical', B: 'arid', C: 'temperate', D: 'continental', E: 'polar' }[g];
            const arrow = f.sim > f.truth * 1.1 ? ' ← too much' : (f.sim < f.truth * 0.9 ? ' ← too little' : '');
            console.log(`    ${g} ${tag.padEnd(12)} ${pct(f.sim).padStart(7)} vs ${pct(f.truth).padStart(7)}${arrow}`);
        }
    }
    if (maskStats) {
        console.log(`  land masks:     sim ${pct(maskStats.simLandFrac)}, truth ${pct(maskStats.truthLandFrac)}, ` +
                    `agreement ${pct(maskStats.landAgreement)} of sim land scored`);
    }
    console.log('\n  Per-class (truth support ≥ 50):');
    console.log('  class   support   precision  recall   F1');
    for (const c of metrics.perClass.filter(c => c.support >= 50).sort((a, b) => b.support - a.support)) {
        console.log(`  ${c.code.padEnd(7)} ${String(c.support).padStart(7)}   ${c.precision.toFixed(3).padStart(8)}  ${c.recall.toFixed(3).padStart(6)}  ${c.f1.toFixed(3).padStart(5)}`);
    }
    console.log('\n  Top confusions (truth → sim):');
    for (const p of topConfusions(metrics.confusion, 12)) {
        console.log(`    ${p.truth.padEnd(4)} → ${p.sim.padEnd(4)}  ${p.count}`);
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const overrides = args.params ? JSON.parse(fs.readFileSync(args.params, 'utf8')).params ?? JSON.parse(fs.readFileSync(args.params, 'utf8')) : {};

    console.log(`Building Earth context (N=${args.n}, seed=${args.seed})…`);
    const ctx = buildEarthContext({ N: args.n, seed: args.seed });
    console.log(`  built in ${(ctx.buildMs / 1000).toFixed(1)}s — ${ctx.mesh.numRegions} regions, ` +
                `${(ctx.maskStats.scoredFrac * 100).toFixed(1)}% scored`);

    console.log('Running climate simulation…');
    const { metrics, r_koppen } = evaluateParams(ctx, overrides);
    console.log(`  climate + scoring in ${(metrics.evalMs / 1000).toFixed(1)}s`);

    printReport(metrics, ctx.maskStats);

    if (args.maps) {
        const prefix = args.label || 'koppen';
        const { simPath, truthPath, diffPath } = renderMaps(ctx, r_koppen, MAPS_DIR, prefix);
        console.log(`\nMaps written:\n  ${simPath}\n  ${truthPath}\n  ${diffPath}`);
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
    console.log(`\nResult saved: ${outPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
