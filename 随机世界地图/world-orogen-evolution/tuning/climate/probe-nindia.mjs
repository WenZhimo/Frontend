/**
 * Root-cause probe for the inert monsoon-relief lever.
 * Measures, over the North India box, the mean SUMMER/WINTER precip and the
 * mean poleward (onshore) summer wind under several overrides — to tell whether
 * the relief is inert because (a) the wind is not poleward so the code path is
 * never taken, or (b) moisture never reaches the region so there is nothing to
 * relieve.
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';

const BOX = [22, 31, 74, 88]; // laMin,laMax,loMin,loMax
const ctx = buildEarthContext({ N: 40000 });

function boxStats(overrides) {
    const { precipResult, windResult } = runClimate(ctx, overrides);
    const ps = precipResult.r_precip_summer, pw = precipResult.r_precip_winter;
    const wn = windResult.r_wind_north_summer;
    let n = 0, sumPs = 0, sumPw = 0, sumPole = 0, polewardCells = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < BOX[0] || la > BOX[1] || lo < BOX[2] || lo > BOX[3]) continue;
        n++;
        sumPs += ps[r]; sumPw += pw[r];
        const poleward = la >= 0 ? wn[r] : -wn[r]; // onshore-from-equator component
        sumPole += poleward;
        if (poleward > 0) polewardCells++;
    }
    return {
        n,
        precipSummer: sumPs / n,
        precipWinter: sumPw / n,
        meanPoleward: sumPole / n,
        polewardFrac: polewardCells / n,
    };
}

const cases = [
    ['baseline (applied defaults)', {}],
    ['monsoon relief = 0', { PRECIP_MONSOON_RELIEF_MAX: 0 }],
    ['monsoon relief = 1', { PRECIP_MONSOON_RELIEF_MAX: 1 }],
    ['advect reach 4000km', { PRECIP_ADVECT_REACH_KM: 4000 }],
    ['coast cutoff 4500km', { PRECIP_COAST_CUTOFF_START_KM: 4200, PRECIP_COAST_CUTOFF_END_KM: 4500 }],
    ['ITCZ shift 0.7 + reach 4000', { HEUR_ITCZ_SHIFT_DAMPEN: 0.7, PRECIP_ADVECT_REACH_KM: 4000 }],
    ['elev depletion 0.2', { PRECIP_ELEV_DEPLETION_PER_KM: 0.2 }],
];

console.log('North India box — mean normalized precip & onshore summer wind\n');
console.log('case                          n    P.summer  P.winter  meanPoleward  poleward%');
for (const [name, ov] of cases) {
    const s = boxStats(ov);
    console.log(
        `${name.padEnd(28)} ${String(s.n).padStart(3)}   ${s.precipSummer.toFixed(3).padStart(7)}  ${s.precipWinter.toFixed(3).padStart(7)}   ${s.meanPoleward.toFixed(3).padStart(9)}    ${(s.polewardFrac * 100).toFixed(0).padStart(3)}%`
    );
}
