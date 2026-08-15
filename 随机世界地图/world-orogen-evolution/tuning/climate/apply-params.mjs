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
    console.error('用法：node tuning/climate/apply-params.mjs <best-params.json>');
    process.exit(1);
}

const { params } = JSON.parse(fs.readFileSync(bestFile, 'utf8'));
if (!params) throw new Error('缺少 "params" 字段：' + bestFile);

let src = fs.readFileSync(CONFIG_PATH, 'utf8');
let applied = 0;

for (const [key, value] of Object.entries(params)) {
    if (!(key in CLIMATE_DEFAULTS)) throw new Error(`未知参数：${key}`);
    if (value === CLIMATE_DEFAULTS[key]) continue;
    const rounded = +value.toFixed(4);
    // Match "    KEY: <number>," preserving indentation and trailing comment
    const re = new RegExp(`(\\n\\s*${key}:\\s*)(-?[\\d.]+)(,)`);
    if (!re.test(src)) throw new Error(`无法在 climate-config.js 中定位 ${key}`);
    src = src.replace(re, `$1${rounded}$3`);
    console.log(`  ${key}: ${CLIMATE_DEFAULTS[key]} → ${rounded}`);
    applied++;
}

if (applied === 0) {
    console.log('所有调校参数都等于当前默认值，无需应用。');
} else {
    fs.writeFileSync(CONFIG_PATH, src);
    console.log(`\n已向 js/climate-config.js 写入 ${applied} 个参数。`);
    console.log('验证命令：node tuning/climate/evaluate.mjs   （应能复现调校后的分数）');
}
