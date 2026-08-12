#!/usr/bin/env node
/*
  Determinism stress test for the terminal chess app.

  Defaults:
    - 100 random 100-character ASCII seeds
    - 5 complete matches per seed
    - 10s per AI move before the current side forfeits by timeout

  Optional environment variables:
    SEED_COUNT=100
    RUNS_PER_SEED=5
    MOVE_TIMEOUT_MS=10000
    MATCH_TIMEOUT_MS=120000
    OUTPUT=path/to/report.json
    MATCH_MODE=deterministic
    CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
*/

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Playwright is required. Run with an environment where require('playwright') is available.");
  console.error("In Codex runtime, set NODE_PATH to the bundled node_modules if needed.");
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(__dirname, "..");
const APP_URL = pathToFileURL(path.join(PROJECT_ROOT, "index.html")).href;
const PRINTABLE_ASCII_START = 32;
const PRINTABLE_ASCII_COUNT = 95;
const DEFAULT_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const config = {
  seedCount: readPositiveInt("SEED_COUNT", 100),
  runsPerSeed: readPositiveInt("RUNS_PER_SEED", 5),
  moveTimeoutMs: readPositiveInt("MOVE_TIMEOUT_MS", 10000),
  matchTimeoutMs: readPositiveInt("MATCH_TIMEOUT_MS", 120000),
  output: process.env.OUTPUT || path.join(PROJECT_ROOT, "test-results", `determinism-${timestamp()}.json`),
  mode: process.env.MATCH_MODE || "deterministic",
  chromePath: process.env.CHROME_PATH || DEFAULT_CHROME,
};

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function randomAsciiSeed(length = 100) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => String.fromCharCode(PRINTABLE_ASCII_START + (byte % PRINTABLE_ASCII_COUNT))).join("");
}

function stableComparable(match) {
  return match.signature;
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function createPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
  page.on("pageerror", (error) => console.error("[pageerror]", error.message));
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.__dotChessTest && window.__dotChessTest.runMatch, null, { timeout: 10000 });
  return page;
}

async function runOneMatch(browser, seed, runIndex) {
  const page = await createPage(browser);
  try {
    const match = await withTimeout(
      page.evaluate(
        ({ seed: pageSeed, moveTimeoutMs, mode }) => window.__dotChessTest.runMatch(pageSeed, { moveTimeoutMs, mode }),
        { seed, moveTimeoutMs: config.moveTimeoutMs, mode: config.mode },
      ),
      config.matchTimeoutMs,
      `seed run ${runIndex}`,
    );
    return match;
  } catch (error) {
    return {
      seed,
      seedLength: seed.length,
      ply: 0,
      players: { white: null, black: null },
      moves: [],
      moveRecords: [],
      result: error.message,
      resultReason: "harness-timeout",
      winnerSide: null,
      timeoutSide: null,
      signature: JSON.stringify({ seed, resultReason: "harness-timeout", error: error.message }),
      durationMs: config.matchTimeoutMs,
      moveTimeoutMs: config.moveTimeoutMs,
      mode: config.mode,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const startedAt = Date.now();
  const seeds = Array.from({ length: config.seedCount }, () => randomAsciiSeed(100));
  const browserOptions = { headless: true };
  if (fs.existsSync(config.chromePath)) browserOptions.executablePath = config.chromePath;
  const browser = await chromium.launch(browserOptions);
  const report = {
    generatedAt: new Date(startedAt).toISOString(),
    appUrl: APP_URL,
    config,
    seeds: [],
    summary: {
      totalSeeds: config.seedCount,
      runsPerSeed: config.runsPerSeed,
      identicalSeeds: 0,
      mismatchedSeeds: 0,
      timeoutLosses: 0,
      harnessTimeouts: 0,
      reasons: {},
    },
  };

  try {
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
      const seed = seeds[seedIndex];
      const runs = [];
      console.log(`[${seedIndex + 1}/${seeds.length}] running ${config.runsPerSeed} matches`);

      for (let runIndex = 0; runIndex < config.runsPerSeed; runIndex += 1) {
        const match = await runOneMatch(browser, seed, runIndex + 1);
        runs.push(match);
        const reason = match.resultReason || "unknown";
        report.summary.reasons[reason] = (report.summary.reasons[reason] || 0) + 1;
        if (match.resultReason === "timeout") report.summary.timeoutLosses += 1;
        if (match.resultReason === "harness-timeout") report.summary.harnessTimeouts += 1;
        console.log(`  run ${runIndex + 1}: ${reason}, ply ${match.ply}, ${match.result}`);
      }

      const baseline = stableComparable(runs[0]);
      const identical = runs.every((run) => stableComparable(run) === baseline);
      if (identical) report.summary.identicalSeeds += 1;
      else report.summary.mismatchedSeeds += 1;

      report.seeds.push({
        index: seedIndex + 1,
        seed,
        seedLength: seed.length,
        identical,
        baselineSignature: baseline,
        runs,
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt;
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, JSON.stringify(report, null, 2));

  console.log(`\nReport written to: ${config.output}`);
  console.log(JSON.stringify(report.summary, null, 2));

  if (report.summary.mismatchedSeeds > 0 || report.summary.harnessTimeouts > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});