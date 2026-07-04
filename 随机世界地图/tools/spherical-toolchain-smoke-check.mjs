import { spawnSync } from "node:child_process";

const FACE_SIZE = 16;
const SEED_TEXT = "龙骨海-纪元7";
const failures = [];

const artifactScan = runJson("artifact-scan", [
  "tools/artifact-scan.mjs",
  "--mode",
  "geology-v2",
  "--resolution",
  "256x128",
  "--steps",
  "0",
  "--seeds",
  "1",
  "--sample-every",
  "1",
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(FACE_SIZE),
]);

const perfProfile = runJson("perf-profile", [
  "tools/perf-profile.mjs",
  SEED_TEXT,
  "geology-v2",
  "256x128",
  "5",
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(FACE_SIZE),
]);

expect(artifactScan.valid, "artifact-scan command exits cleanly");
expect(artifactScan.parsed?.topologyMode === "cubed-sphere", "artifact-scan preserves cubed-sphere topology");
expect(artifactScan.parsed?.projectionMode === "equirectangular", "artifact-scan preserves projection mode");
expect(artifactScan.parsed?.faceSize === FACE_SIZE, "artifact-scan preserves face size");
expect(artifactScan.parsed?.testedSeeds === 1, "artifact-scan tests one smoke seed");
expect(artifactScan.parsed?.failedSeeds === 0, "artifact-scan zero-step smoke does not report failures");

expect(perfProfile.valid, "perf-profile command exits cleanly");
expect(perfProfile.parsed?.topologyMode === "cubed-sphere", "perf-profile preserves cubed-sphere topology");
expect(perfProfile.parsed?.projectionMode === "equirectangular", "perf-profile preserves projection mode");
expect(perfProfile.parsed?.faceSize === FACE_SIZE, "perf-profile preserves face size");
expect(Array.isArray(perfProfile.parsed?.geologyStageTimings), "perf-profile returns stage timing array");
expect((perfProfile.parsed?.geologyStageTimings?.length ?? 0) > 0, "perf-profile records geology stage timings");

const result = {
  valid: failures.length === 0,
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize: FACE_SIZE,
  artifactScanValid: artifactScan.valid && artifactScan.parsed?.failedSeeds === 0,
  perfProfileValid: perfProfile.valid && Array.isArray(perfProfile.parsed?.geologyStageTimings),
  failures,
  artifactScan: compactArtifactScan(artifactScan.parsed),
  perfProfile: compactPerfProfile(perfProfile.parsed),
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function runJson(name, args) {
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = String(child.stdout ?? "").trim();
  const stderr = String(child.stderr ?? "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch (error) {
    failures.push(`${name}: JSON parse failed (${error.message})`);
  }
  if (child.status !== 0) {
    failures.push(`${name}: exited with ${child.status}${stderr ? `: ${stderr.slice(0, 300)}` : ""}`);
  }
  return {
    valid: child.status === 0 && Boolean(parsed),
    parsed,
    stderr,
  };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function compactArtifactScan(parsed) {
  if (!parsed) return null;
  return {
    mode: parsed.mode,
    resolution: parsed.resolution,
    topologyMode: parsed.topologyMode,
    projectionMode: parsed.projectionMode,
    faceSize: parsed.faceSize,
    steps: parsed.steps,
    testedSeeds: parsed.testedSeeds,
    failedSeeds: parsed.failedSeeds,
  };
}

function compactPerfProfile(parsed) {
  if (!parsed) return null;
  return {
    pipelineMode: parsed.pipelineMode,
    resolution: parsed.resolution,
    topologyMode: parsed.topologyMode,
    projectionMode: parsed.projectionMode,
    faceSize: parsed.faceSize,
    steps: parsed.steps,
    averageStepMs: parsed.averageStepMs,
    stageCount: parsed.geologyStageTimings?.length ?? 0,
  };
}
