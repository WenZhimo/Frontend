/**
 * World Orogen 无头渲染工具。
 *
 * 启动本地 HTTP 服务器，用 Puppeteer 驱动应用，生成
 * 固定种子/滑块组合的行星，并把球体截图保存到
 * tuning/screenshots/。
 *
 * 用法：node tuning/render-harness.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// 路径
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 静态服务器 MIME 类型
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.wasm': 'application/wasm',
};

// ---------------------------------------------------------------------------
// 静态文件服务器
// ---------------------------------------------------------------------------
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      const filePath = path.join(PROJECT_ROOT, urlPath);

      // 安全：保持在项目根目录内
      if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403); res.end(); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`静态服务器正在监听 http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------
const DETAIL_SLIDER_VALUE = 400;   // ~31 000 regions — fast iteration

const TEST_CASES = [
  {
    name: 'default',
    seed: '42',
    sliders: {},
  },
  {
    name: 'few-plates-high-land',
    seed: '100',
    sliders: { sP: 8, sLc: 0.6 },
  },
  {
    name: 'many-plates-low-land',
    seed: '200',
    sliders: { sP: 80, sLc: 0.25 },
  },
  {
    name: 'high-erosion',
    seed: '300',
    sliders: { sGl: 0.8, sHEr: 0.8, sTEr: 0.8 },
  },
  {
    name: 'mountainous-sharp-ridges',
    seed: '400',
    sliders: { sNs: 0.4, sRs: 0.8 },
  },
];

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 设置滑块值并派发 input 事件，让应用响应。 */
async function setSlider(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`未找到滑块 #${id}`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value: String(value) });
}

/**
 * 在点击按钮之前，先在 #generate 上安装一次性的 generate-done 监听器，
 * 并返回一个在事件触发时 resolve 的 promise。
 * 先调用它并保存 promise，再点击按钮，最后 await 这个 promise。
 */
function installGenerationWaiter(page, timeoutMs = 120_000) {
  // page.evaluate 返回的 promise 会在内部 promise resolve 时 resolve
  return page.evaluate((timeout) => {
    return new Promise((resolve, reject) => {
      const btn = document.getElementById('generate');
      const timer = setTimeout(() => reject(new Error('生成超时')), timeout);
      btn.addEventListener('generate-done', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }, timeoutMs);
}

/** 通过水平拖动（偏航）和/或垂直拖动（俯仰）旋转球体。 */
async function rotateGlobe(page, yawRadians, pitchRadians = 0) {
  await page.evaluate(({ yaw, pitch }) => {
    const canvas = document.getElementById('canvas');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    // OrbitControls 会把 2*PI 旋转映射为完整画布宽/高的拖动。
    const dx = (yaw / (2 * Math.PI)) * w;
    const dy = (pitch / (Math.PI)) * h;

    const pointerDown = new PointerEvent('pointerdown', {
      clientX: cx, clientY: cy, button: 0, bubbles: true, pointerId: 1,
    });
    const pointerMove = new PointerEvent('pointermove', {
      clientX: cx - dx, clientY: cy - dy, button: 0, bubbles: true, pointerId: 1,
    });
    const pointerUp = new PointerEvent('pointerup', {
      clientX: cx - dx, clientY: cy - dy, button: 0, bubbles: true, pointerId: 1,
    });

    canvas.dispatchEvent(pointerDown);
    canvas.dispatchEvent(pointerMove);
    canvas.dispatchEvent(pointerUp);
  }, { yaw: yawRadians, pitch: pitchRadians });

  // 等待渲染循环跟上。
  await new Promise((r) => setTimeout(r, 1500));
}

/** 截取 canvas 元素截图。 */
async function screenshotCanvas(page, filePath) {
  const canvas = await page.$('#canvas');
  if (!canvas) throw new Error('未找到 Canvas');
  await canvas.screenshot({ path: filePath });
  console.log(`  已保存：${path.relative(PROJECT_ROOT, filePath)}`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    for (const tc of TEST_CASES) {
      console.log(`\n=== 测试用例：${tc.name}（种子 ${tc.seed}）===`);
      let page;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });

        // 抑制对话框 / 权限提示
        page.on('dialog', (d) => d.dismiss());

        // 转发页面控制台和错误，便于调试
        page.on('console', (msg) => {
          if (msg.type() === 'error') console.log(`  [页面错误] ${msg.text()}`);
        });
        page.on('pageerror', (err) => console.log(`  [页面异常] ${err.message}`));

        // 导航并等待初始加载
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        // 等待 ES 模块和 Three.js 初始化
        await new Promise((r) => setTimeout(r, 2000));

        // 关闭可能出现的浮层（教程 / 更新内容）
        await page.evaluate(() => {
          for (const id of ['tutorialOverlay', 'whatsNewOverlay']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          }
        });

        // 将细节滑块调低以便快速迭代
        await setSlider(page, 'sN', DETAIL_SLIDER_VALUE);

        // 设置该测试用例的自定义滑块
        for (const [id, val] of Object.entries(tc.sliders)) {
          await setSlider(page, id, val);
        }

        // 拦截 Web Worker postMessage 以注入固定种子。
        // generate() 在全新构建时会把 seed 传为 `undefined`，
        // Worker 会用 Math.random() 填充它。这里 patch postMessage，
        // 让下一条 generate 命令携带选定种子。
        await page.evaluate((seed) => {
          const origPost = Worker.prototype.postMessage;
          Worker.prototype.postMessage = function(msg, ...rest) {
            if (msg && msg.cmd === 'generate' && msg.seed === undefined) {
              msg.seed = Number(seed);
            }
            return origPost.call(this, msg, ...rest);
          };
        }, tc.seed);

        // 点击前先安装完成监听器，再点击，再等待。
        const t0 = performance.now();
        const genDone = installGenerationWaiter(page, 120_000);
        // 短暂延迟，确保上面的 evaluate 有时间注册监听器
        await new Promise((r) => setTimeout(r, 100));
        await page.click('#generate');

        // 等待生成完成
        await genDone;

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        console.log(`  生成完成，耗时 ${elapsed} 秒`);

        // 等待渲染稳定
        await new Promise((r) => setTimeout(r, 1000));

        // 提取地形指标记分卡
        const metrics = await page.evaluate(() => window.__terrainMetrics);
        if (metrics) {
          const metricsPath = path.join(SCREENSHOT_DIR, `seed-${tc.seed}_${tc.name}_metrics.json`);
          fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
          console.log(`  指标：${path.relative(PROJECT_ROOT, metricsPath)}`);
          if (metrics._error) console.warn(`  指标错误：${metrics._error}`);
        } else {
          console.warn('  无可用地形指标');
        }

        // 折叠侧边栏以最大化画布区域
        await page.click('#sidebarToggle');
        // 等待面板收起动画和 Three.js 重新调整尺寸
        await new Promise((r) => setTimeout(r, 800));

        // 截取覆盖完整行星的球体截图：
        // 4 个赤道旋转视角（0°、90°、180°、270°）+ 北极 + 南极
        const base = `seed-${tc.seed}_${tc.name}`;

        // 赤道视角：绕 Y 轴旋转
        for (let i = 0; i < 4; i++) {
          if (i > 0) await rotateGlobe(page, Math.PI / 2, 0);
          await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_eq-${i * 90}.png`));
        }

        // 北极：相机上仰
        await rotateGlobe(page, 0, -Math.PI / 2.2);
        await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_north-pole.png`));

        // 南极：相机下俯（先重置，再向下）
        await rotateGlobe(page, 0, Math.PI / 1.1);
        await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_south-pole.png`));
      } catch (err) {
        console.error(`  失败：${err.message}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
    server.close();
    console.log('\n完成。截图已保存到 tuning/screenshots/');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
