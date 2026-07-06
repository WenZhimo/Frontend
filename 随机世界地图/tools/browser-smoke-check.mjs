import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { parseBoolOption, parseIntOption, parseOptions } from "./lib/cli.mjs";

const { options } = parseOptions(process.argv.slice(2));
const root = resolve(options.root ?? ".");
const mode = String(options.mode ?? "file").toLowerCase();
const query = String(options.query ?? "");
const waitMs = parseIntOption(options, "wait-ms", 12000);
const steps = parseIntOption(options, "steps", 2);
const requireValidation = parseBoolOption(options, "require-validation");
const requireWriteback = parseBoolOption(options, "require-writeback");
const requirePerfSummary = parseBoolOption(options, "require-perf-summary");
const maxAverageRenderMs = parseIntOption(options, "max-average-render-ms", 0);
const maxLongTaskMs = parseIntOption(options, "max-long-task-ms", 0);
const chromePath = String(options.chrome ?? findChromePath());
const userDataDir = resolve(options["user-data-dir"] ?? ".test-cache/browser-smoke-profile");
const remoteDebuggingPort = parseIntOption(options, "remote-debugging-port", 9222);

if (!chromePath) {
  throw new Error("Chrome executable was not found. Pass --chrome <path>.");
}

let server = null;
let targetUrl;
if (mode === "http" || mode === "localhost") {
  server = await startStaticServer(root);
  targetUrl = `http://127.0.0.1:${server.port}/index.html${normalizeQuery(query)}`;
} else {
  targetUrl = `${pathToFileURL(join(root, "index.html")).href}${normalizeQuery(query)}`;
}

const chrome = spawn(chromePath, [
  `--remote-debugging-port=${remoteDebuggingPort}`,
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-popup-blocking",
  "--disable-extensions",
  "--autoplay-policy=no-user-gesture-required",
  "--headless=new",
  targetUrl,
], {
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});

try {
  const browserUrl = await waitForDevtoolsUrl(chrome, waitMs);
  const version = await fetchJson(`${browserUrl}/json/version`);
  const webSocketDebuggerUrl = version.webSocketDebuggerUrl;
  if (!webSocketDebuggerUrl) throw new Error("Chrome did not expose a browser websocket URL.");
  const ws = new WebSocket(webSocketDebuggerUrl);
  await waitForSocketOpen(ws, waitMs);
  const cdp = createCdpClient(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: targetUrl });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const consoleMessages = [];
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.sessionId !== sessionId) return;
    consoleMessages.push({
      type: event.params?.type ?? "log",
      text: (event.params?.args ?? []).map(formatRemoteArg).join(" "),
    });
  });
  cdp.on("Runtime.exceptionThrown", (event) => {
    if (event.sessionId !== sessionId) return;
    const details = event.params?.exceptionDetails;
    consoleMessages.push({
      type: "exception",
      text: details?.text ?? details?.exception?.description ?? "Runtime exception",
    });
  });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: targetUrl }, sessionId);
  await waitForPageLoad(cdp, sessionId, waitMs);

  const initial = await evaluate(cdp, sessionId, pageProbeScript());
  if (!initial.ok) throw new Error(`Page probe failed before play: ${initial.reason}`);

  await evaluate(cdp, sessionId, clickScript("#playPause"));
  await wait(waitMs);

  const afterPlay = await evaluate(cdp, sessionId, pageProbeScript({ requireStep: steps }));
  if (!afterPlay.ok) throw new Error(`Page probe failed after play: ${afterPlay.reason}`);

  let validation = null;
  if (requireValidation) {
    validation = await waitForValidation(cdp, sessionId, waitMs);
    if (!validation?.valid) {
      throw new Error(`GPU validation did not pass: ${JSON.stringify(validation)}`);
    }
    if (validation.skipped) {
      throw new Error(`GPU validation was skipped: ${JSON.stringify(validation)}`);
    }
    if (requireWriteback && !validation.writebackApplied) {
      throw new Error(`GPU experimental writeback did not occur: ${JSON.stringify(validation)}`);
    }
  }
  const performanceSummary = await evaluate(cdp, sessionId, "globalThis.__worldMapPerfSummary ?? null");
  assertPerformanceSummary(performanceSummary);

  const projectErrors = consoleMessages.filter((message) => isProjectError(message.text));
  if (projectErrors.length > 0) {
    throw new Error(`Browser console has project errors: ${JSON.stringify(projectErrors.slice(0, 8))}`);
  }

  console.log(JSON.stringify({
    valid: true,
    mode,
    url: targetUrl,
    canvas: afterPlay.canvas,
    step: afterPlay.step,
    performance: performanceSummary,
    gpuValidation: validation ? summarizeValidation(validation) : null,
    consoleSummary: summarizeConsole(consoleMessages),
  }, null, 2));
  await closeBrowserSafely(cdp);
} finally {
  chrome.kill();
  server?.close();
}

function normalizeQuery(value) {
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
}

function findChromePath() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];
  for (const candidate of candidates) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return "";
}

function startStaticServer(rootDir) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  const server = createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
      const filePath = resolve(join(rootDir, pathname));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const body = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mime[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      resolveServer({
        port: server.address().port,
        close: () => server.close(),
      });
    });
  });
}

function waitForDevtoolsUrl(proc, timeoutMs) {
  return new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Chrome DevTools URL.")), timeoutMs);
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      const wsUrl = new URL(match[1]);
      resolveUrl(`http://${wsUrl.host}`);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools was ready: ${code}`));
    });
  });
}

function fetchJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  });
}

function waitForSocketOpen(ws, timeoutMs) {
  return new Promise((resolveOpen, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening CDP websocket.")), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolveOpen();
    }, { once: true });
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(new Error(`CDP websocket failed: ${event?.message ?? "unknown"}`));
    }, { once: true });
  });
}

function createCdpClient(ws) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveMessage, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolveMessage(message.result ?? {});
      return;
    }
    const callbacks = listeners.get(message.method);
    if (callbacks) {
      for (const callback of callbacks) callback(message);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolveMessage, reject) => pending.set(id, { resolveMessage, reject }));
    },
    on(method, callback) {
      const callbacks = listeners.get(method) ?? [];
      callbacks.push(callback);
      listeners.set(method, callbacks);
    },
  };
}

function waitForPageLoad(cdp, sessionId, timeoutMs) {
  return Promise.race([
    new Promise((resolveLoad) => {
      cdp.on("Page.loadEventFired", (event) => {
        if (event.sessionId === sessionId) resolveLoad();
      });
    }),
    wait(timeoutMs),
  ]);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Evaluation failed.");
  }
  return result.result?.value;
}

function clickScript(selector) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return { ok: false, reason: "missing ${selector}" };
    node.click();
    return { ok: true };
  })()`;
}

function pageProbeScript({ requireStep = 0 } = {}) {
  return `(() => {
    const canvas = document.querySelector("#mapCanvas");
    if (!canvas) return { ok: false, reason: "missing canvas" };
    const ctx = canvas.getContext("2d");
    const step = Number(document.querySelector("#stepCount")?.textContent || "0");
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return { ok: false, reason: "zero canvas size" };
    if (step < ${requireStep}) return { ok: false, reason: "step did not advance", step };
    let nonBlank = true;
    let alphaSum = 0;
    let colorSpread = 0;
    if (ctx) {
      const image = ctx.getImageData(0, 0, w, h).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < image.length; i += 64) {
        const v = image[i] + image[i + 1] + image[i + 2];
        if (v < min) min = v;
        if (v > max) max = v;
        alphaSum += image[i + 3] || 0;
      }
      colorSpread = max - min;
      nonBlank = alphaSum > 0 && colorSpread > 12;
    }
    if (!nonBlank) return { ok: false, reason: "canvas appears blank", step, canvas: { w, h, alphaSum, colorSpread } };
    return { ok: true, step, canvas: { w, h, alphaSum, colorSpread } };
  })()`;
}

async function waitForValidation(cdp, sessionId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await evaluate(cdp, sessionId, "globalThis.__lastGpuComputeValidation ?? null");
    if (result) return result;
    await wait(250);
  }
  return null;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function closeBrowserSafely(cdp) {
  try {
    await Promise.race([
      cdp.send("Browser.close"),
      wait(2000),
    ]);
  } catch {
    // Chrome is already killed in finally; smoke output should not hang on teardown.
  }
}

function formatRemoteArg(arg) {
  if (arg?.value !== undefined) return String(arg.value);
  if (arg?.description) return arg.description;
  return "";
}

function isProjectError(text) {
  if (!text) return false;
  if (/React DevTools|gator\.volces\.com|ERR_BLOCKED_BY_CLIENT|favicon|^\[Violation\]/i.test(text)) return false;
  return /Uncaught|SyntaxError|TypeError|ReferenceError|Cannot read properties|Unexpected token|NaN|Infinity/i.test(text);
}

function summarizeConsole(messages) {
  const ignored = messages.filter((message) => !isProjectError(message.text)).length;
  const projectErrors = messages.filter((message) => isProjectError(message.text)).length;
  return {
    total: messages.length,
    ignored,
    projectErrors,
    gpu: messages.filter((message) => /\[gpu|\[render|\[gpu-compute/.test(message.text)).map((message) => message.text).slice(0, 8),
  };
}

function assertPerformanceSummary(summary) {
  if (!requirePerfSummary && !summary) return;
  if (!summary?.step?.count || !summary?.render?.count) {
    throw new Error(`Browser performance summary is missing step/render samples: ${JSON.stringify(summary)}`);
  }
  if (maxAverageRenderMs > 0 && summary.render.averageMs > maxAverageRenderMs) {
    throw new Error(`Average render time exceeded ${maxAverageRenderMs}ms: ${JSON.stringify(summary.render)}`);
  }
  if (maxLongTaskMs > 0 && summary.longTask?.maxMs > maxLongTaskMs) {
    throw new Error(`Long task exceeded ${maxLongTaskMs}ms: ${JSON.stringify(summary.longTask)}`);
  }
}

function summarizeValidation(validation) {
  return {
    valid: validation.valid,
    skipped: validation.skipped,
    skippedReason: validation.skippedReason ?? null,
    mode: validation.mode ?? null,
    writebackApplied: validation.writebackApplied ?? false,
    writebackFields: validation.writebackFields ?? [],
    fallbackReason: validation.fallbackReason ?? null,
    kernels: validation.kernels,
    candidateResults: validation.candidateResults?.map((candidate) => ({
      kernel: candidate.kernel,
      backend: candidate.backend,
      skipped: candidate.skipped,
      reason: candidate.reason ?? null,
      requestedFields: candidate.requestedFields ?? [],
      downloadedPacks: candidate.downloadedPacks ?? [],
      adapterInfo: candidate.adapterInfo ?? null,
      deviceInfo: candidate.deviceInfo ?? null,
      timings: candidate.timings ?? null,
    })) ?? [],
    fields: validation.fields?.map((field) => ({
      field: field.field,
      valid: field.valid,
      rmse: field.rmse,
      maxAbs: field.maxAbs,
      p95Abs: field.p95Abs,
    })) ?? [],
  };
}
