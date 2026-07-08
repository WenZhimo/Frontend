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
const postValidationWaitMs = parseIntOption(options, "post-validation-wait-ms", requireValidation ? 1000 : 0);
const requireWriteback = parseBoolOption(options, "require-writeback");
const requirePerfSummary = parseBoolOption(options, "require-perf-summary");
const requireReusedGpuContext = parseBoolOption(options, "require-reused-gpu-context");
const requireReusedGpuSetupZero = parseBoolOption(options, "require-reused-gpu-setup-zero");
const requireValidationThrottle = parseBoolOption(options, "require-validation-throttle");
const requiredGpuKernels = parseCsvOption(options, "require-gpu-kernels");
const requiredGpuFields = parseCsvOption(options, "require-gpu-fields", { normalize: false });
const requireValidationCount = Math.max(1, parseIntOption(options, "require-validation-count", 1));
const maxAverageStepMs = parseIntOption(options, "max-average-step-ms", 0);
const maxAverageRenderMs = parseIntOption(options, "max-average-render-ms", 0);
const maxLongTaskMs = parseIntOption(options, "max-long-task-ms", 0);
const maxGpuTotalMs = parseIntOption(options, "max-gpu-total-ms", 0);
const maxGpuCandidateMs = parseIntOption(options, "max-gpu-candidate-ms", 0);
const maxWarmGpuTotalMs = parseIntOption(options, "max-warm-gpu-total-ms", 0);
const maxWarmGpuCandidateMs = parseIntOption(options, "max-warm-gpu-candidate-ms", 0);
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
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
  await cdp.send("Page.navigate", { url: targetUrl }, sessionId);
  await waitForPageLoad(cdp, sessionId, waitMs);

  const initial = await evaluate(cdp, sessionId, pageProbeScript());
  if (!initial.ok) throw new Error(`Page probe failed before play: ${initial.reason}`);

  await evaluate(cdp, sessionId, clickScript("#playPause"));

  let validation = null;
  if (requireValidation) {
    validation = await waitForValidation(cdp, sessionId, waitMs, requireValidationCount);
    if (!validation?.valid) {
      throw new Error(`GPU validation did not pass: ${JSON.stringify({
        validation,
        page: await safePageProbe(cdp, sessionId),
        performance: await safeEvaluate(cdp, sessionId, "globalThis.__worldMapPerfSummary ?? null"),
        consoleSummary: summarizeConsole(consoleMessages),
      })}`);
    }
    if (validation.skipped && !(requireValidationThrottle && validationThrottleObserved(validation))) {
      throw new Error(`GPU validation was skipped: ${JSON.stringify(validation)}`);
    }
    if (requireWriteback && !validation.writebackApplied) {
      throw new Error(`GPU experimental writeback did not occur: ${JSON.stringify(validation)}`);
    }
    if ((validation.historyLength ?? 1) < requireValidationCount) {
      throw new Error(`GPU validation count did not reach ${requireValidationCount}: ${JSON.stringify(validation)}`);
    }
    if (requireValidationThrottle && !validationThrottleObserved(validation)) {
      throw new Error(`GPU validation throttle was not observed: ${JSON.stringify(validation)}`);
    }
    if (requireReusedGpuContext && !hasReusedGpuContext(validation)) {
      throw new Error(`GPU context reuse was not observed: ${JSON.stringify(validation)}`);
    }
    if (requireReusedGpuSetupZero && !reusedGpuSetupIsZero(validation)) {
      throw new Error(`Reused GPU contexts did not report zero setup cost: ${JSON.stringify(validation)}`);
    }
    const missingKernels = missingRequiredGpuKernels(validation, requiredGpuKernels);
    if (missingKernels.length > 0) {
      throw new Error(`Required GPU kernels were not observed (${missingKernels.join(", ")}): ${JSON.stringify(validation)}`);
    }
    const missingFields = missingRequiredGpuFields(validation, requiredGpuFields);
    if (missingFields.length > 0) {
      throw new Error(`Required GPU fields were not validated (${missingFields.join(", ")}): ${JSON.stringify(validation)}`);
    }
    assertWarmGpuTiming(validation);
    if (postValidationWaitMs > 0) await wait(postValidationWaitMs);
  } else {
    if (maxWarmGpuTotalMs > 0 || maxWarmGpuCandidateMs > 0) {
      throw new Error("Warm GPU timing gates require --require-validation so candidate history can be inspected.");
    }
    await wait(waitMs);
  }

  const afterPlay = await evaluate(cdp, sessionId, pageProbeScript({ requireStep: steps }));
  if (!afterPlay.ok) {
    throw new Error(`Page probe failed after play: ${JSON.stringify({
      probe: afterPlay,
      expectedStep: steps,
      performance: await safeEvaluate(cdp, sessionId, "globalThis.__worldMapPerfSummary ?? null"),
      validation: await safeEvaluate(cdp, sessionId, "globalThis.__lastGpuComputeValidation ?? null"),
      consoleSummary: summarizeConsole(consoleMessages),
    })}`);
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
    pageState: afterPlay.pageState ?? null,
    controlState: afterPlay.controlState ?? null,
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

function parseCsvOption(optionBag, name, { normalize = true } = {}) {
  const raw = optionBag[name];
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((value) => normalize ? normalizeKernelName(value.trim()) : value.trim())
    .filter(Boolean);
}

function normalizeKernelName(value) {
  if (!value) return "";
  const normalized = String(value).trim();
  if (normalized === "webgpu-local-fields" || normalized === "localTerrain") return "local-fields";
  if (normalized === "webgpu-margin-smooth" || normalized === "marginSmooth") return "margin-smooth";
  if (normalized === "webgpu-sediment-capacity" || normalized === "sedimentCapacity") return "sediment-capacity";
  if (normalized === "webgpu-isostasy") return "isostasy";
  if (normalized === "webgpu-elevation") return "elevation";
  return normalized;
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

async function safeEvaluate(cdp, sessionId, expression) {
  try {
    return await evaluate(cdp, sessionId, expression);
  } catch (error) {
    return { ok: false, reason: error?.message ?? "evaluation failed" };
  }
}

function safePageProbe(cdp, sessionId) {
  return safeEvaluate(cdp, sessionId, pageProbeScript());
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
    const runtimeState = globalThis.__worldMapRuntimeState ?? null;
    const controlState = {
      seedText: document.querySelector("#seedText")?.value ?? null,
      resolution: document.querySelector("#resolution")?.value ?? null,
      topologyMode: document.querySelector("#topologyMode")?.value ?? null,
      projectionMode: document.querySelector("#projectionMode")?.value ?? null,
    };
    return {
      ok: true,
      step,
      canvas: { w, h, alphaSum, colorSpread },
      pageState: runtimeState ?? controlState,
      controlState,
    };
  })()`;
}

async function waitForValidation(cdp, sessionId, timeoutMs, requiredCount = 1) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await evaluate(cdp, sessionId, `(() => {
      const history = globalThis.__gpuComputeValidationHistory ?? [];
      const latest = globalThis.__lastGpuComputeValidation ?? null;
      if (!latest) return null;
      if (history.length < ${Number(requiredCount)}) return null;
      return { ...latest, historyLength: history.length, history };
    })()`);
    if (result) return result;
    await wait(250);
  }
  return null;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function hasReusedGpuContext(validation) {
  const candidates = [
    ...(validation.candidateResults ?? []),
    ...(validation.history ?? []).flatMap((entry) => entry.candidateResults ?? []),
  ];
  return candidates.some((candidate) => !candidate.skipped && candidate.reusedContext === true);
}

function reusedGpuSetupIsZero(validation) {
  const candidates = collectCandidateResults(validation)
    .filter((candidate) => !candidate?.skipped && candidate?.reusedContext === true);
  return candidates.length > 0 && candidates.every((candidate) => Math.abs(Number(candidate.timings?.setupMs ?? 0)) <= 0.000001);
}

function missingRequiredGpuKernels(validation, requiredKernels) {
  if (!requiredKernels.length) return [];
  const observed = new Set();
  for (const candidate of collectCandidateResults(validation)) {
    if (candidate?.skipped) continue;
    const kernel = normalizeKernelName(candidate?.kernel);
    if (kernel) observed.add(kernel);
  }
  return requiredKernels.filter((kernel) => !observed.has(kernel));
}

function missingRequiredGpuFields(validation, requiredFields) {
  if (!requiredFields.length) return [];
  const observed = collectObservedGpuFields(validation);
  return requiredFields.filter((field) => !observed.has(field));
}

function collectObservedGpuFields(validation) {
  return new Set([
    ...(validation?.fields ?? []),
    ...(validation?.history ?? []).flatMap((entry) => entry?.fields ?? []),
  ]
    .filter((field) => field?.valid !== false)
    .map((field) => field.field)
    .filter(Boolean));
}

function validationThrottleObserved(validation) {
  if (validation?.throttled) return true;
  return (validation?.history ?? []).some((entry) => entry?.throttled);
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
  if (maxAverageStepMs > 0 && summary.step.averageMs > maxAverageStepMs) {
    throw new Error(`Average step time exceeded ${maxAverageStepMs}ms: ${JSON.stringify(summary.step)}`);
  }
  if (maxAverageRenderMs > 0 && summary.render.averageMs > maxAverageRenderMs) {
    throw new Error(`Average render time exceeded ${maxAverageRenderMs}ms: ${JSON.stringify(summary.render)}`);
  }
  if (maxLongTaskMs > 0 && summary.longTask?.maxMs > maxLongTaskMs) {
    throw new Error(`Long task exceeded ${maxLongTaskMs}ms: ${JSON.stringify(summary.longTask)}`);
  }
  const gpuTotal = summary.gpuCompute?.total;
  if (maxGpuTotalMs > 0 && gpuTotal?.maxMs > maxGpuTotalMs) {
    throw new Error(`GPU total path exceeded ${maxGpuTotalMs}ms: ${JSON.stringify(gpuTotal)}`);
  }
  const gpuCandidateTotal = summary.gpuCompute?.candidateTotal;
  if (maxGpuCandidateMs > 0 && gpuCandidateTotal?.maxMs > maxGpuCandidateMs) {
    throw new Error(`GPU candidate total exceeded ${maxGpuCandidateMs}ms: ${JSON.stringify(gpuCandidateTotal)}`);
  }
}

function assertWarmGpuTiming(validation) {
  if (maxWarmGpuTotalMs <= 0 && maxWarmGpuCandidateMs <= 0) return;
  const warmCandidates = collectCandidateResults(validation)
    .filter((candidate) => !candidate?.skipped && candidate?.reusedContext === true);
  if (!warmCandidates.length) {
    throw new Error(`Warm GPU timing gate requires at least one reused GPU candidate: ${JSON.stringify(validation)}`);
  }
  const totalViolations = maxWarmGpuTotalMs > 0
    ? warmCandidates.filter((candidate) => Number(candidate.timings?.totalGpuPathMs) > maxWarmGpuTotalMs)
    : [];
  if (totalViolations.length > 0) {
    throw new Error(`Warm GPU total path exceeded ${maxWarmGpuTotalMs}ms: ${JSON.stringify(summarizeCandidatesForError(totalViolations))}`);
  }
  const candidateViolations = maxWarmGpuCandidateMs > 0
    ? warmCandidates.filter((candidate) => Number(candidate.timings?.totalCandidateMs ?? candidate.timings?.totalGpuPathMs) > maxWarmGpuCandidateMs)
    : [];
  if (candidateViolations.length > 0) {
    throw new Error(`Warm GPU candidate total exceeded ${maxWarmGpuCandidateMs}ms: ${JSON.stringify(summarizeCandidatesForError(candidateViolations))}`);
  }
}

function collectCandidateResults(validation) {
  const historyCandidates = (validation?.history ?? []).flatMap((entry) => entry.candidateResults ?? []);
  if (historyCandidates.length > 0) return historyCandidates;
  return validation?.candidateResults ?? [];
}

function summarizeCandidatesForError(candidates) {
  return candidates.map((candidate) => ({
    kernel: candidate.kernel,
    backend: candidate.backend,
    reusedContext: candidate.reusedContext ?? false,
    timings: candidate.timings ?? null,
  }));
}

function summarizeValidation(validation) {
  const reusedGpuContextObserved = hasReusedGpuContext(validation);
  const observedGpuKernels = Array.from(new Set([
    ...(validation.candidateResults ?? []),
    ...(validation.history ?? []).flatMap((entry) => entry.candidateResults ?? []),
  ]
    .filter((candidate) => !candidate.skipped)
    .map((candidate) => normalizeKernelName(candidate.kernel))
    .filter(Boolean)));
  const observedGpuFields = Array.from(collectObservedGpuFields(validation));
  return {
    valid: validation.valid,
    skipped: validation.skipped,
    skippedReason: validation.skippedReason ?? null,
    mode: validation.mode ?? null,
    writebackApplied: validation.writebackApplied ?? false,
    writebackFields: validation.writebackFields ?? [],
    fallbackReason: validation.fallbackReason ?? null,
    throttled: validation.throttled ?? false,
    throttleReason: validation.throttleReason ?? null,
    suppressUntilStep: validation.suppressUntilStep ?? null,
    throttleCount: validation.throttleCount ?? 0,
    kernels: validation.kernels,
    validationTimings: validation.validationTimings ?? null,
    historyLength: validation.historyLength ?? null,
    reusedGpuContextObserved,
    observedGpuKernels,
    observedGpuFields,
    history: validation.history?.map((entry) => ({
      valid: entry.valid,
      skipped: entry.skipped,
      throttled: entry.throttled ?? false,
      throttleReason: entry.throttleReason ?? null,
      suppressUntilStep: entry.suppressUntilStep ?? null,
      throttleCount: entry.throttleCount ?? 0,
      mode: entry.mode ?? null,
      validationTimings: entry.validationTimings ?? null,
      writebackApplied: entry.writebackApplied ?? false,
      writebackFields: entry.writebackFields ?? [],
      candidateResults: entry.candidateResults?.map((candidate) => ({
        kernel: candidate.kernel,
        backend: candidate.backend,
        skipped: candidate.skipped,
        reason: candidate.reason ?? null,
        requestedFields: candidate.requestedFields ?? [],
        downloadedPacks: candidate.downloadedPacks ?? [],
        adapterInfo: candidate.adapterInfo ?? null,
        deviceInfo: candidate.deviceInfo ?? null,
        reusedContext: candidate.reusedContext ?? false,
        timings: candidate.timings ?? null,
      })) ?? [],
    })) ?? [],
    candidateResults: validation.candidateResults?.map((candidate) => ({
      kernel: candidate.kernel,
      backend: candidate.backend,
      skipped: candidate.skipped,
      reason: candidate.reason ?? null,
      requestedFields: candidate.requestedFields ?? [],
      downloadedPacks: candidate.downloadedPacks ?? [],
      adapterInfo: candidate.adapterInfo ?? null,
      deviceInfo: candidate.deviceInfo ?? null,
      reusedContext: candidate.reusedContext ?? false,
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
