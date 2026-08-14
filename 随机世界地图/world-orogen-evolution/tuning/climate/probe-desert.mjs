/**
 * Which lever actually controls the subtropical desert glut (B at 30-45°)?
 * The subtropical-suppression peak barely moved it, so the excess desert must
 * come from another driver. Swing the candidate drivers and measure.
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { majorGroupOf } from './lib/koppen-distance.mjs';

const ctx = buildEarthContext({ N: 40000 });

function desertFrac(overrides) {
    const { r_koppen } = runClimate(ctx, overrides);
    let n = 0, b = 0;
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (!ctx.r_scored[r]) continue;
        const la = Math.abs(ctx.r_lat[r] * 180 / Math.PI);
        if (la < 30 || la > 45) continue;
        n++;
        if (majorGroupOf(r_koppen[r]) === 'B') b++;
    }
    return b / n;
}

const cases = [
    ['baseline', {}],
    ['CONT_DRYNESS 0.3 (complex)', { PRECIP_CONT_DRYNESS: 0.3 }],
    ['HEUR_CONT_DRYNESS 0.4', { HEUR_CONT_DRYNESS: 0.4 }],
    ['both cont dryness low', { PRECIP_CONT_DRYNESS: 0.3, HEUR_CONT_DRYNESS: 0.4 }],
    ['CONT_CAP_MAX_REDUCTION 0.6', { PRECIP_CONT_CAP_MAX_REDUCTION: 0.6 }],
    ['coast cutoff 3500km', { PRECIP_COAST_CUTOFF_START_KM: 3200, PRECIP_COAST_CUTOFF_END_KM: 3500 }],
    ['HEUR_ZONAL_DESERT_MIN 0.1', { HEUR_ZONAL_DESERT_MIN: 0.1 }],
    ['ZONAL_TRADE_VALUE 0.5', { HEUR_ZONAL_TRADE_VALUE: 0.5 }],
    ['KOPPEN_PRECIP_SCALE 1400mm', { KOPPEN_PRECIP_SCALE_MM: 1400 }],
];

console.log('Desert (B) fraction at 30-45° latitude (truth ≈ 39.7%)\n');
console.log('case                            desertB_3045');
for (const [name, ov] of cases) {
    console.log(`${name.padEnd(32)} ${(desertFrac(ov) * 100).toFixed(1)}%`);
}
