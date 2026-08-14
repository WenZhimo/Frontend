/**
 * Automated climate parameter tuning against real-Earth Köppen zones.
 *
 * Strategy (mode auto):
 *   1. Baseline evaluation with current defaults.
 *   2. One coordinate-descent pass over the parameter subset (each param:
 *      try ±step, keep the best).
 *   3. Greedy stochastic hill-climbing for the remaining budget: perturb a
 *      random subset of k parameters with Gaussian noise around the incumbent,
 *      accept only improvements. Step size decays when progress stalls.
 *
 * The objective is 0.5·exactAccuracy + 0.5·macroF1 vs the observed
 * Köppen-Geiger grid (see lib/score.mjs).
 *
 * Usage:
 *   node tuning/climate/optimize.mjs                          # high-impact subset, 150 evals
 *   node tuning/climate/optimize.mjs --iters 400 --subset all
 *   node tuning/climate/optimize.mjs --subset TEMP_PEAK_C,PRECIP_MODEL_BLEND
 *   node tuning/climate/optimize.mjs --n 80000 --label run2 --rng 7
 *   node tuning/climate/optimize.mjs --resume tuning/results/climate/run1-best.json
 *
 * Output:
 *   tuning/results/climate/<label>.jsonl       one line per evaluation
 *   tuning/results/climate/<label>-best.json   incumbent params + metrics
 *
 * Apply the winner to the app with: node tuning/climate/apply-params.mjs <best.json>
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

// Deterministic RNG for reproducible optimization runs
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
        else throw new Error(`Unknown arg: ${a}`);
    }
    return args;
}

function resolveSubset(spec) {
    if (spec === 'high') return HIGH_IMPACT_KEYS;
    if (spec === 'all') return Object.keys(PARAM_SPACE);
    const keys = spec.split(',').map(s => s.trim()).filter(Boolean);
    for (const k of keys) {
        if (!(k in PARAM_SPACE)) throw new Error(`Unknown param in --subset: ${k}`);
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

    console.log(`Optimizing ${keys.length} params, budget ${args.iters} evals, mode=${args.mode}`);
    console.log(`Building Earth context (N=${args.n}, seed=${args.seed})…`);
    const ctx = buildEarthContext({ N: args.n, seed: args.seed });
    console.log(`  built in ${(ctx.buildMs / 1000).toFixed(1)}s — ${ctx.mesh.numRegions} regions`);

    let evals = 0;
    const log = (entry) => fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');

    function evaluate(params, tag) {
        const { metrics } = evaluateParams(ctx, params);
        evals++;
        const { perClass, confusion, ...small } = metrics;
        log({ eval: evals, tag, params, ...small });
        return metrics;
    }

    // ── Incumbent ──
    let best = args.resume
        ? { ...JSON.parse(fs.readFileSync(args.resume, 'utf8')).params }
        : {};
    repairParams(best);
    let bestMetrics = evaluate(best, 'baseline');
    const fmt = (m) => `graded ${(m.gradedAcc * 100).toFixed(1)}%, exact ${(m.exactAcc * 100).toFixed(1)}%, ` +
                       `bal ${m.groupBalance.toFixed(3)}, watch ${m.watchlistF1.toFixed(3)}`;
    console.log(`  baseline objective ${bestMetrics.objective.toFixed(4)} (${fmt(bestMetrics)}, ${bestMetrics.evalMs}ms/eval)`);

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
            console.log(`  ↑ ${evals}: ${m.objective.toFixed(4)} (${fmt(m)}) via ${tag}`);
            return true;
        }
        return false;
    }

    // ── Phase 1: coordinate pass ──
    if (args.mode === 'auto' || args.mode === 'coord') {
        console.log('\nPhase 1: coordinate descent pass');
        for (const k of keys) {
            if (evals + 2 > args.iters) break;
            const step = 0.15 * range(k);
            for (const dir of [+1, -1]) {
                const cand = { ...best, [k]: val(best, k) + dir * step };
                tryCandidate(cand, `coord:${k}${dir > 0 ? '+' : '-'}`);
            }
        }
    }

    // ── Phase 2: stochastic hill-climb ──
    if (args.mode === 'auto' || args.mode === 'explore') {
        console.log('\nPhase 2: stochastic hill-climbing');
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

    console.log(`\nDone. ${evals} evaluations.`);
    console.log(`Best objective: ${bestMetrics.objective.toFixed(4)} (${fmt(bestMetrics)})`);
    if (bestMetrics.groupFractions) {
        const gf = bestMetrics.groupFractions;
        console.log(`  arid(B) ${(gf.B.sim * 100).toFixed(1)}% vs ${(gf.B.truth * 100).toFixed(1)}% · ` +
                    `temperate(C) ${(gf.C.sim * 100).toFixed(1)}% vs ${(gf.C.truth * 100).toFixed(1)}% · ` +
                    `polar(E) ${(gf.E.sim * 100).toFixed(1)}% vs ${(gf.E.truth * 100).toFixed(1)}%`);
    }
    const changed = Object.entries(best).filter(([k, v]) => v !== CLIMATE_DEFAULTS[k]);
    if (changed.length) {
        console.log('\nChanged params (vs defaults):');
        for (const [k, v] of changed) {
            console.log(`  ${k}: ${CLIMATE_DEFAULTS[k]} → ${+v.toFixed(4)}`);
        }
    } else {
        console.log('\nNo parameter change beat the current defaults.');
    }
    console.log(`\nBest params: ${bestPath}`);
    console.log(`Validate at higher resolution:  node tuning/climate/evaluate.mjs --params ${bestPath} --n 160000 --maps`);
    console.log(`Apply to the app:               node tuning/climate/apply-params.mjs ${bestPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
