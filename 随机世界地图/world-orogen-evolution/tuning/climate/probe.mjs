/**
 * Parameter sensitivity probe. For each existing parameter that SHOULD address
 * a known systemic fault, swing it between low/high extremes and measure whether
 * the targeted metric actually moves. A near-zero response => the lever is inert
 * (a likely bug or a downstream cancellation) and warrants a code read.
 *
 * Usage: node tuning/climate/probe.mjs [--n 40000]
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';
import { KOPPEN_CLASSES } from '../../js/koppen.js';
import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';
import { NO_DATA } from './lib/ground-truth.mjs';

const N = process.argv.includes('--n') ? +process.argv[process.argv.indexOf('--n') + 1] : 40000;

const codeId = {};
KOPPEN_CLASSES.forEach((c, i) => { codeId[c.code] = i; });
const idsFor = (codes) => new Set(codes.map(c => codeId[c]));

const MED_IDS = idsFor(['Csa', 'Csb', 'Csc', 'Dsa', 'Dsb', 'Dsc']);
const MONSOON_IDS = idsFor(['Aw', 'Cwa', 'Cwb', 'Cwc', 'Dwa', 'Dwb', 'Dwc', 'Dwd']);

let CTX;

// ── metric library (operate on sim r_koppen + ctx) ──
function fracGroupInBand(ctx, r_koppen, group, laMin, laMax) {
    let n = 0, hit = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = Math.abs(ctx.r_lat[r] * 180 / Math.PI);
        if (la < laMin || la > laMax) continue;
        n++;
        if (majorGroupOf(r_koppen[r]) === group) hit++;
    }
    return n ? hit / n : 0;
}
function countIds(ctx, r_koppen, idSet) {
    let c = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (ctx.r_scored[r] && idSet.has(r_koppen[r])) c++;
    }
    return c;
}
function fracGroupInBox(ctx, r_koppen, group, laMin, laMax, loMin, loMax) {
    let n = 0, hit = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < laMin || la > laMax || lo < loMin || lo > loMax) continue;
        n++;
        if (majorGroupOf(r_koppen[r]) === group) hit++;
    }
    return n ? hit / n : 0;
}

const METRICS = {
    medCells: (ctx, k) => countIds(ctx, k, MED_IDS),
    monsoonCells: (ctx, k) => countIds(ctx, k, MONSOON_IDS),
    nIndiaDesertFrac: (ctx, k) => fracGroupInBox(ctx, k, 'B', 22, 31, 74, 88),
    contD_4560N: (ctx, k) => fracGroupInBox(ctx, k, 'D', 45, 60, -180, 180),
    desertB_3045: (ctx, k) => fracGroupInBand(ctx, k, 'B', 30, 45),
    tempC_4560N: (ctx, k) => fracGroupInBox(ctx, k, 'C', 45, 60, -180, 180),
};

// Truth reference values (compute once) for context
function truthMetric(name) {
    const fakeK = CTX.r_truth; // truth acts as the "koppen" field
    return METRICS[name](CTX, fakeK);
}

// ── experiments: param, low, high, metric, expectation ──
const EXPERIMENTS = [
    ['PRECIP_MONSOON_RELIEF_MAX', 0.0, 1.0, 'nIndiaDesertFrac', 'high → LESS desert in N.India'],
    ['HEUR_ITCZ_SHIFT_DAMPEN', 0.05, 0.7, 'monsoonCells', 'high → MORE monsoon cells'],
    ['PRECIP_SEASON_CONTRAST', 0.8, 2.5, 'medCells', 'high → MORE Mediterranean cells'],
    ['PRECIP_SEASON_CONTRAST', 0.8, 2.5, 'monsoonCells', 'high → MORE monsoon cells'],
    ['HEUR_MED_WESTCOAST_BONUS', 0.0, 0.4, 'medCells', 'high → MORE Mediterranean cells'],
    ['PRECIP_SUBTROP_PEAK_SUMMER', 0.3, 0.85, 'medCells', 'high → MORE Mediterranean (drier summers)'],
    ['KOPPEN_S_RATIO', 1.2, 3.5, 'medCells', 'high → MORE Mediterranean (looser s test)'],
    ['KOPPEN_S_SUMMER_MAX_MM', 30, 80, 'medCells', 'high → MORE Mediterranean (looser s test)'],
    ['TEMP_SWING_SCALE', 0.6, 1.5, 'contD_4560N', 'high → MORE continental D at 45-60N'],
    ['TEMP_EXTRA_SWING_FACTOR', 0.25, 1.0, 'contD_4560N', 'high → MORE continental D at 45-60N'],
    ['TEMP_SWING_WINTER_SHARE', 0.4, 0.75, 'contD_4560N', 'high → MORE continental D (colder winters)'],
    ['PRECIP_SUBTROP_PEAK_SUMMER', 0.3, 0.85, 'desertB_3045', 'high → MORE desert at 30-45'],
];

async function main() {
    console.log(`Building Earth context (N=${N})…`);
    CTX = buildEarthContext({ N });

    // Baseline (current applied defaults)
    const base = runClimate(CTX, {});
    console.log(`\nBaseline metrics (current defaults) vs truth:`);
    for (const m of ['medCells', 'monsoonCells', 'contD_4560N', 'desertB_3045', 'nIndiaDesertFrac', 'tempC_4560N']) {
        const sim = METRICS[m](CTX, base.r_koppen);
        const tru = truthMetric(m);
        const fmt = (v) => (v > 1 ? v.toFixed(0) : (v * 100).toFixed(1) + '%');
        console.log(`  ${m.padEnd(18)} sim ${String(fmt(sim)).padStart(7)}   truth ${String(fmt(tru)).padStart(7)}`);
    }

    console.log(`\n=== Sensitivity: swing each lever low→high, measure target metric ===`);
    console.log(`param                         metric            default   low → high            verdict`);
    for (const [param, lo, hi, metric, expect] of EXPERIMENTS) {
        const def = CLIMATE_DEFAULTS[param];
        const kLo = runClimate(CTX, { [param]: lo }).r_koppen;
        const kHi = runClimate(CTX, { [param]: hi }).r_koppen;
        const vLo = METRICS[metric](CTX, kLo);
        const vHi = METRICS[metric](CTX, kHi);
        const isCount = vLo > 1 || vHi > 1;
        const fmt = (v) => isCount ? v.toFixed(0) : (v * 100).toFixed(1) + '%';
        const rel = isCount
            ? (Math.max(vLo, vHi) > 0 ? Math.abs(vHi - vLo) / Math.max(vLo, vHi, 1) : 0)
            : Math.abs(vHi - vLo);
        const inert = isCount ? (Math.abs(vHi - vLo) < 3 && rel < 0.1) : (rel < 0.02);
        const verdict = inert ? 'INERT ⚠' : 'responds';
        console.log(`${param.padEnd(30)}${metric.padEnd(17)} ${String(def).padStart(6)}   ${String(fmt(vLo)).padStart(7)} → ${String(fmt(vHi)).padStart(7)}    ${verdict}   (${expect})`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
