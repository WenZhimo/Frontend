/** Does the east-coast aridity discount fix S.China/Florida while sparing Sahara? */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';

const ctx = buildEarthContext({ N: 40000 });
function aridFrac(ov, box) {
    const { r_koppen } = runClimate(ctx, ov);
    let n = 0, b = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < box[0] || la > box[1] || lo < box[2] || lo > box[3]) continue;
        n++; if (majorGroupOf(r_koppen[r]) === 'B') b++;
    }
    return n ? b / n : NaN;
}
const R = { 'S.China(want 0)': [22, 31, 105, 120], 'Florida(want 0)': [27, 35, -88, -80],
    'Sahara(want 100)': [19, 28, -4, 28], 'N.India(hard)': [22, 31, 74, 88] };
console.log('arid fraction vs KOPPEN_EAST_COAST_WET (selective east-coast discount)');
console.log('region             wet0     wet1.5    wet2.5');
for (const [nm, box] of Object.entries(R)) {
    const a = aridFrac({}, box), b = aridFrac({ KOPPEN_EAST_COAST_WET: 1.5 }, box), c = aridFrac({ KOPPEN_EAST_COAST_WET: 2.5 }, box);
    console.log(`${nm.padEnd(18)} ${(a * 100).toFixed(0).padStart(4)}%   ${(b * 100).toFixed(0).padStart(5)}%   ${(c * 100).toFixed(0).padStart(5)}%`);
}
