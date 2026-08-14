/**
 * Wiring check for the Tier 0/1 changes: confirm each new lever is (a) a no-op
 * at its neutral default and (b) moves its intended metric when engaged.
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';
import { KOPPEN_CLASSES } from '../../js/koppen.js';

const ctx = buildEarthContext({ N: 40000 });
const codeId = {}; KOPPEN_CLASSES.forEach((c, i) => codeId[c.code] = i);
const MED = new Set(['Csa', 'Csb', 'Csc', 'Dsa', 'Dsb', 'Dsc'].map(c => codeId[c]));

function metrics(ov) {
    const { r_koppen } = runClimate(ctx, ov);
    let n = 0, b3045 = 0, d4560 = 0, n4560 = 0, med = 0, cal = 0, nCal = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, alat = Math.abs(la), lo = ctx.r_lon[r] * 180 / Math.PI;
        n++;
        if (alat >= 30 && alat <= 45 && majorGroupOf(r_koppen[r]) === 'B') b3045++;
        if (la >= 45 && la <= 60) { n4560++; if (majorGroupOf(r_koppen[r]) === 'D') d4560++; }
        if (MED.has(r_koppen[r])) med++;
        // California/US west box for cold-current check (34-44N, -124..-118)
        if (la >= 34 && la <= 44 && lo >= -124 && lo <= -118) { nCal++; if (majorGroupOf(r_koppen[r]) === 'B') cal++; }
    }
    return {
        desertB3045: b3045 / countBand(30, 45),
        contD4560: n4560 ? d4560 / n4560 : 0,
        medCells: med,
    };
}
function countBand(a, b) {
    let n = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const alat = Math.abs(ctx.r_lat[r] * 180 / Math.PI);
        if (alat >= a && alat <= b) n++;
    }
    return n;
}

const cases = [
    ['NEUTRAL (all new params off)', {}],
    ['KOPPEN_ARIDITY_SCALE 1.7', { KOPPEN_ARIDITY_SCALE: 1.7 }],
    ['TEMP_CONT_WINTER_COOL_C 12', { TEMP_CONT_WINTER_COOL_C: 12 }],
    ['PRECIP_COLD_CURRENT_SUPPRESS 0.8', { PRECIP_COLD_CURRENT_SUPPRESS: 0.8 }],
    ['PRECIP_WARM_CURRENT_BOOST 0.8', { PRECIP_WARM_CURRENT_BOOST: 0.8 }],
];

console.log('lever                              desertB_3045  contD_4560N  medCells');
console.log('(truth)                                  39.7%        76.0%       446');
for (const [name, ov] of cases) {
    const m = metrics(ov);
    console.log(`${name.padEnd(34)} ${(m.desertB3045 * 100).toFixed(1).padStart(7)}%    ${(m.contD4560 * 100).toFixed(1).padStart(6)}%    ${String(m.medCells).padStart(6)}`);
}
