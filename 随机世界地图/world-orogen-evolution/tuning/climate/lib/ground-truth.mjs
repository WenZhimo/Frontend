/**
 * Real-Earth Köppen-Geiger ground truth (Kottek et al. 2006 / Rubel & Kottek,
 * observed 1976-2000, 0.5° grid), parsed from the ASCII "Lat Lon Cls" file.
 *
 * Exposes a 720×360 Uint8 grid of koppen.js class IDs (255 = no data / ocean)
 * plus a lookup by lat/lon.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KOPPEN_CLASSES } from '../../../js/koppen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASCII_PATH = path.join(__dirname, '..', 'data', 'ascii', 'Koeppen-Geiger-ASCII.txt');

export const GRID_W = 720;   // 0.5° longitude columns, -179.75 … +179.75
export const GRID_H = 360;   // 0.5° latitude rows,   -89.75 … +89.75
export const NO_DATA = 255;

// Ground-truth codes not present in koppen.js's class set → nearest equivalent.
// "As" (dry-summer tropical) is conventionally merged into Aw (Beck et al. do the same).
const CODE_ALIASES = { As: 'Aw' };

const CODE_TO_ID = {};
KOPPEN_CLASSES.forEach((c, i) => { CODE_TO_ID[c.code] = i; });

export function loadGroundTruth(asciiPath = ASCII_PATH) {
    if (!fs.existsSync(asciiPath)) {
        throw new Error(
            `Ground truth file not found: ${asciiPath}\n` +
            `Expected the Kottek et al. Köppen-Geiger ASCII grid ` +
            `(Koeppen-Geiger-ASCII.txt from koeppen-geiger.vu-wien.ac.at).`
        );
    }
    const text = fs.readFileSync(asciiPath, 'utf8');
    const grid = new Uint8Array(GRID_W * GRID_H).fill(NO_DATA);
    let rows = 0, unknown = new Set();

    for (const line of text.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length !== 3 || parts[0] === 'Lat') continue;
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        let code = parts[2];
        if (CODE_ALIASES[code]) code = CODE_ALIASES[code];
        const id = CODE_TO_ID[code];
        if (id === undefined) { unknown.add(parts[2]); continue; }
        const row = Math.round((lat + 89.75) / 0.5);
        const col = Math.round((lon + 179.75) / 0.5);
        if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) continue;
        grid[row * GRID_W + col] = id;
        rows++;
    }
    if (rows < 10000) throw new Error(`Ground truth parse produced only ${rows} cells — file corrupt?`);
    if (unknown.size) console.warn(`[ground-truth] Unmapped codes skipped: ${[...unknown].join(', ')}`);
    return grid;
}

/** Nearest-cell ground truth class ID for a lat/lon in radians. 255 = no data. */
export function truthAt(grid, latRad, lonRad) {
    const latDeg = latRad * 180 / Math.PI;
    const lonDeg = lonRad * 180 / Math.PI;
    let row = Math.round((latDeg + 89.75) / 0.5);
    let col = Math.round((lonDeg + 179.75) / 0.5);
    row = Math.max(0, Math.min(GRID_H - 1, row));
    col = ((col % GRID_W) + GRID_W) % GRID_W;
    return grid[row * GRID_W + col];
}
