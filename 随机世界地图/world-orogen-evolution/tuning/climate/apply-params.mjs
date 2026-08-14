/**
 * Apply tuned climate parameters to the app by rewriting the default values
 * in js/climate-config.js.
 *
 * Usage:  node tuning/climate/apply-params.mjs tuning/results/climate/<label>-best.json
 *
 * Only parameters that differ from the current defaults are rewritten.
 * Review the resulting diff before committing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'js', 'climate-config.js');

const bestFile = process.argv[2];
if (!bestFile) {
    console.error('Usage: node tuning/climate/apply-params.mjs <best-params.json>');
    process.exit(1);
}

const { params } = JSON.parse(fs.readFileSync(bestFile, 'utf8'));
if (!params) throw new Error('No "params" field in ' + bestFile);

let src = fs.readFileSync(CONFIG_PATH, 'utf8');
let applied = 0;

for (const [key, value] of Object.entries(params)) {
    if (!(key in CLIMATE_DEFAULTS)) throw new Error(`Unknown param: ${key}`);
    if (value === CLIMATE_DEFAULTS[key]) continue;
    const rounded = +value.toFixed(4);
    // Match "    KEY: <number>," preserving indentation and trailing comment
    const re = new RegExp(`(\\n\\s*${key}:\\s*)(-?[\\d.]+)(,)`);
    if (!re.test(src)) throw new Error(`Could not locate ${key} in climate-config.js`);
    src = src.replace(re, `$1${rounded}$3`);
    console.log(`  ${key}: ${CLIMATE_DEFAULTS[key]} → ${rounded}`);
    applied++;
}

if (applied === 0) {
    console.log('All tuned params equal current defaults — nothing to apply.');
} else {
    fs.writeFileSync(CONFIG_PATH, src);
    console.log(`\n${applied} parameter(s) written to js/climate-config.js.`);
    console.log('Verify with: node tuning/climate/evaluate.mjs   (should reproduce the tuned score)');
}
