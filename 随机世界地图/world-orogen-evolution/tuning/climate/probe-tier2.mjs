/**
 * Tier 2 wiring + rain-shadow investigation.
 * - Confirms the monsoon source (PRECIP_MONSOON_ADD) wets N.India/S.China/Florida.
 * - Confirms warm-current boost wets east coasts.
 * - Tests whether the EXISTING rain-shadow levers can dry Patagonia (if not, the
 *   shadow is inert there and needs the asymmetric-wind fix, not tuning).
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';

const ctx = buildEarthContext({ N: 40000 });

function meanPrecip(overrides, box) {
    const { precipResult } = runClimate(ctx, overrides);
    const ps = precipResult.r_precip_summer, pw = precipResult.r_precip_winter;
    let n = 0, s = 0, w = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < box[0] || la > box[1] || lo < box[2] || lo > box[3]) continue;
        n++; s += ps[r]; w += pw[r];
    }
    return { n, annual: (s + w) / n, summer: s / n, winter: w / n };
}
function aridFrac(overrides, box) {
    const { r_koppen } = runClimate(ctx, overrides);
    let n = 0, b = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = ctx.r_lat[r] * 180 / Math.PI, lo = ctx.r_lon[r] * 180 / Math.PI;
        if (la < box[0] || la > box[1] || lo < box[2] || lo > box[3]) continue;
        n++; if (majorGroupOf(r_koppen[r]) === 'B') b++;
    }
    return b / n;
}

const NIND = [22, 31, 74, 88], SCHINA = [22, 31, 105, 120], FLA = [27, 35, -88, -80], PATA = [-50, -38, -72, -64];

console.log('季风水汽源：平均降水（夏季 / 冬季 / 年度）');
for (const [nm, box] of [['N.India', NIND], ['S.China', SCHINA], ['Florida', FLA]]) {
    const off = meanPrecip({}, box), on = meanPrecip({ PRECIP_MONSOON_ADD: 0.5 }, box);
    console.log(`  ${nm.padEnd(9)} 关 ${off.summer.toFixed(2)}/${off.winter.toFixed(2)}/${off.annual.toFixed(2)}   ->  开 ${on.summer.toFixed(2)}/${on.winter.toFixed(2)}/${on.annual.toFixed(2)}`);
}
console.log('\n暖流增强：东海岸年度降水');
for (const [nm, box] of [['S.China', SCHINA], ['Florida', FLA]]) {
    const off = meanPrecip({}, box).annual, on = meanPrecip({ PRECIP_WARM_CURRENT_BOOST: 1.2 }, box).annual;
    console.log(`  ${nm.padEnd(9)} 关 ${off.toFixed(3)}  ->  开 ${on.toFixed(3)}`);
}
console.log('\n雨影：更强雨影下巴塔哥尼亚干旱占比（真实 ≈ 56% BSk，即干旱）');
console.log(`  基线                       ${(aridFrac({}, PATA) * 100).toFixed(1)}%`);
console.log(`  RS_APPLY_MAX_SUPPRESS 0.98     ${(aridFrac({ PRECIP_RS_APPLY_MAX_SUPPRESS: 0.98, PRECIP_RS_APPLY_STRENGTH_SCALE: 4 }, PATA) * 100).toFixed(1)}%`);
console.log(`  RS 传播 4000km + 强度 4    ${(aridFrac({ PRECIP_RS_SHADOW_PROP_KM: 4000, PRECIP_RS_APPLY_STRENGTH_SCALE: 4, PRECIP_RS_APPLY_MAX_SUPPRESS: 0.98 }, PATA) * 100).toFixed(1)}%`);
console.log(`  + 大陆性干化 0.8             ${(aridFrac({ PRECIP_RS_APPLY_MAX_SUPPRESS: 0.98, PRECIP_RS_APPLY_STRENGTH_SCALE: 4, PRECIP_CONT_DRYNESS: 0.8 }, PATA) * 100).toFixed(1)}%`);
