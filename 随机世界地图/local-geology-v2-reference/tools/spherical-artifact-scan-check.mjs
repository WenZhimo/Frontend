import { spawnSync } from "node:child_process";

const FACE_SIZE = 16;
const STEPS = 120;
const SEEDS = 4;
const SAMPLE_EVERY = 20;
const failures = [];

const scan = runJson("artifact-scan", [
  "tools/artifact-scan.mjs",
  "--mode",
  "geology-v2",
  "--resolution",
  "256x128",
  "--steps",
  String(STEPS),
  "--seeds",
  String(SEEDS),
  "--sample-every",
  String(SAMPLE_EVERY),
  "--topology",
  "cubed-sphere",
  "--projection",
  "equirectangular",
  "--face-size",
  String(FACE_SIZE),
]);

expect(scan.valid, "artifact-scan command exits cleanly");
expect(scan.parsed?.topologyMode === "cubed-sphere", "artifact-scan preserves cubed-sphere topology");
expect(scan.parsed?.projectionMode === "equirectangular", "artifact-scan preserves projection mode");
expect(scan.parsed?.faceSize === FACE_SIZE, "artifact-scan preserves face size");
expect(scan.parsed?.steps === STEPS, "artifact-scan preserves step count");
expect(scan.parsed?.testedSeeds === SEEDS, "artifact-scan tests expected seed count");
expect(scan.parsed?.failedSeeds === 0, "artifact-scan reports no failed spherical seeds");

const worst = scan.parsed?.worstMetrics ?? {};
expect((worst.plateCheckerboardScore?.value ?? 0) < 0.025, "plate checkerboard risk remains below threshold");
expect((worst.coastHardBoundaryShare?.value ?? 0) < 0.45, "hard coast-boundary risk remains below threshold");
expect((worst.coastInactiveBoundaryShare?.value ?? 0) < 0.18, "inactive coast-boundary risk remains below threshold");
expect((worst.oldBoundaryReliefCorrelation?.value ?? 0) < 0.08, "old boundary relief correlation remains below threshold");

const result = {
  valid: failures.length === 0,
  topologyMode: "cubed-sphere",
  projectionMode: "equirectangular",
  faceSize: FACE_SIZE,
  steps: STEPS,
  testedSeeds: SEEDS,
  passedSeeds: scan.parsed?.passedSeeds ?? 0,
  failedSeeds: scan.parsed?.failedSeeds ?? null,
  artifactScanValid: scan.valid && scan.parsed?.failedSeeds === 0,
  failures,
  worstMetrics: {
    plateCheckerboardScore: worst.plateCheckerboardScore,
    coastBoundaryShare: worst.coastBoundaryShare,
    coastHardBoundaryShare: worst.coastHardBoundaryShare,
    coastInactiveBoundaryShare: worst.coastInactiveBoundaryShare,
    sedimentStraightnessRisk: worst.sedimentStraightnessRisk,
    oldBoundaryReliefCorrelation: worst.oldBoundaryReliefCorrelation,
    reliefDeficit: worst.reliefDeficit,
  },
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
  };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
