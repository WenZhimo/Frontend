/**
 * Climatic distance between Köppen classes, so misclassification cost scales
 * with how wrong the guess is: calling rainforest a desert is a large loss,
 * calling it a monsoon climate is a small one.
 *
 * Each class gets a 3-axis feature vector:
 *   warmth      0 (ice cap) … 6 (tropical)        — thermal band
 *   moisture    0 (desert)  … 4 (rainforest)      — aridity / wetness
 *   seasonality 0 (no dry season) … 2 (strong s/w) — precip seasonality
 *
 * Distance is weighted Euclidean; moisture is weighted highest because
 * wet↔dry errors are the most visually and ecologically wrong. Similarity
 * is 1 at an exact match, decaying to 0 at REF_DIST and beyond.
 */

import { KOPPEN_CLASSES } from '../../../js/koppen.js';

const WARMTH_W = 1.0;
const MOIST_W = 2.0;   // moisture-axis errors (wet→dry: rainforest→savanna, humid→steppe) hurt most
const SEAS_W = 0.5;
export const REF_DIST = 4.5;   // distance at which partial credit reaches 0
// Convex cost exponent: cost = (dist/REF)^COST_EXP, similarity = 1 − cost.
// >1 makes large errors dominate, but too high over-forgives moderate errors
// (the drying faults the user cares about), so keep it mild.
export const COST_EXP = 1.6;

// [warmth, moisture, seasonality] per Köppen code
const FEATURES = {
    Af: [6.0, 4.0, 0.0], Am: [6.0, 3.2, 1.0], Aw: [6.0, 2.2, 2.0],
    BWh: [5.0, 0.0, 1.0], BWk: [3.0, 0.0, 1.0], BSh: [5.0, 1.2, 1.5], BSk: [3.0, 1.2, 1.5],
    Cfa: [4.6, 3.0, 0.0], Cfb: [4.0, 3.0, 0.0], Cfc: [3.3, 3.0, 0.0],
    Csa: [4.6, 2.0, 2.0], Csb: [4.0, 2.0, 2.0], Csc: [3.3, 2.0, 2.0],
    Cwa: [4.6, 2.6, 2.0], Cwb: [4.0, 2.6, 2.0], Cwc: [3.3, 2.6, 2.0],
    Dfa: [3.6, 3.0, 0.0], Dfb: [3.0, 3.0, 0.0], Dfc: [2.0, 3.0, 0.0], Dfd: [1.4, 3.0, 0.0],
    Dsa: [3.6, 2.0, 2.0], Dsb: [3.0, 2.0, 2.0], Dsc: [2.0, 2.0, 2.0], Dsd: [1.4, 2.0, 2.0],
    Dwa: [3.6, 2.6, 2.0], Dwb: [3.0, 2.6, 2.0], Dwc: [2.0, 2.6, 2.0], Dwd: [1.4, 2.6, 2.0],
    ET: [1.0, 2.0, 0.0], EF: [0.0, 2.0, 0.0],
};

const N = KOPPEN_CLASSES.length;

// Precompute a similarity matrix [truthId][simId] ∈ [0,1]. Ocean (id 0) → 0.
export const SIMILARITY = (() => {
    const M = Array.from({ length: N }, () => new Float32Array(N));
    for (let a = 1; a < N; a++) {
        const fa = FEATURES[KOPPEN_CLASSES[a].code];
        for (let b = 1; b < N; b++) {
            if (a === b) { M[a][b] = 1; continue; }
            const fb = FEATURES[KOPPEN_CLASSES[b].code];
            const dw = fa[0] - fb[0], dm = fa[1] - fb[1], ds = fa[2] - fb[2];
            const dist = Math.sqrt(WARMTH_W * dw * dw + MOIST_W * dm * dm + SEAS_W * ds * ds);
            const norm = Math.min(1, dist / REF_DIST);
            M[a][b] = 1 - Math.pow(norm, COST_EXP);
        }
    }
    return M;
})();

export function similarity(truthId, simId) {
    if (truthId <= 0 || simId <= 0 || truthId >= N || simId >= N) return 0;
    return SIMILARITY[truthId][simId];
}

// Major group A/B/C/D/E (E covers ET/EF); '' for ocean.
export function majorGroupOf(id) {
    const code = KOPPEN_CLASSES[id].code;
    if (code === 'Ocean') return '';
    if (code === 'ET' || code === 'EF') return 'E';
    return code[0];
}

export const MAJOR_GROUPS = ['A', 'B', 'C', 'D', 'E'];

// Sanity: every land class must have a feature vector.
for (let i = 1; i < N; i++) {
    if (!FEATURES[KOPPEN_CLASSES[i].code]) {
        throw new Error(`Missing Köppen feature vector for ${KOPPEN_CLASSES[i].code}`);
    }
}
