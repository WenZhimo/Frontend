/**
 * Verify the west/east field: (1) it classifies the right coasts, (2) the two
 * relief levers are neutral at 0 and move their targets when engaged.
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';
import { KOPPEN_CLASSES } from '../../js/koppen.js';

const ctx = buildEarthContext({ N: 40000 });
const codeId = {}; KOPPEN_CLASSES.forEach((c, i) => codeId[c.code] = i);

function meanWestness(box) {
    const { windResult } = runClimate(ctx, {});
    const wn = windResult.r_westness;
    let s = 0, n = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < box[0] || la > box[1] || lo < box[2] || lo > box[3]) continue;
        s += wn[r]; n++;
    }
    return n ? s / n : NaN;
}
function aridFrac(ov, box) {
    const { r_koppen } = runClimate(ctx, ov);
    let n = 0, b = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < box[0] || la > box[1] || lo < box[2] || lo > box[3]) continue;
        n++; if (majorGroupOf(r_koppen[r]) === 'B') b++;
    }
    return b / n;
}
function contDFrac(ov) {   // continental D at 45-60N
    const { r_koppen } = runClimate(ctx, ov);
    let n = 0, d = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI;
        if (la < 45 || la > 60) continue;
        n++; if (majorGroupOf(r_koppen[r]) === 'D') d++;
    }
    return d / n;
}

const SCHINA = [22, 31, 105, 120], FLA = [27, 35, -88, -80], WEUR = [44, 60, -8, 18], USWEST = [38, 50, -124, -118];

console.log('WESTNESS by region (want: west coasts +, east coasts −)');
for (const [nm, box] of [['S.China (E)', SCHINA], ['Florida (E)', FLA], ['W.Europe (W)', WEUR], ['US West (W)', USWEST]]) {
    console.log(`  ${nm.padEnd(13)} ${meanWestness(box).toFixed(2)}`);
}
console.log('\nSUBTROP_EAST_RELIEF — arid fraction on east coasts (want: drops as relief rises)');
for (const [nm, box] of [['S.China', SCHINA], ['Florida', FLA]]) {
    const off = aridFrac({}, box), on = aridFrac({ PRECIP_SUBTROP_EAST_RELIEF: 0.9 }, box);
    console.log(`  ${nm.padEnd(9)} relief0 ${(off * 100).toFixed(0)}%  ->  relief0.9 ${(on * 100).toFixed(0)}%`);
}
console.log('\nWINTER_COOL_WEST_RELIEF — continental D at 45-60N (want: drops, west coasts stay oceanic)');
console.log(`  relief0    ${(contDFrac({}) * 100).toFixed(1)}%`);
console.log(`  relief0.9  ${(contDFrac({ TEMP_WINTER_COOL_WEST_RELIEF: 0.9 }) * 100).toFixed(1)}%`);
