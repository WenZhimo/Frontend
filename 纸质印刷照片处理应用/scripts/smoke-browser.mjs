import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const APP_PORT = Number(process.env.SMOKE_APP_PORT ?? 5180);
const DEBUG_PORT = Number(process.env.SMOKE_DEBUG_PORT ?? 9333);
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const DEFAULT_TIMEOUT_MS = 30_000;
const CAPTURE_REAL_PHOTO_GALLERY =
  process.argv.includes("--real-photo-gallery") || process.env.SMOKE_REAL_PHOTO_GALLERY === "1";
const CAPTURE_REAL_PHOTO_PRESET_GALLERY =
  process.argv.includes("--real-photo-preset-gallery") || process.env.SMOKE_REAL_PHOTO_PRESET_GALLERY === "1";
const RUN_REAL_PHOTOS =
  CAPTURE_REAL_PHOTO_GALLERY ||
  CAPTURE_REAL_PHOTO_PRESET_GALLERY ||
  process.argv.includes("--real-photos") ||
  process.env.SMOKE_REAL_PHOTOS === "1";
const REAL_PHOTO_DIR = process.env.REAL_PHOTO_DIR
  ? isAbsolute(process.env.REAL_PHOTO_DIR)
    ? process.env.REAL_PHOTO_DIR
    : resolve(process.cwd(), process.env.REAL_PHOTO_DIR)
  : join(process.cwd(), "tests", "fixtures", "local-only", "real-photos");
const REAL_PHOTO_GALLERY_DIR = process.env.REAL_PHOTO_GALLERY_DIR
  ? isAbsolute(process.env.REAL_PHOTO_GALLERY_DIR)
    ? process.env.REAL_PHOTO_GALLERY_DIR
    : resolve(process.cwd(), process.env.REAL_PHOTO_GALLERY_DIR)
  : join(process.cwd(), "tests", "fixtures", "local-only", "real-photo-gallery");
const REAL_PHOTO_PRESET_GALLERY_DIR = process.env.REAL_PHOTO_PRESET_GALLERY_DIR
  ? isAbsolute(process.env.REAL_PHOTO_PRESET_GALLERY_DIR)
    ? process.env.REAL_PHOTO_PRESET_GALLERY_DIR
    : resolve(process.cwd(), process.env.REAL_PHOTO_PRESET_GALLERY_DIR)
  : join(process.cwd(), "tests", "fixtures", "local-only", "real-photo-preset-gallery");
const REAL_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const chromeCandidates =
  process.platform === "win32"
    ? [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        process.env.CHROME_PATH,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChrome() {
  const chromePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));

  if (!chromePath) {
    throw new Error("Chrome or Edge executable was not found. Set CHROME_PATH to run browser smoke tests.");
  }

  return chromePath;
}

function runProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    ...options,
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  child.kill("SIGTERM");
}

async function waitForFetch(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function readJson(url, options) {
  const response = await waitForFetch(url, DEFAULT_TIMEOUT_MS, options);
  return response.json();
}

function toServedPath(filePath) {
  const relativePath = relative(process.cwd(), filePath);

  if (relativePath.startsWith("..")) {
    throw new Error(`Real photo samples must live inside the project directory: ${filePath}`);
  }

  return `/${relativePath
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function safeFileBase(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function assertLocalOnlyOutputDir(outputDir) {
  const localOnlyRoot = resolve(process.cwd(), "tests", "fixtures", "local-only");
  const resolvedOutputDir = resolve(outputDir);
  const relativePath = relative(localOnlyRoot, resolvedOutputDir);

  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Real-photo gallery output must be inside tests/fixtures/local-only/: ${resolvedOutputDir}`);
  }

  return resolvedOutputDir;
}

async function writePngDataUrl(dataUrl, filePath) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl ?? "");
  if (!match) {
    throw new Error(`Expected PNG data URL for ${filePath}.`);
  }

  await writeFile(filePath, Buffer.from(match[1], "base64"));
}

async function writeRealPhotoGallery(realPhotoResults, outputDir) {
  if (!CAPTURE_REAL_PHOTO_GALLERY) {
    return null;
  }

  const resolvedOutputDir = assertLocalOnlyOutputDir(outputDir);
  rmSync(resolvedOutputDir, { recursive: true, force: true });
  await mkdir(resolvedOutputDir, { recursive: true });

  const galleryItems = [];

  for (const [index, photo] of realPhotoResults.entries()) {
    if (!photo.reviewImages) {
      throw new Error(`Missing review images for ${photo.name}.`);
    }

    const prefix = `${String(index + 1).padStart(2, "0")}-${safeFileBase(photo.name) || "real-photo"}`;
    const originalFile = `${prefix}-original.png`;
    const processedFile = `${prefix}-processed.png`;
    await writePngDataUrl(photo.reviewImages.originalPng, join(resolvedOutputDir, originalFile));
    await writePngDataUrl(photo.reviewImages.processedPng, join(resolvedOutputDir, processedFile));

    galleryItems.push({
      name: photo.name,
      sourceSize: photo.sourceSize,
      canvas: photo.canvas,
      metrics: photo.metrics,
      originalFile,
      processedFile,
    });
  }

  const generatedAt = new Date().toISOString();
  const cards = galleryItems
    .map(
      (item) => `
        <article class="card">
          <header>
            <h2>${escapeHtml(item.name)}</h2>
            <p>source ${item.sourceSize.width} x ${item.sourceSize.height} · canvas ${item.canvas.width} x ${item.canvas.height}</p>
            <p>colors ${item.metrics.coarseColors} · luma sd ${item.metrics.lumaStdDev} · opaque ${item.metrics.opaque ? "yes" : "no"}</p>
          </header>
          <div class="pair">
            <figure>
              <img src="${escapeHtml(item.originalFile)}" alt="${escapeHtml(item.name)} original" />
              <figcaption>Original</figcaption>
            </figure>
            <figure>
              <img src="${escapeHtml(item.processedFile)}" alt="${escapeHtml(item.name)} processed" />
              <figcaption>Warm Poster processed</figcaption>
            </figure>
          </div>
        </article>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>真实照片纸质印刷验证</title>
    <style>
      :root {
        color: #231f18;
        background: #f3eadb;
        font-family: Inter, "Microsoft YaHei", Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      .intro {
        margin: 0 0 24px;
        color: #665c50;
      }
      .grid {
        display: grid;
        gap: 24px;
      }
      .card {
        border: 1px solid #d8cbb7;
        background: #fffaf0;
        padding: 18px;
      }
      .card h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      .card p {
        margin: 2px 0;
        color: #6b6257;
        font-size: 13px;
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      figure {
        margin: 0;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid #cfc0aa;
        background: #eadfcf;
      }
      figcaption {
        margin-top: 8px;
        color: #4f473f;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h1>真实照片纸质印刷验证</h1>
    <p class="intro">Generated ${escapeHtml(generatedAt)}. Files are local-only and ignored by git.</p>
    <section class="grid">
${cards}
    </section>
  </body>
</html>`;

  const manifest = {
    generatedAt,
    preset: "Warm Poster",
    items: galleryItems,
  };

  const indexPath = join(resolvedOutputDir, "index.html");
  const manifestPath = join(resolvedOutputDir, "manifest.json");
  await writeFile(indexPath, html, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    directory: resolvedOutputDir,
    index: indexPath,
    manifest: manifestPath,
    imageCount: galleryItems.length * 2,
  };
}

async function writeRealPhotoPresetGallery(presetMatrix, outputDir) {
  if (!CAPTURE_REAL_PHOTO_PRESET_GALLERY) {
    return null;
  }

  const resolvedOutputDir = assertLocalOnlyOutputDir(outputDir);
  rmSync(resolvedOutputDir, { recursive: true, force: true });
  await mkdir(resolvedOutputDir, { recursive: true });

  const galleryItems = [];
  let imageCount = 0;

  for (const [index, item] of presetMatrix.items.entries()) {
    const prefix = `${String(index + 1).padStart(2, "0")}-${safeFileBase(item.name) || "real-photo"}`;
    const originalFile = `${prefix}-original.png`;
    await writePngDataUrl(item.originalPng, join(resolvedOutputDir, originalFile));
    imageCount += 1;

    const presets = [];
    for (const [presetIndex, preset] of item.presets.entries()) {
      const presetFile = `${prefix}-${String(presetIndex + 1).padStart(2, "0")}-${safeFileBase(preset.name) || "preset"}.png`;
      await writePngDataUrl(preset.processedPng, join(resolvedOutputDir, presetFile));
      imageCount += 1;
      presets.push({
        name: preset.name,
        canvas: preset.canvas,
        metrics: preset.metrics,
        file: presetFile,
      });
    }

    galleryItems.push({
      name: item.name,
      sourceSize: item.sourceSize,
      canvas: item.canvas,
      originalFile,
      presets,
    });
  }

  const generatedAt = new Date().toISOString();
  const cards = galleryItems
    .map((item) => {
      const figures = [
        `
            <figure>
              <img src="${escapeHtml(item.originalFile)}" alt="${escapeHtml(item.name)} original" />
              <figcaption>Original</figcaption>
            </figure>`,
        ...item.presets.map(
          (preset) => `
            <figure>
              <img src="${escapeHtml(preset.file)}" alt="${escapeHtml(item.name)} ${escapeHtml(preset.name)}" />
              <figcaption>${escapeHtml(preset.name)}<br />colors ${preset.metrics.coarseColors} · luma sd ${preset.metrics.lumaStdDev}</figcaption>
            </figure>`,
        ),
      ].join("\n");

      return `
        <article class="card">
          <header>
            <h2>${escapeHtml(item.name)}</h2>
            <p>source ${item.sourceSize.width} x ${item.sourceSize.height} · canvas ${item.canvas.width} x ${item.canvas.height}</p>
          </header>
          <div class="matrix">
${figures}
          </div>
        </article>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>真实照片全预设矩阵验证</title>
    <style>
      :root {
        color: #231f18;
        background: #f3eadb;
        font-family: Inter, "Microsoft YaHei", Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 28px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      .intro {
        margin: 0 0 24px;
        color: #665c50;
      }
      .grid {
        display: grid;
        gap: 22px;
      }
      .card {
        border: 1px solid #d8cbb7;
        background: #fffaf0;
        padding: 16px;
      }
      .card h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      .card p {
        margin: 2px 0;
        color: #6b6257;
        font-size: 13px;
      }
      .matrix {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      figure {
        margin: 0;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid #cfc0aa;
        background: #eadfcf;
      }
      figcaption {
        margin-top: 7px;
        color: #4f473f;
        font-size: 12px;
        line-height: 1.35;
      }
    </style>
  </head>
  <body>
    <h1>真实照片全预设矩阵验证</h1>
    <p class="intro">Generated ${escapeHtml(generatedAt)}. Files are local-only and ignored by git.</p>
    <section class="grid">
${cards}
    </section>
  </body>
</html>`;

  const manifest = {
    generatedAt,
    presetNames: presetMatrix.presetNames,
    items: galleryItems,
  };

  const indexPath = join(resolvedOutputDir, "index.html");
  const manifestPath = join(resolvedOutputDir, "manifest.json");
  await writeFile(indexPath, html, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    directory: resolvedOutputDir,
    index: indexPath,
    manifest: manifestPath,
    sampleCount: galleryItems.length,
    presetCount: presetMatrix.presetNames.length,
    imageCount,
  };
}

async function listRealPhotoSamples() {
  if (!RUN_REAL_PHOTOS) {
    return [];
  }

  if (!existsSync(REAL_PHOTO_DIR)) {
    throw new Error(
      `No real-photo fixture directory found: ${REAL_PHOTO_DIR}. Add jpg/png/webp samples there or set REAL_PHOTO_DIR.`,
    );
  }

  const entries = await readdir(REAL_PHOTO_DIR, { withFileTypes: true });
  const samples = entries
    .filter((entry) => entry.isFile() && REAL_PHOTO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    .map((entry) => {
      const filePath = join(REAL_PHOTO_DIR, entry.name);
      return {
        name: entry.name,
        url: toServedPath(filePath),
      };
    });

  if (samples.length === 0) {
    throw new Error(`No jpg/png/webp real-photo samples found in ${REAL_PHOTO_DIR}.`);
  }

  return samples;
}

async function createBrowserTarget() {
  await waitForFetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

  const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
    method: "PUT",
  });

  if (targetResponse.ok) {
    return targetResponse.json();
  }

  const targets = await readJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
  const page = targets.find((target) => target.type === "page");

  if (!page) {
    throw new Error("No Chrome page target was available for smoke testing.");
  }

  return page;
}

function createCdpClient(webSocketDebuggerUrl) {
  let nextId = 0;
  const pending = new Map();
  const events = [];
  const socket = new WebSocket(webSocketDebuggerUrl);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }

      resolve(message.result);
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  function send(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    events,
    opened,
    send,
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const result = await client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs,
  );

  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(text);
  }

  return result.result.value;
}

function pageSmokeExpression(realPhotoSamples = [], captureRealPhotoGallery = false) {
  const realPhotoSamplesJson = JSON.stringify(realPhotoSamples).replaceAll("<", "\\u003c");
  const captureRealPhotoGalleryJson = JSON.stringify(captureRealPhotoGallery);
  return `(${async () => {
    const realPhotoSamples = __REAL_PHOTO_SAMPLES__;
    const captureRealPhotoGallery = __CAPTURE_REAL_PHOTO_GALLERY__;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function waitFor(predicate, label, timeoutMs = 12_000) {
      const startedAt = performance.now();

      while (performance.now() - startedAt < timeoutMs) {
        const result = predicate();
        if (result) {
          return result;
        }
        await wait(100);
      }

      throw new Error(`Timed out waiting for ${label}`);
    }

    function statusText() {
      return document.querySelector(".status")?.textContent?.trim() ?? "";
    }

    function activePreset() {
      return document.querySelector(".preset.is-active span")?.textContent?.trim() ?? "";
    }

    function canvasInfo(selector = ".processed-canvas") {
      const canvas = document.querySelector(selector) ?? document.querySelector("canvas");
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    }

    function previewMode() {
      return document.querySelector(".preview-frame")?.getAttribute("data-preview-mode") ?? "";
    }

    function imageMetaText() {
      return Array.from(document.querySelectorAll(".inspector dd")).at(2)?.textContent?.trim() ?? "";
    }

    function paperMetaText() {
      return Array.from(document.querySelectorAll(".inspector dd")).at(0)?.textContent?.trim() ?? "";
    }

    function controlText(label) {
      return Array.from(document.querySelectorAll(".control")).find((node) => node.textContent?.includes(label))?.textContent?.trim() ?? "";
    }

    function presetNames() {
      return Array.from(document.querySelectorAll(".preset span")).map((node) => node.textContent?.trim() ?? "");
    }

    function inputForControl(label, type) {
      const control = Array.from(document.querySelectorAll(".control")).find((node) => node.textContent?.includes(label));
      const input = control?.querySelector(`input[type="${type}"]`);
      if (!input) {
        throw new Error(`${label} ${type} input was not found.`);
      }
      return input;
    }

    function setInputValue(input, value) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!nativeSetter) {
        throw new Error("Native input value setter was not found.");
      }
      nativeSetter.call(input, String(value));
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setRangeControl(label, value) {
      setInputValue(inputForControl(label, "range"), value);
    }

    function setColorControl(label, value) {
      setInputValue(inputForControl(label, "color"), value);
    }

    function customPresetStorage() {
      try {
        return JSON.parse(localStorage.getItem("paper-print-photo-custom-presets") ?? "[]");
      } catch {
        return null;
      }
    }

    function clickButtonByText(label) {
      const button = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
      if (!button) {
        throw new Error(`${label} button was not found.`);
      }
      button.click();
      return button;
    }

    function clickPreviewMode(label) {
      const button = Array.from(document.querySelectorAll(".preview-mode-button")).find((item) => item.textContent?.includes(label));
      if (!button) {
        throw new Error(`${label} preview button was not found.`);
      }
      button.click();
      return button;
    }

    function expectedMetaFromSvg(svgText) {
      const width = svgText.match(/\bwidth=["']?(\d+)/i)?.[1];
      const height = svgText.match(/\bheight=["']?(\d+)/i)?.[1];
      return width && height ? `${width} x ${height}` : "";
    }

    function expectedCanvasFromSize(width, height) {
      if (!width || !height) {
        return null;
      }

      const scale = Math.min(1, 1200 / Math.max(width, height));
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    }

    function expectedCanvasFromSvg(svgText) {
      const width = Number(svgText.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
      const height = Number(svgText.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);
      return expectedCanvasFromSize(width, height);
    }

    async function uploadFileAndWait(name, file, expectedMeta, expectedCanvas) {
      const input = document.querySelector('input[type="file"]');
      if (!input) {
        throw new Error("File input was not found.");
      }

      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      await waitFor(
        () => {
          const canvas = canvasInfo();
          const canvasMatches =
            !expectedCanvas || (canvas?.width === expectedCanvas.width && canvas?.height === expectedCanvas.height);
          return statusText().startsWith("已应用") && canvasMatches && (!expectedMeta || imageMetaText() === expectedMeta);
        },
        `${name} render`,
      );

      return {
        name,
        status: statusText(),
        canvas: canvasInfo(),
        imageMeta: imageMetaText(),
      };
    }

    async function uploadSvg(name, svgText) {
      return uploadFileAndWait(
        name,
        new File([svgText], `${name}.svg`, { type: "image/svg+xml" }),
        expectedMetaFromSvg(svgText),
        expectedCanvasFromSvg(svgText),
      );
    }

    async function decodeImageSize(blob) {
      if ("createImageBitmap" in window) {
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
      }

      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function mimeFromName(name) {
      const lower = name.toLowerCase();
      if (lower.endsWith(".png")) return "image/png";
      if (lower.endsWith(".webp")) return "image/webp";
      return "image/jpeg";
    }

    function canvasTextureMetrics() {
      const sourceCanvas = document.querySelector(".processed-canvas") ?? document.querySelector("canvas");
      if (!sourceCanvas) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Could not create metrics canvas context.");
      }
      context.drawImage(sourceCanvas, 0, 0);
      const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 50_000)));
      const colors = new Set();
      let count = 0;
      let lumaSum = 0;
      let lumaSqSum = 0;
      let opaque = true;

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
          const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
          colors.add(`${r >> 5},${g >> 5},${b >> 5}`);
          opaque = opaque && a === 255;
          count += 1;
          lumaSum += luma;
          lumaSqSum += luma * luma;
        }
      }

      const lumaMean = lumaSum / count;
      const variance = Math.max(0, lumaSqSum / count - lumaMean * lumaMean);

      return {
        samples: count,
        coarseColors: colors.size,
        lumaMean: Number(lumaMean.toFixed(2)),
        lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
        opaque,
      };
    }

    function inkAreaPaperGapRatio() {
      const processedCanvas = document.querySelector(".processed-canvas");
      const originalCanvas = document.querySelector(".original-canvas");
      if (!processedCanvas || !originalCanvas) {
        return null;
      }

      const processedProbe = document.createElement("canvas");
      const originalProbe = document.createElement("canvas");
      processedProbe.width = processedCanvas.width;
      processedProbe.height = processedCanvas.height;
      originalProbe.width = originalCanvas.width;
      originalProbe.height = originalCanvas.height;
      const processedContext = processedProbe.getContext("2d", { willReadFrequently: true });
      const originalContext = originalProbe.getContext("2d", { willReadFrequently: true });
      if (!processedContext || !originalContext) {
        throw new Error("Could not create gap probe canvas contexts.");
      }
      processedContext.drawImage(processedCanvas, 0, 0);
      originalContext.drawImage(originalCanvas, 0, 0);

      const step = Math.max(1, Math.floor(Math.sqrt((processedCanvas.width * processedCanvas.height) / 30_000)));
      let inkAreaSamples = 0;
      let paperGapSamples = 0;

      for (let y = 0; y < processedCanvas.height; y += step) {
        for (let x = 0; x < processedCanvas.width; x += step) {
          const [or, og, ob] = originalContext.getImageData(x, y, 1, 1).data;
          const originalLuma = or * 0.2126 + og * 0.7152 + ob * 0.0722;
          if (originalLuma > 235) {
            continue;
          }

          const [pr, pg, pb] = processedContext.getImageData(x, y, 1, 1).data;
          inkAreaSamples += 1;
          if (pr > 245 && pg > 245 && pb > 245) {
            paperGapSamples += 1;
          }
        }
      }

      return {
        inkAreaSamples,
        paperGapSamples,
        ratio: inkAreaSamples === 0 ? 0 : Number((paperGapSamples / inkAreaSamples).toFixed(4)),
      };
    }

    function canvasPngDataUrl(selector) {
      const canvas = document.querySelector(selector);
      if (!canvas) {
        throw new Error(`${selector} canvas was not found.`);
      }

      return canvas.toDataURL("image/png");
    }

    async function uploadRealPhoto(sample) {
      const response = await fetch(sample.url);
      if (!response.ok) {
        throw new Error(`${sample.name} returned ${response.status}`);
      }

      const blob = await response.blob();
      const size = await decodeImageSize(blob);
      const expectedMeta = `${size.width} x ${size.height}`;
      const expectedCanvas = expectedCanvasFromSize(size.width, size.height);
      const result = await uploadFileAndWait(
        sample.name,
        new File([blob], sample.name, { type: blob.type || mimeFromName(sample.name) }),
        expectedMeta,
        expectedCanvas,
      );

      return {
        ...result,
        sourceSize: size,
        metrics: canvasTextureMetrics(),
        reviewImages: captureRealPhotoGallery
          ? {
              originalPng: canvasPngDataUrl(".original-canvas"),
              processedPng: canvasPngDataUrl(".processed-canvas"),
            }
          : undefined,
      };
    }

    const page = {
      title: document.title,
      url: location.href,
      text: document.body.innerText.slice(0, 300),
      hasRoot: Boolean(document.querySelector("#root")),
      hasFrameworkOverlay: Boolean(document.querySelector("[data-vite-error-overlay], vite-error-overlay, nextjs-portal")),
    };

    if (!page.text.includes("纸质印刷照片处理")) {
      throw new Error("App shell text was not found.");
    }

    const fixtureNames = ["simple-still-life", "portrait", "street-lines", "low-contrast", "high-saturation"];
    const fixtures = {};

    for (const name of fixtureNames) {
      const response = await fetch(`/tests/fixtures/${name}.svg`);
      if (!response.ok) {
        throw new Error(`${name}.svg returned ${response.status}`);
      }
      fixtures[name] = await response.text();
    }

    const primaryUpload = await uploadSvg("simple-still-life", fixtures["simple-still-life"]);
    const previewModeResults = [];
    const initialPresetNames = presetNames();

    for (const mode of [
      { label: "原图", id: "original" },
      { label: "对比", id: "compare" },
      { label: "处理后", id: "processed" },
    ]) {
      const button = Array.from(document.querySelectorAll(".preview-mode-button")).find((item) =>
        item.textContent?.includes(mode.label),
      );
      if (!button) {
        throw new Error(`${mode.label} preview button was not found.`);
      }
      button.click();
      await waitFor(() => previewMode() === mode.id, `${mode.label} preview mode`);
      previewModeResults.push({
        label: mode.label,
        mode: previewMode(),
        processedCanvas: canvasInfo(".processed-canvas"),
        originalCanvas: canvasInfo(".original-canvas"),
      });
    }

    const presetResults = [];
    const defaultPresetButtons = Array.from(document.querySelectorAll(".preset"));

    for (const button of defaultPresetButtons) {
      const name = button.querySelector("span")?.textContent?.trim() ?? button.textContent?.trim() ?? "unknown";
      button.click();
      await waitFor(() => activePreset() === name && statusText().includes(`已应用 ${name}`), `${name} preset`);
      presetResults.push({ name, status: statusText(), active: activePreset(), canvas: canvasInfo() });
    }

    clickButtonByText("现实彩印");
    await waitFor(() => activePreset() === "现实彩印" && statusText().includes("已应用 现实彩印"), "现实彩印 preset");
    const realColorChannelNames = ["印刷青", "印刷品红", "印刷黄", "炭黑"];
    const requiredVisibleControlLabels = [
      "网点浓度",
      "分色模式",
      "纸张颜色",
      "网点大小",
      "启用半调",
      "墨点形状",
      "网点间距",
      "网点角度",
      "网点对比",
      "纸张颗粒",
      "纸张纤维",
      "纸面污渍",
      "纸面颗粒",
      "颗粒缩放",
      "颗粒柔度",
      "错版偏移",
      "随机错版",
      "亮度",
      "对比压缩",
      "色彩强度",
      "色阶数量",
      ...realColorChannelNames.flatMap((name) => [
        `${name} 色彩`,
        `${name} 浓度`,
        `${name} 角度`,
        `${name} X 偏移`,
        `${name} Y 偏移`,
      ]),
    ];
    const realColorPrintResult = {
      hasPreset: initialPresetNames.includes("现实彩印"),
      active: activePreset(),
      missingControlLabels: requiredVisibleControlLabels.filter((label) => !controlText(label)),
      channelMeta: Array.from(document.querySelectorAll(".inspector dd")).at(1)?.textContent?.trim() ?? "",
      separationMode: controlText("分色模式"),
      dotShape: controlText("墨点形状"),
      canvas: canvasInfo(),
    };

    const defaultGapProbe = inkAreaPaperGapRatio();
    setRangeControl("网点间距", "16");
    setRangeControl("网点大小", "0.5");
    await waitFor(
      () =>
        controlText("网点间距").includes("16px") &&
        controlText("网点大小").includes("0.50") &&
        statusText().startsWith("已应用"),
      "sparse CMYK halftone render",
    );
    const sparseGapProbe = inkAreaPaperGapRatio();
    realColorPrintResult.halftoneGapProbe = {
      default: defaultGapProbe,
      sparse: sparseGapProbe,
      spacing: controlText("网点间距"),
      dotSize: controlText("网点大小"),
    };
    clickButtonByText("现实彩印");
    await waitFor(() => activePreset() === "现实彩印" && controlText("网点大小").includes("4.00"), "restore real-color halftone");

    clickButtonByText("新增通道");
    await waitFor(
      () => (Array.from(document.querySelectorAll(".inspector dd")).at(1)?.textContent ?? "").includes("5 层通道网点"),
      "add channel",
    );
    const afterAddChannelMeta = Array.from(document.querySelectorAll(".inspector dd")).at(1)?.textContent?.trim() ?? "";
    const afterAddCustomControl = controlText("自定义通道 5 色彩");
    clickButtonByText("移除");
    await waitFor(
      () => (Array.from(document.querySelectorAll(".inspector dd")).at(1)?.textContent ?? "").includes("4 层通道网点"),
      "remove channel",
    );
    const channelCountResult = {
      afterAdd: afterAddChannelMeta,
      customControl: afterAddCustomControl,
      afterRemove: Array.from(document.querySelectorAll(".inspector dd")).at(1)?.textContent?.trim() ?? "",
    };
    clickButtonByText("现实彩印");
    await waitFor(() => activePreset() === "现实彩印", "reset real-color channel count");

    clickButtonByText("Warm Poster");
    await waitFor(() => activePreset() === "Warm Poster" && statusText().includes("已应用 Warm Poster"), "Warm Poster preset");

    const resetBaseline = {
      preset: activePreset(),
      previewMode: previewMode(),
      dotSize: controlText("网点大小"),
      paperColor: controlText("纸张颜色"),
      paper: paperMetaText(),
    };

    setRangeControl("网点大小", "0.5");
    await waitFor(
      () => Array.from(document.querySelectorAll(".control")).find((node) => node.textContent?.includes("网点大小"))?.textContent?.includes("0.50"),
      "halftone slider update",
    );
    const parameterResult = {
      label: controlText("网点大小"),
      status: statusText(),
      canvas: canvasInfo(),
    };

    setColorControl("纸张颜色", "#f8ead0");
    await waitFor(
      () => controlText("纸张颜色").includes("#F8EAD0"),
      "paper color update",
    );
    const paperColorResult = {
      label: controlText("纸张颜色"),
      paper: paperMetaText(),
      status: statusText(),
      canvas: canvasInfo(),
    };

    clickPreviewMode("对比");
    await waitFor(() => previewMode() === "compare", "compare mode before reset");
    const resetBefore = {
      preset: activePreset(),
      previewMode: previewMode(),
      dotSize: controlText("网点大小"),
      paperColor: controlText("纸张颜色"),
      paper: paperMetaText(),
    };

    clickButtonByText("重置");
    await waitFor(
      () =>
        previewMode() === "processed" &&
        controlText("网点大小") === resetBaseline.dotSize &&
        controlText("纸张颜色") === resetBaseline.paperColor &&
        paperMetaText() === resetBaseline.paper,
      "reset controls",
    );
    const resetResult = {
      before: resetBefore,
      after: {
        preset: activePreset(),
        previewMode: previewMode(),
        dotSize: controlText("网点大小"),
        paperColor: controlText("纸张颜色"),
        paper: paperMetaText(),
        status: statusText(),
        canvas: canvasInfo(),
      },
      expected: resetBaseline,
    };

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalClick = HTMLAnchorElement.prototype.click;
    const exportProbe = {};
    URL.createObjectURL = (blob) => {
      exportProbe.blobType = blob.type;
      exportProbe.blobSize = blob.size;
      return originalCreateObjectURL(blob);
    };
    HTMLAnchorElement.prototype.click = function () {
      exportProbe.download = this.download;
      exportProbe.hrefPrefix = this.href.slice(0, 5);
    };

    clickButtonByText("导出 PNG");
    await waitFor(() => statusText().startsWith("PNG 已导出") && exportProbe.blobType === "image/png", "PNG export", 20_000);

    URL.createObjectURL = originalCreateObjectURL;
    HTMLAnchorElement.prototype.click = originalClick;

    const exportResult = {
      status: statusText(),
      ...exportProbe,
    };

    setRangeControl("网点大小", "1.5");
    await waitFor(() => controlText("网点大小").includes("1.50"), "custom preset dot size update");
    setColorControl("纸张颜色", "#e8dcc5");
    await waitFor(() => controlText("纸张颜色").includes("#E8DCC5"), "custom preset paper color update");

    const customPresetName = "Smoke 自定义预设";
    const originalPrompt = window.prompt;
    try {
      window.prompt = () => customPresetName;
      clickButtonByText("保存当前参数");
    } finally {
      window.prompt = originalPrompt;
    }
    await waitFor(
      () => activePreset() === customPresetName && presetNames().includes(customPresetName),
      "custom preset save",
    );
    const storedAfterSave = customPresetStorage();
    const savedCustomSnapshot = {
      preset: activePreset(),
      dotSize: controlText("网点大小"),
      paperColor: controlText("纸张颜色"),
      storageCount: Array.isArray(storedAfterSave) ? storedAfterSave.length : -1,
      storedName: Array.isArray(storedAfterSave) ? storedAfterSave.at(-1)?.name : "",
      storedDotSize: Array.isArray(storedAfterSave) ? storedAfterSave.at(-1)?.halftone?.dotSize : null,
      storedPaperColor: Array.isArray(storedAfterSave) ? storedAfterSave.at(-1)?.paper?.baseColor : "",
    };

    clickButtonByText("Warm Poster");
    await waitFor(() => activePreset() === "Warm Poster" && statusText().includes("已应用 Warm Poster"), "Warm Poster after custom save");
    clickButtonByText(customPresetName);
    await waitFor(
      () =>
        activePreset() === customPresetName &&
        controlText("网点大小").includes("1.50") &&
        controlText("纸张颜色").includes("#E8DCC5"),
      "custom preset restore",
    );
    const restoredCustomSnapshot = {
      preset: activePreset(),
      dotSize: controlText("网点大小"),
      paperColor: controlText("纸张颜色"),
      status: statusText(),
      canvas: canvasInfo(),
    };

    const originalConfirm = window.confirm;
    try {
      window.confirm = () => true;
      clickButtonByText("清空自定义预设");
    } finally {
      window.confirm = originalConfirm;
    }
    await waitFor(
      () => !presetNames().includes(customPresetName) && activePreset() === "Soft Paper",
      "custom preset clear",
    );
    const clearCustomSnapshot = {
      preset: activePreset(),
      stillListed: presetNames().includes(customPresetName),
      stored: customPresetStorage(),
      status: statusText(),
    };
    const customPresetResult = {
      name: customPresetName,
      saved: savedCustomSnapshot,
      restored: restoredCustomSnapshot,
      cleared: clearCustomSnapshot,
    };

    const additionalFixtures = [];
    for (const name of fixtureNames.slice(1)) {
      additionalFixtures.push(await uploadSvg(name, fixtures[name]));
    }

    const badTransfer = new DataTransfer();
    const input = document.querySelector('input[type="file"]');
    badTransfer.items.add(new File(["not an image"], "not-image.txt", { type: "text/plain" }));
    input.files = badTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => statusText() === "请选择图片文件", "non-image error");
    const badFileResult = { status: statusText(), canvasStillPresent: Boolean(document.querySelector("canvas")) };

    const largeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000" viewBox="0 0 3000 2000"><rect width="3000" height="2000" fill="#f0dfba"/><circle cx="1200" cy="900" r="420" fill="#d84a24"/><rect x="1600" y="700" width="620" height="760" fill="#217b82" opacity=".8"/></svg>';
    const largeUpload = await uploadSvg("large-test", largeSvg);
    const realPhotoResults = [];

    if (realPhotoSamples.length > 0) {
      const warmPosterButton = Array.from(document.querySelectorAll(".preset")).find((button) =>
        button.textContent?.includes("Warm Poster"),
      );
      warmPosterButton?.click();
      await waitFor(() => activePreset() === "Warm Poster", "Warm Poster real-photo preset");

      for (const sample of realPhotoSamples) {
        realPhotoResults.push(await uploadRealPhoto(sample));
      }
    }

    return {
      page,
      primaryUpload,
      previewModeResults,
      initialPresetNames,
      presetResults,
      realColorPrintResult,
      channelCountResult,
      parameterResult,
      paperColorResult,
      resetResult,
      exportResult,
      customPresetResult,
      additionalFixtures,
      badFileResult,
      largeUpload,
      largeNoticeShown: largeUpload.status.includes("预览和导出会自动降采样"),
      realPhotoResults,
    };
  }})()`
    .replace("__REAL_PHOTO_SAMPLES__", realPhotoSamplesJson)
    .replace("__CAPTURE_REAL_PHOTO_GALLERY__", captureRealPhotoGalleryJson);
}

function realPhotoPresetGalleryExpression(realPhotoSamples = []) {
  const realPhotoSamplesJson = JSON.stringify(realPhotoSamples).replaceAll("<", "\\u003c");
  return `(${async () => {
    const realPhotoSamples = __REAL_PHOTO_SAMPLES__;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function waitFor(predicate, label, timeoutMs = 15_000) {
      const startedAt = performance.now();

      while (performance.now() - startedAt < timeoutMs) {
        const result = predicate();
        if (result) {
          return result;
        }
        await wait(100);
      }

      throw new Error(`Timed out waiting for ${label}`);
    }

    function statusText() {
      return document.querySelector(".status")?.textContent?.trim() ?? "";
    }

    function activePreset() {
      return document.querySelector(".preset.is-active span")?.textContent?.trim() ?? "";
    }

    function presetButtons() {
      return Array.from(document.querySelectorAll(".preset")).map((button) => ({
        button,
        name: button.querySelector("span")?.textContent?.trim() ?? button.textContent?.trim() ?? "unknown",
      }));
    }

    function canvasInfo(selector = ".processed-canvas") {
      const canvas = document.querySelector(selector) ?? document.querySelector("canvas");
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    }

    function imageMetaText() {
      return Array.from(document.querySelectorAll(".inspector dd")).at(2)?.textContent?.trim() ?? "";
    }

    function expectedCanvasFromSize(width, height) {
      if (!width || !height) {
        return null;
      }

      const scale = Math.min(1, 1200 / Math.max(width, height));
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
    }

    function mimeFromName(name) {
      const lower = name.toLowerCase();
      if (lower.endsWith(".png")) return "image/png";
      if (lower.endsWith(".webp")) return "image/webp";
      return "image/jpeg";
    }

    async function decodeImageSize(blob) {
      if ("createImageBitmap" in window) {
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
      }

      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    async function uploadFileAndWait(name, file, expectedMeta, expectedCanvas) {
      const input = document.querySelector('input[type="file"]');
      if (!input) {
        throw new Error("File input was not found.");
      }

      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      await waitFor(
        () => {
          const canvas = canvasInfo();
          const canvasMatches =
            !expectedCanvas || (canvas?.width === expectedCanvas.width && canvas?.height === expectedCanvas.height);
          return statusText().startsWith("已应用") && canvasMatches && (!expectedMeta || imageMetaText() === expectedMeta);
        },
        `${name} render`,
      );

      return {
        name,
        status: statusText(),
        canvas: canvasInfo(),
        imageMeta: imageMetaText(),
      };
    }

    function canvasPngDataUrl(selector) {
      const canvas = document.querySelector(selector);
      if (!canvas) {
        throw new Error(`${selector} canvas was not found.`);
      }

      return canvas.toDataURL("image/png");
    }

    function canvasTextureMetrics() {
      const sourceCanvas = document.querySelector(".processed-canvas") ?? document.querySelector("canvas");
      if (!sourceCanvas) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Could not create metrics canvas context.");
      }
      context.drawImage(sourceCanvas, 0, 0);
      const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 50_000)));
      const colors = new Set();
      let count = 0;
      let lumaSum = 0;
      let lumaSqSum = 0;
      let opaque = true;

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
          const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
          colors.add(`${r >> 5},${g >> 5},${b >> 5}`);
          opaque = opaque && a === 255;
          count += 1;
          lumaSum += luma;
          lumaSqSum += luma * luma;
        }
      }

      const lumaMean = lumaSum / count;
      const variance = Math.max(0, lumaSqSum / count - lumaMean * lumaMean);

      return {
        samples: count,
        coarseColors: colors.size,
        lumaMean: Number(lumaMean.toFixed(2)),
        lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
        opaque,
      };
    }

    async function uploadRealPhoto(sample) {
      const response = await fetch(sample.url);
      if (!response.ok) {
        throw new Error(`${sample.name} returned ${response.status}`);
      }

      const blob = await response.blob();
      const size = await decodeImageSize(blob);
      const expectedMeta = `${size.width} x ${size.height}`;
      const expectedCanvas = expectedCanvasFromSize(size.width, size.height);
      const result = await uploadFileAndWait(
        sample.name,
        new File([blob], sample.name, { type: blob.type || mimeFromName(sample.name) }),
        expectedMeta,
        expectedCanvas,
      );

      return {
        ...result,
        sourceSize: size,
      };
    }

    const buttons = presetButtons();
    if (buttons.length < 4) {
      throw new Error(`Expected at least four presets, found ${buttons.length}.`);
    }

    const items = [];
    for (const sample of realPhotoSamples) {
      const upload = await uploadRealPhoto(sample);
      const originalPng = canvasPngDataUrl(".original-canvas");
      const presets = [];

      for (const { button, name } of presetButtons()) {
        button.click();
        await waitFor(
          () => {
            const canvas = canvasInfo();
            return (
              activePreset() === name &&
              statusText().includes(`已应用 ${name}`) &&
              canvas?.width === upload.canvas.width &&
              canvas?.height === upload.canvas.height
            );
          },
          `${sample.name} ${name} preset render`,
        );

        presets.push({
          name,
          canvas: canvasInfo(),
          metrics: canvasTextureMetrics(),
          processedPng: canvasPngDataUrl(".processed-canvas"),
        });
      }

      items.push({
        name: sample.name,
        sourceSize: upload.sourceSize,
        canvas: upload.canvas,
        originalPng,
        presets,
      });
    }

    return {
      presetNames: buttons.map((item) => item.name),
      items,
    };
  }})()`.replace("__REAL_PHOTO_SAMPLES__", realPhotoSamplesJson);
}

async function readLayout(client) {
  return evaluate(
    client,
    `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        };
      };

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        topbar: rect(".topbar"),
        sidebar: rect(".sidebar"),
        stage: rect(".canvas-stage"),
        inspector: rect(".inspector"),
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollHeight: document.documentElement.scrollHeight,
        status: document.querySelector(".status")?.textContent?.trim() ?? "",
      };
    })()`,
  );
}

async function captureGalleryContactSheet(client, gallery, options = {}) {
  if (!gallery) {
    return null;
  }

  const width = options.width ?? 1440;
  const height = options.height ?? 1800;
  const galleryUrl = `${APP_URL}${toServedPath(gallery.index).slice(1)}`;
  await waitForFetch(galleryUrl);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.navigate", { url: galleryUrl });
  await sleep(1_000);
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  const contactSheet = join(gallery.directory, "contact-sheet.png");
  await writeFile(contactSheet, Buffer.from(screenshot.data, "base64"));
  gallery.contactSheet = contactSheet;
  gallery.url = galleryUrl;
  return gallery;
}

function summarizeLogs(events) {
  return events
    .filter((event) => event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded")
    .map((event) => {
      if (event.method === "Log.entryAdded") {
        return {
          level: event.params.entry.level,
          source: event.params.entry.source,
          text: event.params.entry.text,
        };
      }

      return {
        level: event.params.type,
        text: event.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
      };
    });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const chromePath = findChrome();
  const viteBin = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  const chromeProfile = await mkdtemp(join(tmpdir(), "paper-print-smoke-chrome-"));
  let devServer;
  let chrome;
  let client;

  try {
    const realPhotoSamples = await listRealPhotoSamples();
    devServer = runProcess(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(APP_PORT), "--strictPort"]);
    devServer.stdout.on("data", (chunk) => process.stdout.write(chunk));
    devServer.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitForFetch(APP_URL);

    chrome = runProcess(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${chromeProfile}`,
      "about:blank",
    ]);
    chrome.stderr.on("data", () => {});

    const target = await createBrowserTarget();
    client = createCdpClient(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.navigate", { url: APP_URL });
    await sleep(1_000);

    const appResult = await evaluate(
      client,
      pageSmokeExpression(realPhotoSamples, CAPTURE_REAL_PHOTO_GALLERY),
      RUN_REAL_PHOTOS ? 180_000 : 90_000,
    );
    const presetGalleryData = CAPTURE_REAL_PHOTO_PRESET_GALLERY
      ? await evaluate(client, realPhotoPresetGalleryExpression(realPhotoSamples), 240_000)
      : null;

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);
    const desktopLayout = await readLayout(client);

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 820,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(400);
    const mobileLayout = await readLayout(client);

    const logs = summarizeLogs(client.events);
    const errors = logs.filter((log) => log.level === "error");

    assert(appResult.page.title === "纸质印刷照片处理应用", "Unexpected document title.");
    assert(appResult.page.hasRoot, "React root was not present.");
    assert(!appResult.page.hasFrameworkOverlay, "Framework error overlay was present.");
    assert(appResult.primaryUpload.canvas?.width === 960, "Primary fixture did not render at expected width.");
    assert(appResult.previewModeResults.length === 3, "Preview mode controls were not exercised.");
    assert(
      appResult.previewModeResults.every(
        (item) =>
          item.processedCanvas?.width === item.originalCanvas?.width &&
          item.processedCanvas?.height === item.originalCanvas?.height,
      ),
      `Preview canvases were not size-aligned: ${JSON.stringify(appResult.previewModeResults)}`,
    );
    assert(appResult.initialPresetNames.includes("现实彩印"), "现实彩印 preset was not listed.");
    assert(appResult.initialPresetNames.includes("褪色彩印"), "褪色彩印 preset was not listed.");
    assert(appResult.presetResults.length >= 7, "Fewer than seven presets were exercised.");
    assert(appResult.realColorPrintResult.hasPreset, "现实彩印 preset was not present before custom presets.");
    assert(appResult.realColorPrintResult.active === "现实彩印", "现实彩印 preset did not become active.");
    assert(
      appResult.realColorPrintResult.missingControlLabels.length === 0,
      `Some preset parameters were still hidden: ${JSON.stringify(appResult.realColorPrintResult.missingControlLabels)}`,
    );
    assert(
      appResult.realColorPrintResult.channelMeta.includes("4 层通道网点"),
      `现实彩印 did not expose four channel layers: ${appResult.realColorPrintResult.channelMeta}`,
    );
    assert(
      appResult.realColorPrintResult.channelMeta.includes("CMYK 保真分色"),
      `现实彩印 did not use CMYK fidelity separation: ${appResult.realColorPrintResult.channelMeta}`,
    );
    assert(
      appResult.realColorPrintResult.separationMode.includes("CMYK 保真"),
      `现实彩印 separation mode was not exposed: ${appResult.realColorPrintResult.separationMode}`,
    );
    assert(appResult.realColorPrintResult.dotShape.includes("实心圆点"), "现实彩印 dot shape was not exposed as a visible parameter.");
    assert(
      appResult.realColorPrintResult.halftoneGapProbe.sparse.ratio >
        appResult.realColorPrintResult.halftoneGapProbe.default.ratio + 0.04 &&
        appResult.realColorPrintResult.halftoneGapProbe.sparse.ratio > 0.9,
      `Sparse CMYK halftone settings did not create visible paper gaps: ${JSON.stringify(
        appResult.realColorPrintResult.halftoneGapProbe,
      )}`,
    );
    assert(appResult.channelCountResult.afterAdd.includes("5 层通道网点"), "Adding a channel did not change the channel count.");
    assert(appResult.channelCountResult.customControl.includes("自定义通道 5"), "Added channel controls were not visible.");
    assert(appResult.channelCountResult.afterRemove.includes("4 层通道网点"), "Removing a channel did not change the channel count.");
    assert(appResult.parameterResult.label.includes("0.50"), "Parameter slider did not update.");
    assert(appResult.paperColorResult.label.includes("#F8EAD0"), "Paper color control did not update.");
    assert(appResult.paperColorResult.paper.includes("#F8EAD0"), "Paper metadata did not reflect paper color update.");
    assert(appResult.resetResult.before.previewMode === "compare", "Reset test did not start from compare mode.");
    assert(appResult.resetResult.after.previewMode === "processed", "Reset did not return preview mode to processed.");
    assert(
      appResult.resetResult.after.dotSize === appResult.resetResult.expected.dotSize,
      `Reset did not restore dot size: ${JSON.stringify(appResult.resetResult)}`,
    );
    assert(
      appResult.resetResult.after.paperColor === appResult.resetResult.expected.paperColor,
      `Reset did not restore paper color control: ${JSON.stringify(appResult.resetResult)}`,
    );
    assert(
      appResult.resetResult.after.paper === appResult.resetResult.expected.paper,
      `Reset did not restore paper metadata: ${JSON.stringify(appResult.resetResult)}`,
    );
    assert(appResult.exportResult.blobType === "image/png", "PNG export did not produce image/png.");
    assert(appResult.exportResult.blobSize > 0, "PNG export blob was empty.");
    assert(appResult.customPresetResult.saved.preset === "Smoke 自定义预设", "Custom preset did not become active after saving.");
    assert(appResult.customPresetResult.saved.storageCount === 1, "Custom preset was not written to localStorage.");
    assert(appResult.customPresetResult.saved.storedName === "Smoke 自定义预设", "Custom preset name was not persisted.");
    assert(appResult.customPresetResult.saved.storedDotSize === 1.5, "Custom preset dot size was not persisted.");
    assert(appResult.customPresetResult.saved.storedPaperColor === "#e8dcc5", "Custom preset paper color was not persisted.");
    assert(appResult.customPresetResult.restored.dotSize.includes("1.50"), "Custom preset did not restore dot size.");
    assert(appResult.customPresetResult.restored.paperColor.includes("#E8DCC5"), "Custom preset did not restore paper color.");
    assert(!appResult.customPresetResult.cleared.stillListed, "Custom preset remained in the preset list after clearing.");
    assert(
      Array.isArray(appResult.customPresetResult.cleared.stored) && appResult.customPresetResult.cleared.stored.length === 0,
      "Custom preset storage was not cleared.",
    );
    assert(appResult.badFileResult.status === "请选择图片文件", "Non-image upload did not show the expected error.");
    assert(
      appResult.largeUpload.canvas?.width === 1200 && appResult.largeUpload.canvas?.height === 800,
      `Large image was not downsampled for preview. Result: ${JSON.stringify(appResult.largeUpload)}`,
    );
    assert(appResult.largeNoticeShown, `Large-image downsampling notice was not shown. Status: ${appResult.largeUpload.status}`);
    if (RUN_REAL_PHOTOS) {
      assert(appResult.realPhotoResults.length === realPhotoSamples.length, "Not all real-photo samples were exercised.");
      for (const photo of appResult.realPhotoResults) {
        assert(photo.canvas?.width > 0 && photo.canvas?.height > 0, `${photo.name} did not produce a canvas.`);
        assert(photo.metrics?.opaque, `${photo.name} output was not fully opaque.`);
        assert(photo.metrics?.coarseColors >= 8, `${photo.name} output looked too flat: ${JSON.stringify(photo.metrics)}`);
        assert(photo.metrics?.lumaStdDev >= 4, `${photo.name} output had too little tonal variation: ${JSON.stringify(photo.metrics)}`);
      }
    }
    if (CAPTURE_REAL_PHOTO_PRESET_GALLERY) {
      assert(presetGalleryData?.items.length === realPhotoSamples.length, "Preset gallery did not cover all real photos.");
      assert(presetGalleryData.presetNames.length >= 7, "Preset gallery covered fewer than seven presets.");
      for (const item of presetGalleryData.items) {
        assert(item.presets.length === presetGalleryData.presetNames.length, `${item.name} did not cover all presets.`);
        for (const preset of item.presets) {
          assert(preset.canvas?.width > 0 && preset.canvas?.height > 0, `${item.name} ${preset.name} did not produce a canvas.`);
          assert(preset.metrics?.opaque, `${item.name} ${preset.name} output was not fully opaque.`);
          assert(
            preset.metrics?.coarseColors >= 4,
            `${item.name} ${preset.name} output looked too flat: ${JSON.stringify(preset.metrics)}`,
          );
          assert(
            preset.metrics?.lumaStdDev >= 2,
            `${item.name} ${preset.name} output had too little tonal variation: ${JSON.stringify(preset.metrics)}`,
          );
        }
      }
    }
    assert(!desktopLayout.hasHorizontalOverflow, "Desktop layout has horizontal overflow.");
    assert(!mobileLayout.hasHorizontalOverflow, "Mobile layout has horizontal overflow.");
    assert(
      desktopLayout.stage.top < desktopLayout.viewport.height,
      `Desktop canvas stage started below the first viewport: ${JSON.stringify(desktopLayout)}`,
    );
    assert(
      desktopLayout.stage.height <= desktopLayout.viewport.height,
      `Desktop canvas stage was stretched beyond the viewport by side panels: ${JSON.stringify(desktopLayout)}`,
    );
    assert(
      desktopLayout.documentScrollHeight <= desktopLayout.viewport.height + 1,
      `Desktop page should not require body scrolling when sidebars scroll independently: ${JSON.stringify(desktopLayout)}`,
    );
    assert(
      desktopLayout.inspector.scrollHeight > desktopLayout.inspector.clientHeight,
      `Inspector sidebar should have independent vertical scrolling: ${JSON.stringify(desktopLayout)}`,
    );
    assert(errors.length === 0, `Console errors were reported: ${JSON.stringify(errors)}`);

    const gallery = await captureGalleryContactSheet(
      client,
      await writeRealPhotoGallery(appResult.realPhotoResults, REAL_PHOTO_GALLERY_DIR),
    );
    const presetGallery = await captureGalleryContactSheet(
      client,
      await writeRealPhotoPresetGallery(presetGalleryData, REAL_PHOTO_PRESET_GALLERY_DIR),
      { width: 1800, height: 2200 },
    );

    const summary = {
      ok: true,
      appUrl: APP_URL,
      fixtures: [appResult.primaryUpload, ...appResult.additionalFixtures].map((item) => ({
        name: item.name,
        canvas: item.canvas,
        imageMeta: item.imageMeta,
      })),
      previewModes: appResult.previewModeResults.map((item) => item.mode),
      presets: appResult.presetResults.map((item) => item.name),
      realColorPrint: appResult.realColorPrintResult,
      channelCount: appResult.channelCountResult,
      parameter: appResult.parameterResult.label,
      paperColor: appResult.paperColorResult.label,
      reset: appResult.resetResult,
      export: {
        status: appResult.exportResult.status,
        type: appResult.exportResult.blobType,
        bytes: appResult.exportResult.blobSize,
        download: appResult.exportResult.download,
      },
      customPreset: appResult.customPresetResult,
      badFile: appResult.badFileResult.status,
      largeImage: {
        status: appResult.largeUpload.status,
        canvas: appResult.largeUpload.canvas,
      },
      realPhotos: appResult.realPhotoResults.map((photo) => ({
        name: photo.name,
        sourceSize: photo.sourceSize,
        canvas: photo.canvas,
        metrics: photo.metrics,
      })),
      gallery,
      presetGallery,
      layouts: {
        desktop: desktopLayout,
        mobile: mobileLayout,
      },
      consoleWarnings: logs.filter((log) => log.level === "warning" || log.level === "warn").length,
      consoleWarningSamples: logs.filter((log) => log.level === "warning" || log.level === "warn").slice(0, 3),
    };

    console.log(`SMOKE_RESULT ${JSON.stringify(summary, null, 2)}`);
  } finally {
    if (client) {
      client.close();
    }
    await stopProcess(chrome);
    await stopProcess(devServer);
    rmSync(chromeProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`SMOKE_FAILED ${error.stack ?? error.message}`);
  process.exit(1);
});
