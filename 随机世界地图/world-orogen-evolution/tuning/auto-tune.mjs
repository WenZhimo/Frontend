/**
 * 自动地形调参脚本。
 *
 * 用固定种子无头运行应用，收集指标并保存结果。
 * 设计为由 Claude Code 驱动：在多次运行之间修改 terrain-config.js。
 *
 * 用法：node tuning/auto-tune.mjs [标签]
 * 输出：tuning/results/<label>.json，包含所有种子的指标
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(__dirname, 'results');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const label = process.argv[2] || `run-${Date.now()}`;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
      const filePath = path.join(PROJECT_ROOT, urlPath);
      if (!filePath.startsWith(PROJECT_ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

// 种子按多样性选择：不同板块配置、陆地覆盖率等。
const SEEDS = [42, 100, 200, 300, 400];

async function runSeed(browser, baseUrl, seed) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  page.on('dialog', (d) => d.dismiss());
  page.on('pageerror', () => {}); // suppress

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2000));

    // 关闭浮层
    await page.evaluate(() => {
      for (const id of ['tutorialOverlay', 'whatsNewOverlay']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
    });

    // 设置低细节以加快速度
    await page.evaluate(() => {
      const el = document.getElementById('sN');
      el.value = 400;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 注入种子
    await page.evaluate((s) => {
      const origPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(msg, ...rest) {
        if (msg && msg.cmd === 'generate' && msg.seed === undefined) msg.seed = Number(s);
        return origPost.call(this, msg, ...rest);
      };
    }, seed);

    // 生成
    const genDone = page.evaluate((timeout) => {
      return new Promise((resolve, reject) => {
        const btn = document.getElementById('generate');
        const timer = setTimeout(() => reject(new Error('生成超时')), timeout);
        btn.addEventListener('generate-done', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }, 120_000);

    await new Promise((r) => setTimeout(r, 100));
    await page.click('#generate');
    await genDone;

    await new Promise((r) => setTimeout(r, 500));
    const metrics = await page.evaluate(() => window.__terrainMetrics);
    return { seed, metrics: metrics || { _error: 'no metrics' } };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl',
           '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  });

  const results = [];
  const t0 = performance.now();

  try {
    for (const seed of SEEDS) {
      const r = await runSeed(browser, baseUrl, seed);
      results.push(r);
      process.stdout.write(`  seed ${seed}: ${r.metrics._error ? 'ERROR' : 'OK'} (${(r.metrics._metrics_ms || 0).toFixed(0)}ms metrics)\n`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  // 计算关键指标的跨种子平均值
  const validMetrics = results.filter(r => !r.metrics._error).map(r => r.metrics);
  const avg = {};
  if (validMetrics.length > 0) {
    const keys = Object.keys(validMetrics[0]).filter(k => !k.startsWith('_') && typeof validMetrics[0][k] === 'number');
    for (const k of keys) {
      const vals = validMetrics.map(m => m[k]).filter(v => v != null && !isNaN(v));
      avg[k] = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : null;
    }
  }

  const output = { label, elapsed_s: +elapsed, seeds: SEEDS, results, averages: avg };
  const outPath = path.join(RESULTS_DIR, `${label}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n结果已保存：${outPath}（总计 ${elapsed} 秒）`);

  // 打印摘要
  console.log('\n=== 跨种子平均值 ===');
  const highlight = [
    'continent_count', 'island_count_total', 'flat_ocean_plate_land_fraction',
    'relief_headroom', 'coast_complexity_index', 'hypsometry_trough_depth',
    'mountain_boundary_ratio', 'orogenic_elev_correlation', 'erosion_slope_correlation',
    'coastal_lowland_fraction', 'land_band_500m_plus_frac',
    'shelf_width_passive_km', 'shelf_width_active_km',
  ];
  for (const k of highlight) {
    if (avg[k] != null) console.log(`  ${k}: ${avg[k]}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
