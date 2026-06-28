import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const logoSvgPath = process.env.PHOSPHOR_LOGO_SVG || "";

const pages = [
  { name: "split", file: "media-demo.html" },
  { name: "single", file: "磷光矩阵媒体处理单文件版.html" },
];

function pageUrl(file) {
  return pathToFileURL(path.join(root, file)).href;
}

async function waitForDemo(page) {
  await page.waitForFunction(() => window.PhosphorMediaDemo?.getState?.()?.backend === "webgl2", null, { timeout: 10000 });
}

async function assertCanvasNonBlank(page, label) {
  const stats = await captureCanvasStats(page);
  assert.ok(stats.width > 1 && stats.height > 1, `${label}: canvas has size`);
  assert.ok(stats.lit > 100, `${label}: canvas is nonblank`);
}

async function assertCanvasTopIsBrighter(page, label) {
  const buffer = await page.locator("#mediaMount").screenshot();
  const image = PNG.sync.read(buffer);
  let top = 0;
  let bottom = 0;
  let topCount = 0;
  let bottomCount = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const brightness = image.data[index] + image.data[index + 1] + image.data[index + 2];
      if (y < image.height * 0.42) {
        top += brightness;
        topCount += 1;
      } else if (y > image.height * 0.58) {
        bottom += brightness;
        bottomCount += 1;
      }
    }
  }
  assert.ok(top / topCount > bottom / bottomCount * 1.35, `${label}: image is not vertically flipped`);
}

async function captureCanvasStats(page) {
  const buffer = await page.locator("#mediaMount").screenshot();
  const image = PNG.sync.read(buffer);
  let lit = 0;
  let hash = 2166136261;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (r > 8 || g > 8 || b > 8) lit += 1;
    hash ^= r + (g << 8) + (b << 16);
    hash = Math.imul(hash, 16777619);
  }
  return { width: image.width, height: image.height, lit, hash: hash >>> 0 };
}

async function assertCanvasChanges(page, label, delay = 350) {
  const before = await captureCanvasStats(page);
  await page.waitForTimeout(delay);
  const after = await captureCanvasStats(page);
  assert.ok(before.lit > 100 && after.lit > 100, `${label}: canvas remains nonblank`);
  assert.notEqual(before.hash, after.hash, `${label}: canvas changes over time`);
}

async function loadGeneratedFile(page, factoryName) {
  await page.evaluate(async (name) => {
    const factories = {
      png() {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#03111f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(120, 230, 161, 0.95)";
        ctx.fillRect(8, 8, 42, 48);
        ctx.fillStyle = "rgba(117, 216, 255, 0.82)";
        ctx.fillRect(46, 16, 34, 30);
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(new File([blob], "smoke.png", { type: "image/png" })), "image/png");
        });
      },
      orientedPng() {
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#03111f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, 30);
        ctx.fillStyle = "#79e6a1";
        ctx.fillRect(18, 6, 84, 18);
        ctx.fillStyle = "#06101f";
        ctx.fillRect(0, 50, canvas.width, 30);
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(new File([blob], "oriented.png", { type: "image/png" })), "image/png");
        });
      },
      svg() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96">
          <rect width="160" height="96" fill="#02101e"/>
          <circle cx="48" cy="48" r="28" fill="rgba(117,216,255,.95)"/>
          <rect x="88" y="24" width="48" height="48" fill="rgba(121,230,161,.55)">
            <animate attributeName="x" values="88;104;88" dur="0.8s" repeatCount="indefinite"/>
          </rect>
        </svg>`;
        return new File([svg], "animated.svg", { type: "image/svg+xml" });
      },
      gif() {
        const base64 = "R0lGODlhMAAwAIEAAAARIgAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADAAAACwAAAAAMAAwAAAITwABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh2qMSAAIfkEAQwAAgAsCgAKABcAGQCBABEieeahAAAAAAAACCkAAwgcSLCgwYMIEypcyLChw4cQI0qcSLGixYsYM2rcyLGjx48gQzoMCAAh+QQBDAACACwKAAoAGwAZAIEAESJ12P8AAAAAAAAIVQABCAQQoKDBgwgTFhxIUKFDhQwfSjwYceLEihYfYswIcSBHjR4/dhQocmTDkhRDojS4cWVLlC9LxhQ582NNjjcz5rS486LKlQF6ShQKkiTQhT9XBgQAIfkEAQwAAgAsDgAKABsAGQCBABEi////AAAAAAAACFUAAQgEEKCgwYMIExYcSFChQ4UMH0o8GHHixIoWH2LMCHEgR40eP3YUKHJkw5IUQ6I0uHFlS5QvS8YUOfNjTY43M+a0uPOiypUBekoUCpIk0IU/VwYEADs=";
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        return new File([bytes], "twinkle.gif", { type: "image/gif" });
      },
      video() {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        const stream = canvas.captureStream(12);
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.start();
        let frame = 0;
        return new Promise((resolve) => {
          const draw = () => {
            ctx.fillStyle = "#04111f";
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = frame % 2 ? "#79e6a1" : "#75d8ff";
            ctx.fillRect(8 + frame * 2, 16, 24, 28);
            frame += 1;
            if (frame < 12) requestAnimationFrame(draw);
            else {
              recorder.addEventListener("stop", () => {
                resolve(new File(chunks, "smoke.webm", { type: "video/webm" }));
              }, { once: true });
              recorder.stop();
            }
          };
          draw();
        });
      },
    };
    const file = await factories[name]();
    await window.PhosphorMediaDemo.loadLocalFile(file);
  }, factoryName);
}

async function smokePage(browser, target) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(pageUrl(target.file));
  await waitForDemo(page);

  await loadGeneratedFile(page, "png");
  await page.waitForTimeout(600);
  await assertCanvasNonBlank(page, `${target.name} png`);
  await loadGeneratedFile(page, "orientedPng");
  await page.waitForTimeout(600);
  await assertCanvasTopIsBrighter(page, `${target.name} png orientation`);

  await loadGeneratedFile(page, "gif");
  await page.waitForTimeout(300);
  await assertCanvasChanges(page, `${target.name}: gif frame advances`, 420);
  await page.click('[data-source="canvas"]');
  await page.waitForTimeout(120);
  await page.click('[data-source="image"]');
  await page.waitForTimeout(200);
  await assertCanvasChanges(page, `${target.name}: gif survives tab switch`, 420);

  await loadGeneratedFile(page, "svg");
  await page.waitForTimeout(700);
  await assertCanvasNonBlank(page, `${target.name} svg`);

  await loadGeneratedFile(page, "video");
  await page.waitForTimeout(700);
  await assertCanvasNonBlank(page, `${target.name} video`);
  const userError = await page.locator("#errorText").textContent();
  assert.ok(!userError.includes("Video source has no drawable frame yet."), `${target.name}: transient video upload error is hidden`);
  assert.deepEqual(consoleErrors, [], `${target.name}: no console errors`);

  await page.close();
}

async function smokeLogo(browser) {
  if (!logoSvgPath) {
    console.log("Skipping logo SVG smoke: PHOSPHOR_LOGO_SVG is not set.");
    return;
  }
  if (!existsSync(logoSvgPath)) {
    console.log(`Skipping logo SVG smoke: file does not exist: ${logoSvgPath}`);
    return;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(pageUrl("media-demo.html"));
  await waitForDemo(page);
  await page.setInputFiles("#fileInput", logoSvgPath);
  await page.waitForTimeout(800);
  await assertCanvasNonBlank(page, "logo svg");
  await page.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(chromePath) ? chromePath : undefined,
});

try {
  for (const target of pages) {
    await smokePage(browser, target);
  }
  await smokeLogo(browser);
  console.log("media demo smoke ok");
} finally {
  await browser.close();
}
